import { SafeError } from "../errors";
import type { ExtractionProvider, RefiningProvider } from "./provider";

// Provider-specific failures worth retrying on the next model. Deterministic
// failures (TOKEN_BUDGET, CANCELLED, INVALID_IMAGE, NOT_CONFIGURED when a key
// is merely absent) are not: they would fail identically or waste the budget.
const FALLBACK_CODES: ReadonlySet<string> = new Set([
  "QUOTA",
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "INVALID_OUTPUT",
]);
export type LiveProvider = ExtractionProvider & Partial<RefiningProvider>;
export class ResilientProvider implements ExtractionProvider {
  private current: ExtractionProvider;
  constructor(protected readonly providers: LiveProvider[]) {
    if (!providers.length) throw new SafeError("NOT_CONFIGURED");
    this.current = providers[0];
  }
  get mode() {
    return this.current.mode;
  }
  usage() {
    return this.providers.reduce(
      (acc, provider) => {
        const u = provider.usage();
        return {
          modelCalls: acc.modelCalls + u.modelCalls,
          totalTokens: acc.totalTokens + u.totalTokens,
        };
      },
      { modelCalls: 0, totalTokens: 0 },
    );
  }
  protected async attempt<T>(
    op: (provider: LiveProvider) => Promise<T>,
  ): Promise<T> {
    let failure: SafeError | undefined;
    const reasons: string[] = [];
    for (const provider of this.providers) {
      try {
        const result = await op(provider);
        this.current = provider;
        return result;
      } catch (error) {
        if (!(error instanceof SafeError)) throw error;
        reasons.push(
          `${provider.name ?? provider.mode}: ${error.detail ?? error.code}`,
        );
        if (process.env.NODE_ENV !== "production")
          console.warn(
            `[provider-chain] ${provider.name ?? provider.mode}: ${error.code} ${error.detail ?? ""}`,
          );
        if (error.code === "NOT_CONFIGURED") continue;
        if (!FALLBACK_CODES.has(error.code)) throw error;
        // Keep the FIRST real provider failure: it is the primary cause.
        // A later provider's bad key must not mask it.
        failure ??= error;
      }
    }
    // Every provider refused on configuration (missing or rejected key):
    // NOT_CONFIGURED with the exact per-provider reason beats a generic
    // "unavailable" that hides what to fix.
    if (!failure)
      throw new SafeError(
        "NOT_CONFIGURED",
        reasons.length ? reasons.join(" | ") : "no provider is configured",
      );
    throw new SafeError(failure.code, reasons.join(" | "));
  }
  identifyDocument(
    image: Parameters<ExtractionProvider["identifyDocument"]>[0],
    language: Parameters<ExtractionProvider["identifyDocument"]>[1],
    signal?: AbortSignal,
  ) {
    return this.attempt((provider) =>
      provider.identifyDocument(image, language, signal),
    );
  }
  extractDocumentFields(
    image: Parameters<ExtractionProvider["extractDocumentFields"]>[0],
    docType: Parameters<ExtractionProvider["extractDocumentFields"]>[1],
    language: Parameters<ExtractionProvider["extractDocumentFields"]>[2],
    signal?: AbortSignal,
  ) {
    return this.attempt((provider) =>
      provider.extractDocumentFields(image, docType, language, signal),
    );
  }
}
export class ResilientAgentProvider
  extends ResilientProvider
  implements RefiningProvider
{
  async chooseExtractionTool(
    eligible: Parameters<RefiningProvider["chooseExtractionTool"]>[0],
    language: Parameters<RefiningProvider["chooseExtractionTool"]>[1],
    signal?: AbortSignal,
  ) {
    return this.attempt((provider) => {
      if (!provider.chooseExtractionTool) throw new SafeError("NOT_CONFIGURED");
      return provider.chooseExtractionTool(eligible, language, signal);
    });
  }
  async refineExtraction(
    image: Parameters<RefiningProvider["refineExtraction"]>[0],
    key: Parameters<RefiningProvider["refineExtraction"]>[1],
    language: Parameters<RefiningProvider["refineExtraction"]>[2],
    signal?: AbortSignal,
  ) {
    return this.attempt((provider) => {
      if (!provider.refineExtraction) throw new SafeError("NOT_CONFIGURED");
      return provider.refineExtraction(image, key, language, signal);
    });
  }
}
