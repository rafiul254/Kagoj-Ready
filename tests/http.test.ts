import { describe, it, expect, vi, afterEach } from "vitest";
import { sameOrigin } from "../src/lib/http";
import { POST as casesPost } from "../src/app/api/cases/route";
import { SafeError } from "../src/lib/errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestWith(
  headers: Record<string, string>,
  url = "https://example.test/api/cases",
) {
  return new Request(url, { method: "POST", headers });
}

describe("Proxy-aware same-origin enforcement", () => {
  it("allows a request with no Origin header", () => {
    expect(() =>
      sameOrigin(requestWith({ host: "example.test" })),
    ).not.toThrow();
  });

  it("allows an Origin that matches the Host", () => {
    expect(() =>
      sameOrigin(
        requestWith({ host: "example.test", origin: "https://example.test" }),
      ),
    ).not.toThrow();
  });

  it("allows an Origin that matches x-forwarded-host set by a proxy", () => {
    expect(() =>
      sameOrigin(
        requestWith({
          host: "internal.test",
          "x-forwarded-host": "preview.example.test",
          origin: "https://preview.example.test",
        }),
      ),
    ).not.toThrow();
  });

  it("checks every comma-separated x-forwarded-host value", () => {
    expect(() =>
      sameOrigin(
        requestWith({
          host: "internal.test",
          "x-forwarded-host": "a.test, preview.example.test",
          origin: "https://preview.example.test",
        }),
      ),
    ).not.toThrow();
  });

  it("tolerates a rewritten Host outside production (preview tunnels)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() =>
      sameOrigin(
        requestWith({ host: "localhost:3000", origin: "https://tunnel.test" }),
      ),
    ).not.toThrow();
  });

  it("rejects a mismatched Origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    expect(() =>
      sameOrigin(
        requestWith({ host: "localhost:3000", origin: "https://tunnel.test" }),
      ),
    ).toThrow(SafeError);
    try {
      sameOrigin(
        requestWith({ host: "localhost:3000", origin: "https://tunnel.test" }),
      );
    } catch (error) {
      expect((error as SafeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("rejects an unparseable Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      sameOrigin(requestWith({ host: "example.test", origin: "::" })),
    ).toThrow(SafeError);
  });

  it("surfaces the real error code from /api/cases instead of a fake limit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    const response = await casesPost(
      requestWith({ host: "localhost:3000", origin: "https://tunnel.test" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_REQUEST",
    });
  });
});
