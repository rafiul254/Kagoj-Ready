import { z } from "zod";
import recorded from "@/data/recorded-samples.json";
import { resultSchema, type Fixture, type Language } from "../schemas";
import type { ExtractionProvider } from "../ai/provider";
import type { ValidatedImage } from "../validate-image";
const recordedSchema = z.object({
  schemaVersion: z.literal(1),
  recordedAt: z.iso.datetime().nullable(),
  model: z.string().nullable(),
  fixtures: z.record(
    z.string(),
    z.object({ sha256: z.string(), result: resultSchema }),
  ),
});
export function recordedProvider(fixture: Fixture): ExtractionProvider | null {
  const parsed = recordedSchema.safeParse(recorded);
  if (!parsed.success || !parsed.data.recordedAt || !parsed.data.model)
    return null;
  const entry = parsed.data.fixtures[fixture.id];
  if (
    !entry ||
    entry.sha256 !== fixture.sha256 ||
    entry.result.mode !== "live_gemini"
  )
    return null;
  return {
    mode: "mock_test",
    usage: () => ({ modelCalls: 0, totalTokens: 0 }),
    identifyDocument: async (_image: ValidatedImage, _language: Language) =>
      entry.result.identification,
    extractDocumentFields: async () => {
      if (!entry.result.extraction) throw new Error("NO_EXTRACTION");
      return structuredClone(entry.result.extraction);
    },
  };
}
