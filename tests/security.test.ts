import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CaseBudget,
  createCaseBudget,
  getCaseBudget,
} from "../src/lib/agent/budget";
import { consumeRequest, assertProductionLimits } from "../src/lib/rate-limit";
import { reportHtml } from "../src/lib/report-export";
import { resumeAfterConfirmation } from "../src/lib/agent/report";
import { sampleDoc } from "./helpers/fixtures";
import { scoreConflicts } from "../src/lib/evaluation";
import samples from "../src/data/samples.json";
import { manifestSchema } from "../src/lib/schemas";
import { AgentGeminiProvider } from "../src/lib/agent/provider";
import type { GenerateClient } from "../src/lib/ai/gemini";
import { recordedProvider } from "../src/lib/agent/recorded";
import { POST as agentPost } from "../src/app/api/agent/route";
import { readAgentStream } from "../src/lib/agent/client";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const context = {
  service: "passport",
  ageBand: "20_plus",
  applicationType: "first_time",
  location: "bangladesh",
} as const;
describe("Security, budgets and honest evaluation", () => {
  it("limits opaque document slots to three", () => {
    const b = new CaseBudget();
    b.claimDocument("a");
    b.claimDocument("b");
    b.claimDocument("c");
    expect(() => b.claimDocument("d")).toThrow("INVALID_REQUEST");
    expect(() => b.claimDocument("b")).not.toThrow();
  });
  it("fails closed for an unknown case token", async () => {
    await expect(
      getCaseBudget("00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("enforces in-memory per-IP limits", async () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "1");
    const now = Date.UTC(2030, 0, 1);
    await consumeRequest("test-ip-a", now);
    await expect(consumeRequest("test-ip-a", now + 1)).rejects.toMatchObject({
      code: "REQUEST_LIMIT",
    });
  });
  it("enforces the per-process daily cap independently of IP", async () => {
    vi.stubEnv("DAILY_REQUEST_CAP", "1");
    const now = Date.UTC(2030, 0, 2);
    await consumeRequest("test-ip-b", now);
    await expect(consumeRequest("test-ip-c", now + 1)).rejects.toMatchObject({
      code: "REQUEST_LIMIT",
    });
  });
  it("blocks live Vercel processing without shared limits by default", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(() => assertProductionLimits()).toThrow("NOT_CONFIGURED");
  });
  it("does not manufacture a recorded run", () => {
    expect(
      recordedProvider(manifestSchema.parse(samples).fixtures[0]),
    ).toBeNull();
  });
  it("escapes malicious field text and exports only masked identity values", async () => {
    const a = await sampleDoc("baseline");
    a.extraction.fields.address.rawValue = "<script>alert(1)</script>";
    const report = resumeAfterConfirmation(context, [a], "en");
    const html = reportHtml(
      report,
      "https://example.test",
      "data:image/svg+xml;base64,AA==",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("SAMPLE-000001");
    expect(html).toContain("not an official government service");
    expect(html).toContain("PLACEHOLDER");
  });
  it("counts failed expected conflicts against recall without inventing precision", () => {
    const metrics = scoreConflicts([], manifestSchema.parse(samples).conflicts);
    expect(metrics.falseNegatives).toBe(2);
    expect(metrics.recall).toBe(0);
    expect(metrics.precision).toBeNull();
    expect(
      scoreConflicts([], manifestSchema.parse(samples).conflicts, true).recall,
    ).toBeNull();
  });
  it("accepts only an allowed model function call with eligible arguments", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      functionCalls: [
        { name: "refineExtraction", args: { fieldKey: "name_en" } },
      ],
      usageMetadata: { totalTokenCount: 50 },
    });
    const client = {
      models: {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
        generateContent,
      },
    } as unknown as GenerateClient;
    const budget = new CaseBudget();
    const provider = new AgentGeminiProvider(
      budget,
      { GEMINI_API_KEY: "not-real", GEMINI_MODEL: "from-env" },
      client,
    );
    expect(await provider.chooseExtractionTool(["name_en"], "en")).toEqual({
      name: "refineExtraction",
      args: { fieldKey: "name_en" },
    });
    expect(budget.steps).toBe(1);
    expect(provider.usage().modelCalls).toBe(1);
    generateContent.mockResolvedValue({
      functionCalls: [{ name: "generateReport", args: {} }],
    });
    await expect(
      provider.chooseExtractionTool(["name_en"], "bn"),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
  it("streams a fixture through the real route, retaining explicit non-live mode", async () => {
    const id = await createCaseBudget();
    const request = new Request("https://example.test/api/agent", {
      method: "POST",
      headers: {
        host: "example.test",
        origin: "https://example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        caseId: id,
        documentId: "doc-1",
        language: "en",
        context,
        consent: true,
        sampleId: "baseline",
        sampleMode: "synthetic_fixture",
      }),
    });
    const response = await agentPost(request);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const events: unknown[] = [];
    const result = await readAgentStream(
      response,
      (e) => events.push(e),
      () => {},
    );
    expect(result.document?.mode).toBe("synthetic_fixture");
    expect(result.budget.steps).toBe(0);
    expect(events.length).toBeGreaterThan(0);
  });
});
it("shared rate cap is atomic-protocol checked and never sends a raw IP", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://store.example.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-token");
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ result: 0 }));
  await expect(consumeRequest("private-ip-example")).rejects.toMatchObject({
    code: "REQUEST_LIMIT",
  });
  const body = String(fetchMock.mock.calls[0][1]?.body);
  expect(body).toContain("EVAL");
  expect(body).not.toContain("private-ip-example");
});
it("shared budgets enforce returned exhaustion and retain no document content", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://store.example.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-token");
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ result: 1 }))
    .mockResolvedValueOnce(
      Response.json({ result: ["steps", "0", "tokens", "0"] }),
    )
    .mockResolvedValueOnce(Response.json({ result: [1, 200] }))
    .mockResolvedValueOnce(Response.json({ result: [-2, 0] }));
  const id = await createCaseBudget();
  const budget = await getCaseBudget(id);
  await budget.reserve(200);
  expect(budget.summary().steps).toBe(1);
  await expect(budget.reserve(60000)).rejects.toMatchObject({
    code: "TOKEN_BUDGET",
  });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
