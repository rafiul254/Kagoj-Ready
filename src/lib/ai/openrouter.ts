import { z } from "zod";
import {
  identificationSchema,
  extractionSchema,
  type Language,
  type Identification,
} from "../schemas";
import { SafeError, sanitizeDetail } from "../errors";
import { sanitizeExtraction } from "../sanity";
import type { ValidatedImage } from "../validate-image";
import { parseModelJson } from "./json";
import { SYSTEM_INSTRUCTION, type ExtractionProvider } from "./provider";

// Third link in the chain: free-tier vision models behind one OpenRouter key.
// Works from regions where Gemini is blocked and where Groq has no vision
// model left. Defaults verified against OpenRouter's live /models on
// 2026-11-04. Free models are rate-limited per upstream provider, so when one
// returns 429 the request walks a pool of free vision models from DIFFERENT
// upstream vendors (Google → NVIDIA → dots) instead of failing the case.
// A copied .env.example carries model keys as empty strings; zod defaults only
// fire on undefined, so empty values must be normalized before validation.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
const DEFAULT_FALLBACK_POOL = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-26b-a4b-it:free",
  "dots-studio/dots-3-note-preview:free",
];
const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  OPENROUTER_FALLBACK_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  OPENROUTER_FALLBACK_MODELS: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(22000),
  MODEL_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(512)
    .max(4096)
    .default(4096),
  DOCUMENT_TOKEN_BUDGET: z.coerce
    .number()
    .int()
    .min(4096)
    .max(100000)
    .default(40000),
});
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
interface ChatMessage {
  role: "system" | "user";
  content: ChatContent;
}
export class OpenRouterProvider implements ExtractionProvider {
  readonly mode = "live_openrouter" as const;
  readonly name = "openrouter";
  protected config: z.infer<typeof envSchema>;
  private calls = 0;
  private tokens = 0;
  private reserved = 0;
  constructor(
    env: Record<string, string | undefined> = process.env,
    protected budget?: { reserve(tokens: number): void | Promise<void> },
  ) {
    const parsed = envSchema.safeParse(env);
    if (!parsed.success) throw new SafeError("NOT_CONFIGURED");
    this.config = parsed.data;
  }
  usage() {
    return { modelCalls: this.calls, totalTokens: this.tokens };
  }
  private claim(allowance: number) {
    if (
      this.calls >= (this.budget ? 12 : 4) ||
      this.reserved + allowance > this.config.DOCUMENT_TOKEN_BUDGET
    )
      throw new SafeError("TOKEN_BUDGET");
  }
  private async mapStatus(response: Response): Promise<never> {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as {
        error?: { code?: number | string; message?: string };
      };
      if (body.error?.message)
        detail += ` ${sanitizeDetail(body.error.message)}`;
      else if (body.error?.code) detail += ` ${body.error.code}`;
    } catch {
      // Status alone is still useful.
    }
    if (response.status === 429) throw new SafeError("QUOTA", detail);
    if (response.status === 401 || response.status === 403)
      throw new SafeError("NOT_CONFIGURED", `${detail} — check the API key`);
    if (response.status === 402)
      throw new SafeError("NOT_CONFIGURED", "no OpenRouter credit");
    throw new SafeError("PROVIDER_UNAVAILABLE", detail);
  }
  // One structured-output request. Free models rate-limit independently per
  // upstream provider, so a QUOTA/PROVIDER_UNAVAILABLE from one model moves to
  // the next free vision model (max 4 attempts) instead of failing the case.
  // INVALID_OUTPUT also walks: a free model may answer in prose or emit
  // malformed JSON on one document while another model reads it fine; the
  // repaired parse below already salvages fenced/prose-wrapped JSON before
  // giving up on a model. MODEL_TIMEOUT_MS bounds the whole attempt chain, so
  // a saturated primary cannot stretch the case beyond its usual latency.
  private async complete<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    allowance: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const primary = this.config.OPENROUTER_MODEL ?? DEFAULT_MODEL;
    const pool = [
      primary,
      ...this.fallbackPool().filter((model) => model !== primary),
    ];
    const deadline = AbortSignal.timeout(this.config.MODEL_TIMEOUT_MS);
    const attemptSignal = AbortSignal.any([
      deadline,
      ...(signal ? [signal] : []),
    ]);
    // Reserve ONCE per logical operation: walking the free-model pool after a
    // 429 re-sends the same request and must not be billed against the budget
    // again (failed attempts return no usage and cost nothing).
    this.claim(allowance);
    await this.budget?.reserve(allowance);
    this.calls++;
    this.reserved += allowance;
    let lastError: unknown = new SafeError("PROVIDER_UNAVAILABLE");
    for (const model of pool) {
      try {
        return await this.callModel(messages, schema, attemptSignal, model);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof SafeError &&
          (error.code === "QUOTA" ||
            error.code === "PROVIDER_UNAVAILABLE" ||
            error.code === "INVALID_OUTPUT");
        if (!retryable || deadline.aborted || signal?.aborted) throw error;
      }
    }
    throw lastError;
  }
  private fallbackPool(): string[] {
    const explicit = this.config.OPENROUTER_FALLBACK_MODELS?.split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    const userPool =
      explicit ??
      (this.config.OPENROUTER_FALLBACK_MODEL
        ? [this.config.OPENROUTER_FALLBACK_MODEL]
        : []);
    return [...new Set([...userPool, ...DEFAULT_FALLBACK_POOL])].slice(0, 3);
  }
  private async callModel<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    signal: AbortSignal | undefined,
    model: string,
  ): Promise<T> {
    const abort = AbortSignal.any([
      AbortSignal.timeout(this.config.MODEL_TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]);
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Kagoj Ready",
        },
        signal: abort,
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: this.config.MODEL_MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          messages,
        }),
      });
    } catch (error) {
      if (signal?.aborted) throw new SafeError("CANCELLED");
      if (abort.aborted) throw new SafeError("TIMEOUT");
      if (error instanceof SafeError) throw error;
      throw new SafeError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) await this.mapStatus(response);
    let data: {
      choices?: Array<{
        message?: { content?: unknown };
        finish_reason?: string;
      }>;
      usage?: { total_tokens?: number };
    };
    try {
      data = await response.json();
    } catch {
      throw new SafeError("INVALID_OUTPUT");
    }
    this.tokens += data.usage?.total_tokens ?? 0;
    if (this.tokens > this.config.DOCUMENT_TOKEN_BUDGET)
      throw new SafeError("TOKEN_BUDGET");
    const choice = data.choices?.[0];
    const text = choice?.message?.content;
    const diagnose = (why: string) => {
      // Dev-only diagnostic: never logs in production, never logs the key.
      if (process.env.NODE_ENV !== "production")
        console.warn(
          `[openrouter] ${model} -> INVALID_OUTPUT (${why}); finish_reason=${choice?.finish_reason ?? "?"}; head=${JSON.stringify(typeof text === "string" ? text.slice(0, 160) : text)}`,
        );
    };
    if (typeof text !== "string" || !text.trim()) {
      diagnose("empty content");
      throw new SafeError(
        "INVALID_OUTPUT",
        choice?.finish_reason === "length"
          ? "model output truncated (finish_reason=length)"
          : "model returned empty content",
      );
    }
    try {
      return parseModelJson(text, schema);
    } catch (error) {
      diagnose("schema/JSON mismatch");
      if (choice?.finish_reason === "length")
        throw new SafeError(
          "INVALID_OUTPUT",
          "model output truncated (finish_reason=length)",
        );
      throw error;
    }
  }
  protected async run<T>(
    image: ValidatedImage,
    instruction: string,
    schema: z.ZodType<T>,
    language: Language,
    signal?: AbortSignal,
  ): Promise<T> {
    const estimate =
      Math.min(4096, Math.ceil(image.bytes.length / 750) + 512) +
      this.config.MODEL_MAX_OUTPUT_TOKENS;
    return this.complete(
      [
        { role: "system", content: SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Output language: ${language}. ${instruction}\nRespond with a single JSON object exactly matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
              },
            },
          ],
        },
      ],
      schema,
      estimate,
      signal,
    );
  }
  protected async choose<T>(
    instruction: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.complete(
      [
        { role: "system", content: SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: `${instruction}\nRespond with a single JSON object exactly matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`,
        },
      ],
      schema,
      this.config.MODEL_MAX_OUTPUT_TOKENS,
      signal,
    );
  }
  async identifyDocument(
    image: ValidatedImage,
    language: Language,
    signal?: AbortSignal,
  ) {
    return this.run(
      image,
      "Identify whether this is NID, birth certificate, passport, or other. Synthetic labelled test cards count as their printed type. If unreadable, return readable=false and a specific reason: blurry, cropped, glare, wrong_document, unreadable. Other documents must use wrong_document. For a readable supported document return reason=null.",
      identificationSchema,
      language,
      signal,
    );
  }
  async extractDocumentFields(
    image: ValidatedImage,
    docType: Identification["documentType"],
    language: Language,
    signal?: AbortSignal,
  ) {
    const result = await this.run(
      image,
      `Extract from this ${docType} image: name_bn, name_en, father_name, mother_name, date_of_birth, id_number, address, issue_date. Each field needs rawValue, confidence (high/medium/low), pageNumber=1, evidenceLocation and reason. Missing or unreadable fields must have null rawValue and reason missing or unreadable, low confidence. Readable fields have reason=null. Do not use one language's name to populate the other. Preserve whitespace where visible.`,
      extractionSchema,
      language,
      signal,
    );
    return sanitizeExtraction(result);
  }
}
