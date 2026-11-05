import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "../src/app/api/samples/route";
function request(
  body: unknown,
  origin = "https://example.test",
  extras: Record<string, string> = {},
) {
  return new Request("https://example.test/api/samples", {
    method: "POST",
    headers: {
      host: "example.test",
      origin,
      "Content-Type": "application/json",
      ...extras,
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.unstubAllEnvs());
describe("synthetic-only API boundary", () => {
  it("refuses arbitrary input paths and uploads", async () => {
    const response = await POST(
      request({ sampleId: "../../secret", language: "en", consent: true }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
  });
  it("requires explicit consent", async () => {
    const response = await POST(
      request({ sampleId: "baseline", language: "en", consent: false }),
    );
    expect(response.status).toBe(400);
  });
  it("rejects foreign origins", async () => {
    const response = await POST(
      request(
        { sampleId: "baseline", language: "en", consent: true },
        "https://other.test",
      ),
    );
    expect(response.status).toBe(400);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("enforces request size without a content-length header", async () => {
    const response = await POST(request({ data: "x".repeat(2000) }));
    expect(response.status).toBe(400);
  });
  it("returns no-store and safe configuration error rather than fake results", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
    const response = await POST(
      request({ sampleId: "baseline", language: "en", consent: true }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "NOT_CONFIGURED" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
