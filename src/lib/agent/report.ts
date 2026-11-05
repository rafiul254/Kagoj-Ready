import { explainFinding } from "../domain/explain";
import { fieldKeys, type FieldKey, type Language } from "../schemas";
import { maskIdentity } from "../sanity";
import {
  contextSchema,
  documentSchema,
  reportSchema,
  type ApplicantContext,
  type CaseDocument,
  type ReadinessReport,
  type Finding,
  type AgentEvent,
} from "../domain/types";
import {
  classifyServiceCase,
  retrieveOfficialRequirements,
} from "../domain/registry";
import {
  compareDocumentFields,
  comparePair,
  confirmationComplete,
  effectiveValue,
  isUncertain,
} from "../domain/compare";
import { normalizeField } from "../domain/normalize";
import { buildChecklist, missingDocuments } from "../domain/checklist";
import { assertAllowed, transition } from "./machine";
export function requestMissingDocument(
  context: ApplicantContext,
  documents: CaseDocument[],
) {
  return missingDocuments(documents, retrieveOfficialRequirements(context));
}
export function generateReport(
  context: ApplicantContext,
  documents: CaseDocument[],
  language: Language,
  trace: AgentEvent[],
  findings: Finding[],
): ReadinessReport {
  const rules = retrieveOfficialRequirements(context),
    missing = missingDocuments(documents, rules);
  const modes = new Set(documents.map((d) => d.mode));
  return reportSchema.parse({
    version: 1,
    context,
    language,
    reviewedAt: new Date().toISOString(),
    mode: modes.size === 1 ? documents[0].mode : "mixed",
    documents: documents.map((doc) => ({
      id: doc.id,
      label: doc.label,
      documentType: doc.documentType,
      mode: doc.mode,
      fields: fieldKeys.map((key) => {
        const raw = doc.extraction.fields[key];
        const value = effectiveValue(doc, key);
        const show = (v: string | null) =>
          key === "id_number" ? (v ? maskIdentity(v) : null) : v;
        return {
          key,
          rawValue: show(raw.rawValue),
          value: show(value),
          normalizedValue: show(normalizeField(key, value)),
          confidence: raw.confidence,
          confirmed: doc.reviews[key].confirmed,
          edited: doc.reviews[key].edited,
          pageNumber: raw.pageNumber,
          location:
            key === "id_number"
              ? null
              : (raw.evidenceLocation?.replace(/[0-9০-৯]{5,}/gu, "••••") ??
                null),
          uncertain: isUncertain(doc, key) || value === null,
        };
      }),
    })),
    findings,
    missing,
    checklist: buildChecklist(findings, rules, missing),
    unverified_items: rules.filter((r) => !r.usable),
    sources: rules,
    agent_trace: trace,
    limitations: [
      "preparation_not_approval",
      "source_verification_pending",
      "ocr_can_be_wrong",
      ...(documents.length < 2 ? ["single_document_no_comparison"] : []),
    ],
  });
}
export function resumeAfterConfirmation(
  inputContext: ApplicantContext,
  inputDocs: CaseDocument[],
  language: Language,
  trace: AgentEvent[] = [],
  previous?: ReadinessReport,
  affectedId?: string,
) {
  const context = contextSchema.parse(inputContext),
    documents = inputDocs.map((d) => documentSchema.parse(d));
  if (
    documents.length < 1 ||
    documents.length > 3 ||
    !classifyServiceCase(context).supported
  )
    throw new Error("UNSUPPORTED_CASE");
  if (!confirmationComplete(documents))
    throw new Error("CONFIRMATION_REQUIRED");
  let state = transition("AWAIT_USER_CONFIRMATION", "COMPARE");
  const events = [...trace];
  const tool = (name: string) => {
    assertAllowed(state, name);
    events.push({
      state,
      tool: name,
      status: "completed",
      code: "DETERMINISTIC",
      documentId: affectedId ?? null,
    } as AgentEvent);
  };
  tool("normalizeFields");
  let findings: Finding[];
  if (previous && affectedId) {
    findings = [];
    for (let i = 0; i < documents.length; i++)
      for (let j = i + 1; j < documents.length; j++)
        for (const key of fieldKeys) {
          const id = `${documents[i].id}--${documents[j].id}--${key}`;
          const existing = previous.findings.find((f) => f.id === id);
          findings.push(
            existing &&
              documents[i].id !== affectedId &&
              documents[j].id !== affectedId
              ? existing
              : comparePair(documents[i], documents[j], key),
          );
        }
  } else findings = compareDocumentFields(documents);
  tool("compareDocumentFields");
  findings.forEach((f) => explainFinding(f, language));
  tool("explainFinding");
  state = transition(state, "PLAN");
  tool("retrieveOfficialRequirements");
  tool("buildChecklist");
  state = transition(state, "REPORT");
  tool("generateReport");
  return generateReport(context, documents, language, events, findings);
}
export function findingDiff(before: ReadinessReport, after: ReadinessReport) {
  const keys = new Set([
    ...before.findings.map((f) => f.id),
    ...after.findings.map((f) => f.id),
  ]);
  return [...keys].flatMap((id) => {
    const left = before.findings.find((f) => f.id === id),
      right = after.findings.find((f) => f.id === id);
    if (
      left?.status === right?.status &&
      left?.left.value === right?.left.value &&
      left?.right.value === right?.right.value
    )
      return [];
    return [
      {
        id,
        field: (right ?? left)!.field as FieldKey,
        before: left?.status ?? null,
        after: right?.status ?? null,
        beforeValues: [left?.left.value ?? null, left?.right.value ?? null],
        afterValues: [right?.left.value ?? null, right?.right.value ?? null],
      },
    ];
  });
}
