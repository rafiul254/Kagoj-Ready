import { describe, it, expect, vi } from "vitest";
import {
  ResilientProvider,
  ResilientAgentProvider,
  type LiveProvider,
} from "../src/lib/ai/chain";
import { SafeError } from "../src/lib/errors";
import type {
  ExtractionProvider,
  RefiningProvider,
} from "../src/lib/ai/provider";
import type { ValidatedImage } from "../src/lib/validate-image";
import type { Identification, Extraction } from "../src/lib/schemas";

const image = {
  bytes: Buffer.from("test"),
  mimeType: "image/jpeg",
} as ValidatedImage;
const identification = {
  readable: true,
  documentType: "passport",
  reason: null,
} as unknown as Identification;
const extraction = { fields: {} } as unknown as Extraction;

function fakeProvider(
  mode: ExtractionProvider["mode"],
  behavior: () => Promise<unknown>,
): ExtractionProvider {
  return {
    mode,
    identifyDocument: behavior as ExtractionProvider["identifyDocument"],
    extractDocumentFields:
      behavior as ExtractionProvider["extractDocumentFields"],
    usage: () => ({ modelCalls: 1, totalTokens: 100 }),
  };
}
function okProvider(mode: ExtractionProvider["mode"]) {
  return fakeProvider(mode, () => Promise.resolve(identification));
}
describe("ResilientProvider fallback chain", () => {
  it("falls back to the next provider on QUOTA and reports the mode used", async () => {
    const failing = fakeProvider("live_gemini", () =>
      Promise.reject(new SafeError("QUOTA")),
    );
    const working = okProvider("live_groq");
    const chain = new ResilientProvider([failing, working]);
    await expect(chain.identifyDocument(image, "bn")).resolves.toBe(
      identification,
    );
    expect(chain.mode).toBe("live_groq");
  });
  it("skips providers without keys, then serves from the next one", async () => {
    const unconfigured = fakeProvider("live_gemini", () =>
      Promise.reject(new SafeError("NOT_CONFIGURED")),
    );
    const working = okProvider("live_groq");
    const chain = new ResilientProvider([unconfigured, working]);
    await expect(
      chain.extractDocumentFields(image, "passport", "bn"),
    ).resolves.toBe(identification);
  });
  it("propagates deterministic failures without trying the next provider", async () => {
    const failing = fakeProvider("live_gemini", () =>
      Promise.reject(new SafeError("TOKEN_BUDGET")),
    );
    const never = okProvider("live_groq");
    const spy = vi.spyOn(never, "identifyDocument");
    const chain = new ResilientProvider([failing, never]);
    await expect(chain.identifyDocument(image, "bn")).rejects.toThrow(
      "TOKEN_BUDGET",
    );
    expect(spy).not.toHaveBeenCalled();
  });
  it("surfaces the primary provider's failure when every provider fails", async () => {
    const chain = new ResilientProvider([
      fakeProvider("live_gemini", () =>
        Promise.reject(new SafeError("PROVIDER_UNAVAILABLE")),
      ),
      fakeProvider("live_groq", () => Promise.reject(new SafeError("TIMEOUT"))),
    ]);
    await expect(chain.identifyDocument(image, "bn")).rejects.toThrow(
      "PROVIDER_UNAVAILABLE",
    );
  });
  it("a later provider's missing key never masks the primary failure", async () => {
    const chain = new ResilientProvider([
      fakeProvider("live_gemini", () => Promise.reject(new SafeError("QUOTA"))),
      fakeProvider("live_groq", () =>
        Promise.reject(new SafeError("NOT_CONFIGURED")),
      ),
    ]);
    await expect(chain.identifyDocument(image, "bn")).rejects.toThrow("QUOTA");
  });
  it("sums usage across providers", () => {
    const chain = new ResilientProvider([
      okProvider("live_gemini"),
      okProvider("live_groq"),
    ]);
    expect(chain.usage()).toEqual({ modelCalls: 2, totalTokens: 200 });
  });
  it("chains refining calls across providers that support them", async () => {
    const failing = {
      ...okProvider("live_gemini"),
      chooseExtractionTool: () =>
        Promise.reject(new SafeError("PROVIDER_UNAVAILABLE")),
      refineExtraction: () =>
        Promise.reject(new SafeError("PROVIDER_UNAVAILABLE")),
    } satisfies LiveProvider;
    const working = {
      ...okProvider("live_groq"),
      chooseExtractionTool: () =>
        Promise.resolve({
          name: "requestUserConfirmation",
          args: {},
        } as never),
      refineExtraction: () => Promise.resolve({} as never),
    } satisfies LiveProvider;
    const chain = new ResilientAgentProvider([failing, working]);
    await expect(
      chain.chooseExtractionTool(["name_en"], "bn"),
    ).resolves.toEqual({ name: "requestUserConfirmation", args: {} });
    expect(chain.mode).toBe("live_groq");
  });
});
