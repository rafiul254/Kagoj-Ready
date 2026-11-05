import {
  identificationSchema,
  resultSchema,
  type Language,
  type PipelineResult,
} from "./schemas";
import { validateImage } from "./validate-image";
import { sanitizeExtraction } from "./sanity";
import type { ExtractionProvider } from "./ai/provider";
export async function processDocument(
  input: {
    bytes: Buffer;
    mimeType: string;
    filename: string;
    language: Language;
  },
  provider: ExtractionProvider,
  signal?: AbortSignal,
): Promise<PipelineResult> {
  const image = await validateImage(
    input.bytes,
    input.mimeType,
    input.filename,
  );
  const trace: PipelineResult["trace"] = [
    { tool: "validateImage", status: "completed", code: "VALID_IMAGE" },
  ];
  const identification = identificationSchema.parse(
    await provider.identifyDocument(image, input.language, signal),
  );
  trace.push({
    tool: "identifyDocument",
    status: "completed",
    code: identification.reason ?? "IDENTIFIED",
  });
  const extraction = identification.readable
    ? sanitizeExtraction(
        await provider.extractDocumentFields(
          image,
          identification.documentType,
          input.language,
          signal,
        ),
      )
    : null;
  if (extraction)
    trace.push({
      tool: "extractDocumentFields",
      status: "completed",
      code: "EXTRACTED_UNCONFIRMED",
    });
  return resultSchema.parse({
    mode: provider.mode,
    identification,
    extraction,
    trace,
    usage: provider.usage(),
  });
}
