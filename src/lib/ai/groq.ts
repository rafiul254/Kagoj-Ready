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

const envSchema = z.object({
  GROQ_API_KEY: z.string().min(1),
  // Empty means: resolve the newest vision-capable model from /models at runtime
  // (Groq retires Llama 4 snapshots regularly; a hardcoded default rots).
  // Empty string (a copied .env.example) must behave like unset, not fail min(1).
  GROQ_MODEL: z.preprocess(
    (value: unknown) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(1).optional(),
  ),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(20000).default(18000),
  MODEL_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(512)
    .max(4096)
    .default(2200),
  DOCUMENT_TOKEN_BUDGET: z.coerce
    .number()
    .int()
    .min(4096)
    .max(100000)
    .default(14000),
});
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";
const FALLBACK_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const VISION_PREFERENCE = [
  /llama-4-scout/,
  /llama-4-maverick/,
  /-vl[-_b]/,
  /vision/i,
  /pixtral/,
  /qwen.*vl/i,
  /gemma-[4-9]/,
];
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
export class GroqProvider implements ExtractionProvider {
  readonly mode = "live_groq" as const;
  readonly name = "groq";
  protected config: z.infer<typeof envSchema>;
  private calls = 0;
  private tokens = 0;
  private reserved = 0;
  private resolvedModel: string | null = null;
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
  // Pick a vision-capable model the account can actually serve. Explicit
  // GROQ_MODEL always wins; otherwise ask /models once and prefer the newest
  // known multimodal family. When /models answers but lists no vision-capable
  // model, fail fast with NOT_CONFIGURED instead of calling a retired
  // FALLBACK_MODEL id that can only return "model not found" (HTTP 404) —
  // the chain then skips Groq immediately and moves to OpenRouter. The
  // fallback id is used only when discovery itself fails (network/HTTP error),
  // so the real API error still surfaces with its detail.
  protected async resolveModel(): Promise<string> {
    if (this.config.GROQ_MODEL) return this.config.GROQ_MODEL;
    if (this.resolvedModel) return this.resolvedModel;
    try {
      const response = await fetch(MODELS_ENDPOINT, {
        headers: { Authorization: `Bearer ${this.config.GROQ_API_KEY}` },
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          data?: Array<{ id?: string }>;
        };
        const ids = (data.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === "string");
        for (const pattern of VISION_PREFERENCE) {
          const hit = ids.find((id) => pattern.test(id));
          if (hit) {
            this.resolvedModel = hit;
            return hit;
          }
        }
        if (ids.length)
          throw new SafeError(
            "NOT_CONFIGURED",
            "groq has no vision-capable model on this account — skipped",
          );
      }
    } catch (error) {
      if (error instanceof SafeError) throw error;
      // Discovery is best-effort; the fallback attempt reports a real error.
    }
    return FALLBACK_MODEL;
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
        error?: { type?: string; code?: string; message?: string };
      };
      const hint = body.error?.type ?? body.error?.code ?? body.error?.message;
      if (hint) detail += ` ${sanitizeDetail(hint)}`;
    } catch {
      // Status alone is still useful.
    }
    if (response.status === 429) throw new SafeError("QUOTA", detail);
    if (response.status === 401 || response.status === 403)
      throw new SafeError("NOT_CONFIGURED", `${detail} — check the API key`);
    throw new SafeError("PROVIDER_UNAVAILABLE", detail);
  }
  private async complete<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    allowance: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const abort = AbortSignal.any([
      AbortSignal.timeout(this.config.MODEL_TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]);
    this.claim(allowance);
    await this.budget?.reserve(allowance);
    this.calls++;
    this.reserved += allowance;
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: abort,
        body: JSON.stringify({
          model: await this.resolveModel(),
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
    if (typeof text !== "string" || !text.trim())
      throw new SafeError("INVALID_OUTPUT");
    try {
      return parseModelJson(text, schema);
    } catch (error) {
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
    // Bounded estimate: fixtures are tiny, photos bounded by validation. Actual usage replaces it after the call.
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