it("personal-upload failures never receive synthetic document data", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
  const { readFile } = await import("node:fs/promises");
  const id = await createCaseBudget();
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      caseId: id,
      documentId: "doc-1",
      language: "en",
      context,
      consent: true,
      sampleId: null,
      sampleMode: "auto",
    }),
  );
  form.set(
    "image",
    new File([await readFile("public/samples/baseline.png")], "upload.png", {
      type: "image/png",
    }),
  );
  const request = new Request("https://example.test/api/agent", {
    method: "POST",
    headers: { host: "example.test", origin: "https://example.test" },
    body: form,
  });
  const response = await agentPost(request);
  await expect(
    readAgentStream(
      response,
      () => {},
      () => {
        throw new Error("NO_FALLBACK_ALLOWED");
      },
    ),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
});

describe("Security hardening regressions", () => {
  async function headersFor(env: string) {
    vi.stubEnv("NODE_ENV", env);
    vi.resetModules();
    const mod = (await import("../next.config")).default;
    const rules = await mod.headers!();
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    return Object.fromEntries(all.map((h) => [h.key, h.value]));
  }
  it("production CSP has no unsafe-eval and forbids framing; dev keeps eval", async () => {
    const prod = await headersFor("production");
    expect(prod["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(prod["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(prod["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(prod["X-Frame-Options"]).toBe("DENY");
    expect(prod["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/);
    const dev = await headersFor("development");
    expect(dev["Content-Security-Policy"]).toContain("unsafe-eval");
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });
  it("derives the client IP from platform headers, not the spoofable first hop", async () => {
    const { clientIp } = await import("../src/lib/http");
    const req = (h: Record<string, string>) =>
      new Request("https://x.test", { headers: h });
    vi.stubEnv("VERCEL", "1");
    expect(
      clientIp(
        req({
          "x-vercel-forwarded-for": "203.0.113.9",
          "x-forwarded-for": "6.6.6.6, 203.0.113.9",
        }),
      ),
    ).toBe("203.0.113.9");
    vi.stubEnv("VERCEL", "");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(
      clientIp(
        req({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" }),
      ),
    ).toBe("198.51.100.7");
    expect(clientIp(req({ "x-forwarded-for": "not-an-ip" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
    expect(clientIp(req({ "x-real-ip": "2001:db8:1:2:aaaa::1" }))).toBe(
      clientIp(req({ "x-real-ip": "2001:db8:1:2:bbbb::9" })),
    );
  });
  it("rejects a no-Origin request flagged cross-site by fetch metadata", async () => {
    const { sameOrigin } = await import("../src/lib/http");
    expect(() =>
      sameOrigin(
        new Request("https://x.test", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toThrow("INVALID_REQUEST");
    expect(() =>
      sameOrigin(
        new Request("https://x.test", {
          headers: { "sec-fetch-site": "same-origin" },
        }),
      ),
    ).not.toThrow();
  });
  it("scrubs URLs, keys, e-mails and IPs from client-visible error detail", async () => {
    const { SafeError, safeDetail, sanitizeDetail } =
      await import("../src/lib/errors");
    const raw =
      "gemini: HTTP 400 see https://generativelanguage.googleapis.com/v1?key=AIzaSyD-abcdefghijklmnop from 10.1.2.3 mail a@b.co api_key=short123";
    const out = safeDetail(new SafeError("PROVIDER_UNAVAILABLE", raw))!;
    for (const bad of ["googleapis", "AIza", "10.1.2.3", "a@b.co", "short123"])
      expect(out).not.toContain(bad);
    expect(out).toContain("HTTP 400");
    expect(sanitizeDetail("Bearer abc.def\nline")).not.toContain("abc");
    expect(safeDetail(new Error("x"))).toBeUndefined();
    expect(
      safeDetail(new SafeError("TIMEOUT", "a".repeat(2000)))!.length,
    ).toBeLessThanOrEqual(300);
  });
  it("rejects decompression-bomb dimensions without decoding them", async () => {
    const sharp = (await import("sharp")).default;
    const { validateImage } = await import("../src/lib/validate-image");
    // 12000 x 12000 solid PNG compresses to a few KB but is 144 MP.
    const bomb = await sharp({
      create: { width: 12000, height: 12000, channels: 3, background: "#fff" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(4 * 1024 * 1024);
    const started = Date.now();
    await expect(
      validateImage(bomb, "image/png", "b.png"),
    ).rejects.toMatchObject({
      code: expect.stringMatching(
        /UNSUPPORTED_FORMAT|IMAGE_DIMENSIONS|INVALID_IMAGE/,
      ),
    });
    expect(Date.now() - started).toBeLessThan(3000);
  });
  it("rejects non-image bytes, SVG and a mislabeled file", async () => {
    const { validateImage } = await import("../src/lib/validate-image");
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>1</script></svg>',
    );
    await expect(
      validateImage(svg, "image/png", "a.png"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    await expect(
      validateImage(Buffer.from("%PDF-1.7 ".repeat(50)), "image/jpeg", "a.jpg"),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });
  it("document text never reaches the tool-choice prompt", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      functionCalls: [{ name: "requestUserConfirmation", args: {} }],
      usageMetadata: { totalTokenCount: 10 },
    });
    const client = {
      models: {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 50 }),
        generateContent,
      },
    } as unknown as GenerateClient;
    const provider = new AgentGeminiProvider(
      new CaseBudget(),
      { GEMINI_API_KEY: "not-real", GEMINI_MODEL: "m" },
      client,
    );
    await provider.chooseExtractionTool(["name_en"], "en");
    const sent = JSON.stringify(generateContent.mock.calls[0][0]);
    expect(sent).toContain("code-generated");
    expect(sent).not.toMatch(/inlineData|rawValue/);
  });
});
