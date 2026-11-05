import {
  fieldKeys,
  type Language,
  type FieldKey,
  type Identification,
} from "../schemas";
import { validateImage } from "../validate-image";
import type { ExtractionProvider } from "../ai/provider";
import { sanitizeExtraction } from "../sanity";
import {
  classifyServiceCase,
  retrieveOfficialRequirements,
} from "../domain/registry";
import {
  documentSchema,
  type AgentEvent,
  type ApplicantContext,
  type CaseDocument,
} from "../domain/types";
import type { RefiningProvider } from "../ai/provider";
import { assertAllowed, transition } from "./machine";
import { SafeError } from "../errors";
export async function extractWithAgent(
  input: {
    bytes: Buffer;
    mimeType: string;
    filename: string;
    language: Language;
    context: ApplicantContext;
    documentId: string;
    label: string;
    sampleId: string | null;
  },
  provider: ExtractionProvider,
  emit: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<{
  document: CaseDocument | null;
  rejection: string | null;
  identification: Identification;
}> {
  let state: AgentEvent["state"] = "CONTEXT";
  const event = (tool: string, status: AgentEvent["status"], code: string) =>
    emit({ state, tool, status, code, documentId: input.documentId });
  assertAllowed(state, "classifyServiceCase");
  if (!classifyServiceCase(input.context).supported)
    throw new SafeError("INVALID_REQUEST");
  event("classifyServiceCase", "completed", "SUPPORTED");
  state = transition(state, "SUPPORT_CHECK");
  assertAllowed(state, "retrieveOfficialRequirements");
  retrieveOfficialRequirements(input.context);
  event("retrieveOfficialRequirements", "completed", "REGISTRY_ONLY");
  state = transition(state, "COLLECT_DOCUMENTS");
  const image = await validateImage(
    input.bytes,
    input.mimeType,
    input.filename,
  );
  assertAllowed(state, "identifyDocument");
  event("identifyDocument", "pending", "READING");
  const identification = await provider.identifyDocument(
    image,
    input.language,
    signal,
  );
  event("identifyDocument", "completed", identification.reason ?? "IDENTIFIED");
  if (!identification.readable)
    return { document: null, rejection: identification.reason, identification };
  state = transition(state, "EXTRACT");
  assertAllowed(state, "extractDocumentFields");
  event("extractDocumentFields", "pending", "READING");
  let extraction = sanitizeExtraction(
    await provider.extractDocumentFields(
      image,
      identification.documentType,
      input.language,
      signal,
    ),
  );
  event("extractDocumentFields", "completed", "EXTRACTED");
  const refinements: CaseDocument["refinements"] = [];
  const attempts: Partial<Record<FieldKey, number>> = {};
  if ("chooseExtractionTool" in provider) {
    const agent = provider as ExtractionProvider & RefiningProvider;
    for (let i = 0; i < 4; i++) {
      const eligible = fieldKeys.filter(
        (k) =>
          extraction.fields[k].confidence === "low" &&
          extraction.fields[k].rawValue !== null &&
          (attempts[k] ?? 0) < 2,
      );
      // The re-read choice is optional: if the model cannot answer it, skip
      // straight to user confirmation (the user checks every field anyway).
      const decision = await agent
        .chooseExtractionTool(eligible, input.language, signal)
        .catch((error: unknown) => {
          if (
            error instanceof SafeError &&
            [
              "INVALID_OUTPUT",
              "TIMEOUT",
              "QUOTA",
              "PROVIDER_UNAVAILABLE",
            ].includes(error.code)
          )
            return { name: "requestUserConfirmation" as const, args: {} };
          throw error;
        });
      assertAllowed(state, decision.name);
      if (decision.name === "requestUserConfirmation") break;
      const key = decision.args.fieldKey;
      if (!eligible.includes(key)) throw new SafeError("INVALID_OUTPUT");
      attempts[key] = (attempts[key] ?? 0) + 1;
      event("refineExtraction", "pending", key);
      const before = { ...extraction.fields[key] };
      const after = await agent.refineExtraction(
        image,
        key,
        input.language,
        signal,
      );
      extraction = sanitizeExtraction({
        fields: { ...extraction.fields, [key]: after },
      });
      refinements.push({ field: key, before, after: extraction.fields[key] });
      event("refineExtraction", "completed", key);
    }
  }
  assertAllowed(state, "requestUserConfirmation");
  state = transition(state, "AWAIT_USER_CONFIRMATION");
  event("requestUserConfirmation", "pending", "PAUSED");
  const document = documentSchema.parse({
    id: input.documentId,
    label: input.label,
    documentType: identification.documentType,
    extraction,
    reviews: Object.fromEntries(
      fieldKeys.map((key) => [
        key,
        {
          value: extraction.fields[key].rawValue,
          edited: false,
          confirmed: false,
        },
      ]),
    ),
    mode: provider.mode === "mock_test" ? "synthetic_fixture" : provider.mode,
    sampleId: input.sampleId,
    refinements,
  });
  return { document, rejection: null, identification };
}
