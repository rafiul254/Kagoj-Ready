import { describe, it, expect, vi } from "vitest";
import { GeminiProvider, type GenerateClient } from "../src/lib/ai/gemini";
import { SafeError, safeCode } from "../src/lib/errors";
const env = {
  GEMINI_API_KEY: "test-not-a-secret",
  GEMINI_MODEL: "model-from-env",
};
const image = {
  bytes: Buffer.from("synthetic-test"),
  mimeType: "image/jpeg" as const,
};
function harness(
  response: unknown = {
    text: JSON.stringify({ documentType: "nid", readable: true, reason: null }),
    candidates: [{ finishReason: "STOP" }],
    usageMetadata: { totalTokenCount: 80 },
  },
) {
  const generate = vi.fn().mockResolvedValue(response);
  const count = vi.fn().mockResolvedValue({ totalTokens: 100 });
  const client = {
    models: { generateContent: generate, countTokens: count },
  } as unknown as GenerateClient;
  return { provider: new GeminiProvider(env, client), generate, count, client };
}
describe("Gemini adapter safety with a mocked SDK transport (no live accuracy)", () => {
  it("fails closed if key or model absent", () => {
    expect(() => new GeminiProvider({})).toThrow(SafeError);
    expect(() => new GeminiProvider({ GEMINI_API_KEY: "test" })).toThrow(
      SafeError,
    );
  });
  it("uses configured model, schema and language; image text is untrusted", async () => {
    const { provider, generate } = harness();
    await provider.identifyDocument(image, "bn");
    const call = generate.mock.calls[0][0];
    expect(call.model).toBe("model-from-env");
    expect(call.config.systemInstruction).toContain("UNTRUSTED DATA");
    expect(call.config.systemInstruction).toContain("Output language: bn");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema.type).toBe("object");
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(provider.usage()).toEqual({ modelCalls: 1, totalTokens: 80 });
  });
  it("never sends systemInstruction or tools to countTokens (Developer API rejects them)", async () => {
    const { provider, count } = harness();
    await provider.identifyDocument(image, "bn");
    const config = count.mock.calls[0][0].config;
    expect(config).not.toHaveProperty("systemInstruction");
    expect(config).not.toHaveProperty("tools");
    // The system text is still counted, as an ordinary prompt part.
    const parts = count.mock.calls[0][0].contents[0].parts;
    expect(parts[0].text).toContain("UNTRUSTED DATA");
  });
  it("does not retry malformed JSON until a desired answer appears", async () => {
    const { provider, generate } = harness({
      text: "{bad json",
      candidates: [{ finishReason: "STOP" }],
    });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("does not retry schema-inconsistent output", async () => {
    const { provider, generate } = harness({
      text: '{"documentType":"other","readable":true,"reason":null}',
      candidates: [{ finishReason: "STOP" }],
    });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("retries a transient 503 once only", async () => {
    const { provider, generate } = harness();
    generate.mockRejectedValue({ status: 503, message: "sensitive text" });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not retry quota exhaustion or leak provider errors", async () => {
    const { provider, generate } = harness();
    generate.mockRejectedValue({
      status: 429,
      message: "private document text",
    });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "QUOTA",
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("attaches a sanitized status detail without secrets", async () => {
    const { provider, generate } = harness();
    generate.mockRejectedValue({
      status: 403,
      message:
        "API key not valid. Please pass a valid API key. AIzaABCDEF1234567890abcdef",
    });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      detail: expect.stringContaining("HTTP 403"),
    });
    await expect(
      provider
        .identifyDocument(image, "en")
        .catch((e: SafeError) => e.detail ?? ""),
    ).resolves.not.toMatch(/AIza/);
  });
  it("enforces the token budget before model generation", async () => {
    const { provider, count, generate } = harness();
    count.mockResolvedValue({ totalTokens: 20000 });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "TOKEN_BUDGET",
    });
    expect(generate).not.toHaveBeenCalled();
  });
  it("enforces maximum four generation calls per document", async () => {
    const { provider, generate } = harness();
    for (let i = 0; i < 4; i++) await provider.identifyDocument(image, "en");
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "TOKEN_BUDGET",
    });
    expect(generate).toHaveBeenCalledTimes(4);
  });
  it("rejects truncated output", async () => {
    const { provider } = harness({
      text: "{}",
      candidates: [{ finishReason: "MAX_TOKENS" }],
    });
    await expect(provider.identifyDocument(image, "en")).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });
  it("maps cancellation without returning private exceptions", async () => {
    const { provider, count } = harness();
    count.mockRejectedValue(new Error("sensitive image description"));
    const abort = new AbortController();
    abort.abort();
    await expect(
      provider.identifyDocument(image, "en", abort.signal),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("returns only allowlisted error codes", () => {
    expect(safeCode(new Error("name and identity number"))).toBe(
      "PROVIDER_UNAVAILABLE",
    );
  });
});
