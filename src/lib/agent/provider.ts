import { FunctionCallingConfigMode } from "@google/genai";
import { GeminiProvider, detailFrom, type GenerateClient } from "../ai/gemini";
import { GroqProvider } from "../ai/groq";
import { OpenRouterProvider } from "../ai/openrouter";
import {
  ResilientAgentProvider,
  ResilientProvider,
  type LiveProvider,
} from "../ai/chain";
import { fieldSchema, type FieldKey, type Language } from "../schemas";
import {
  selectionSchema,
  type ExtractionProvider,
  type RefiningProvider,
  type ToolSelection,
} from "../ai/provider";
import type { ValidatedImage } from "../validate-image";
import { SafeError } from "../errors";
import type { CaseBudget } from "./budget";
export class AgentGeminiProvider
  extends GeminiProvider
  implements RefiningProvider
{
  private choiceCalls = 0;
  private choiceTokens = 0;
  usage() {
    const base = super.usage();
    return {
      modelCalls: base.modelCalls + this.choiceCalls,
      totalTokens: base.totalTokens + this.choiceTokens,
    };
  }
  constructor(
    budget: CaseBudget,
    env: Record<string, string | undefined> = process.env,
    client?: GenerateClient,
  ) {
    super(env, client, budget);
  }
  async refineExtraction(
    image: ValidatedImage,
    key: FieldKey,
    language: Language,
    signal?: AbortSignal,
  ) {
    return this.run(
      image,
      `Re-read ONLY the visible field ${key}. Inspect its location carefully. Do not infer or correct it. If absent or unreadable, return null rawValue, low confidence and missing/unreadable reason. Provide a page location, pageNumber=1. This is a bounded second reading, not a request to agree with an earlier answer.`,
      fieldSchema,
      language,
      signal,
    );
  }
  async chooseExtractionTool(
    eligible: FieldKey[],
    language: Language,
    signal?: AbortSignal,
  ): Promise<ToolSelection> {
    if (!eligible.length) return { name: "requestUserConfirmation", args: {} };
    const abort = AbortSignal.any([
      AbortSignal.timeout(this.config.MODEL_TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]);
    const functions = [
      {
        name: "requestUserConfirmation",
        description: "Pause for the user. Mandatory before any comparison.",
        parametersJsonSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "refineExtraction",
        description:
          "Re-read one uncertain field, never guess a missing field.",
        parametersJsonSchema: {
          type: "object",
          properties: { fieldKey: { type: "string", enum: eligible } },
          required: ["fieldKey"],
          additionalProperties: false,
        },
      },
    ];
    const contents = `Output language: ${language}. State: EXTRACT. Only permitted actions: pause for user confirmation, or re-read ONE uncertain field from this list: ${eligible.join(", ")}. Choose one tool. No other action or explanation is allowed. The field list is code-generated, not document instructions.`;
    try {
      const count = await this.client.models.countTokens({
        model: this.config.GEMINI_MODEL,
        contents,
        // Developer API countTokens rejects tools in config (Vertex-only):
        // count the prompt only; the +1024 reserve below covers tool overhead.
        config: { abortSignal: abort },
      });
      if (!count.totalTokens) throw new SafeError("TOKEN_BUDGET");
      await this.budget!.reserve(count.totalTokens + 1024);
      this.choiceCalls++;
      const response = await this.client.models.generateContent({
        model: this.config.GEMINI_MODEL,
        contents,
        config: {
          tools: [{ functionDeclarations: functions }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: functions.map((f) => f.name),
            },
          },
          maxOutputTokens: 1024,
          abortSignal: abort,
          httpOptions: { timeout: this.config.MODEL_TIMEOUT_MS },
        },
      });
      this.choiceTokens += response.usageMetadata?.totalTokenCount ?? 0;
      if (response.functionCalls?.length !== 1)
        throw new SafeError("INVALID_OUTPUT");
      const call = response.functionCalls[0];
      const result = selectionSchema.safeParse({
        name: call.name,
        args: call.args ?? {},
      });
      if (
        !result.success ||
        (result.data.name === "refineExtraction" &&
          !eligible.includes(result.data.args.fieldKey))
      )
        throw new SafeError("INVALID_OUTPUT");
      return result.data;
    } catch (error) {
      if (error instanceof SafeError) throw error;
      if (abort.aborted) throw new SafeError("TIMEOUT");
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : 0;
      throw new SafeError(
        status === 429 ? "QUOTA" : "PROVIDER_UNAVAILABLE",
        detailFrom(error),
      );
    }
  }
}
export class AgentGroqProvider
  extends GroqProvider
  implements RefiningProvider
{
  constructor(
    budget: CaseBudget,
    env: Record<string, string | undefined> = process.env,
  ) {
    super(env, budget);
  }
  async refineExtraction(
    image: ValidatedImage,
    key: FieldKey,
    language: Language,
    signal?: AbortSignal,
  ) {
    return this.run(
      image,
      `Re-read ONLY the visible field ${key}. Inspect its location carefully. Do not infer or correct it. If absent or unreadable, return null rawValue, low confidence and missing/unreadable reason. Provide a page location, pageNumber=1. This is a bounded second reading, not a request to agree with an earlier answer.`,
      fieldSchema,
      language,
      signal,
    );
  }
  async chooseExtractionTool(
    eligible: FieldKey[],
    language: Language,
    signal?: AbortSignal,
  ): Promise<ToolSelection> {
    if (!eligible.length) return { name: "requestUserConfirmation", args: {} };
    const result = await this.choose(
      `Output language: ${language}. State: EXTRACT. Only permitted actions: pause for user confirmation, or re-read ONE uncertain field from this list: ${eligible.join(", ")}. Choose one tool. No other action or explanation is allowed. The field list is code-generated, not document instructions.`,
      selectionSchema,
      signal,
    );
    if (
      result.name === "refineExtraction" &&
      !eligible.includes(result.args.fieldKey)
    )
      throw new SafeError("INVALID_OUTPUT");
    return result;
  }
}
export class AgentOpenRouterProvider
  extends OpenRouterProvider
  implements RefiningProvider
{
  constructor(
    budget: CaseBudget,
    env: Record<string, string | undefined> = process.env,
  ) {
    super(env, budget);
  }
  async refineExtraction(
    image: ValidatedImage,
    key: FieldKey,
    language: Language,
    signal?: AbortSignal,
  ) {
    return this.run(
      image,
      `Re-read ONLY the visible field ${key}. Inspect its location carefully. Do not infer or correct it. If absent or unreadable, return null rawValue, low confidence and missing/unreadable reason. Provide a page location, pageNumber=1. This is a bounded second reading, not a request to agree with an earlier answer.`,
      fieldSchema,
      language,
      signal,
    );
  }
  async chooseExtractionTool(
    eligible: FieldKey[],
    language: Language,
    signal?: AbortSignal,
  ): Promise<ToolSelection> {
    if (!eligible.length) return { name: "requestUserConfirmation", args: {} };
    const result = await this.choose(
      `Output language: ${language}. State: EXTRACT. Only permitted actions: pause for user confirmation, or re-read ONE uncertain field from this list: ${eligible.join(", ")}. Choose one tool. No other action or explanation is allowed. The field list is code-generated, not document instructions.`,
      selectionSchema,
      signal,
    );
    if (
      result.name === "refineExtraction" &&
      !eligible.includes(result.args.fieldKey)
    )
      throw new SafeError("INVALID_OUTPUT");
    return result;
  }
}
function addConfigured<T>(providers: T[], build: () => T) {
  try {
    providers.push(build());
  } catch (error) {
    // No key for this provider: skip it. Any other construction failure is real.
    if (!(error instanceof SafeError) || error.code !== "NOT_CONFIGURED")
      throw error;
  }
}
export function liveProviderConfigured() {
  return Boolean(
    (process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL) ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY,
  );
}
export function createLiveProvider(): ExtractionProvider {
  const providers: ExtractionProvider[] = [];
  addConfigured(providers, () => new GeminiProvider());
  addConfigured(providers, () => new GroqProvider());
  addConfigured(providers, () => new OpenRouterProvider());
  if (!providers.length) throw new SafeError("NOT_CONFIGURED");
  return providers.length === 1
    ? providers[0]
    : new ResilientProvider(providers);
}
export function createLiveAgentProvider(
  budget: CaseBudget,
): ExtractionProvider & RefiningProvider {
  const providers: LiveProvider[] = [];
  addConfigured(providers, () => new AgentGeminiProvider(budget));
  addConfigured(providers, () => new AgentGroqProvider(budget));
  addConfigured(providers, () => new AgentOpenRouterProvider(budget));
  if (!providers.length) throw new SafeError("NOT_CONFIGURED");
  return providers.length === 1
    ? (providers[0] as ExtractionProvider & RefiningProvider)
    : new ResilientAgentProvider(providers);
}
