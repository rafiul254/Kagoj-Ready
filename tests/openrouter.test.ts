import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../src/lib/ai/openrouter";
import type { ValidatedImage } from "../src/lib/validate-image";

const image = {
  bytes: Buffer.from("test"),
  mimeType: "image/jpeg",
} as ValidatedImage;

// Mimics a .env.local copied from .env.example: model keys present but empty.
const env = {
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_MODEL: "",
  OPENROUTER_FALLBACK_MODEL: "",
};

const identification = {
  readable: true,
  documentType: "passport",
  reason: null,
};

function okResponse(content: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { total_tokens: 40 },
    }),
  };
}
function statusResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  };
}
const bodyOf = (call: unknown[]) =>
  JSON.parse((call[1] as RequestInit).body as string) as { model: string };

afterEach(() => vi.unstubAllGlobals());

describe("OpenRouterProvider", () => {
  it("treats an empty OPENROUTER_MODEL from a copied .env.example as the built-in default", async () => {
    const fetchMock = vi.fn(async () => okResponse(identification));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    const result = await provider.identifyDocument(image, "bn");
    expect(result.readable).toBe(true);
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe(
      "google/gemma-4-31b-it:free",
    );
  });

  it("walks the fallback pool across different upstream vendors when models rate-limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(429, "Provider returned error"))
      .mockResolvedValueOnce(statusResponse(429, "Provider returned error"))
      .mockResolvedValueOnce(okResponse(identification));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    const result = await provider.identifyDocument(image, "bn");
    expect(result.documentType).toBe("passport");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe(
      "google/gemma-4-31b-it:free",
    );
    expect(bodyOf(fetchMock.mock.calls[1]).model).toBe(
      "nvidia/nemotron-3.5-super-vl:free",
    );
    expect(bodyOf(fetchMock.mock.calls[2]).model).toBe(
      "google/gemma-4-26b-a4b-it:free",
    );
  });

  it("stops after the first success without probing the rest of the pool", async () => {
    const fetchMock = vi.fn(async () => okResponse(identification));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    await provider.identifyDocument(image, "bn");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("salvages a fenced JSON answer without spending a second model call", async () => {
    const fenced = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '```json\n{"readable":true,"documentType":"passport","reason":null}\n```',
            },
            finish_reason: "stop",
          },
        ],
        usage: { total_tokens: 40 },
      }),
    };
    const fetchMock = vi.fn(async () => fenced);
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    const result = await provider.identifyDocument(image, "bn");
    expect(result.documentType).toBe("passport");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("walks the pool when a model returns malformed output", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse("I could not read this document."))
      .mockResolvedValueOnce(okResponse(identification));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    const result = await provider.identifyDocument(image, "bn");
    expect(result.documentType).toBe("passport");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1]).model).toBe(
      "nvidia/nemotron-3.5-super-vl:free",
    );
  });

  it("fails with INVALID_OUTPUT only after every pool model failed to produce valid JSON", async () => {
    const fetchMock = vi.fn(async () => okResponse("prose only, no object"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    await expect(provider.identifyDocument(image, "bn")).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry failures that a second model cannot fix", async () => {
    const fetchMock = vi.fn(async () => okResponse({ readable: 42 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider(env);
    await expect(provider.identifyDocument(image, "bn")).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("stays unconfigured without a key, even with empty model lines", () => {
    expect(() => new OpenRouterProvider({ OPENROUTER_API_KEY: "" })).toThrow();
  });
});
