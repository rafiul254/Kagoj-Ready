import { fieldKeys, type FieldKey } from "../schemas";
import {
  normalizeField,
  stripHonorifics,
  tokens,
  differentScripts,
  jaroWinkler,
  levenshtein,
} from "./normalize";
import {
  type CaseDocument,
  type Finding,
  type ActiveRule,
  type FindingStatus,
} from "./types";
import { maskIdentity } from "../sanity";
const identity = new Set<FieldKey>([
  "name_bn",
  "name_en",
  "father_name",
  "mother_name",
  "date_of_birth",
  "id_number",
]);
export function mustConfirm(doc: CaseDocument, key: FieldKey) {
  return (
    identity.has(key) ||
    doc.extraction.fields[key].confidence === "low" ||
    doc.reviews[key].edited
  );
}
export function confirmationComplete(docs: CaseDocument[]) {
  return (
    docs.length > 0 &&
    docs.every((doc) =>
      fieldKeys.every((k) => !mustConfirm(doc, k) || doc.reviews[k].confirmed),
    )
  );
}
export function effectiveValue(doc: CaseDocument, key: FieldKey) {
  return doc.reviews[key].edited
    ? doc.reviews[key].value
    : doc.extraction.fields[key].rawValue;
}
export function isUncertain(doc: CaseDocument, key: FieldKey) {
  const field = doc.extraction.fields[key],
    review = doc.reviews[key],
    value = effectiveValue(doc, key);
  if (value === null) return field.reason === "unreadable";
  if (
    value.length > (key === "address" ? 500 : key === "id_number" ? 40 : 160) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) ||
    !normalizeField(key, value)
  )
    return true;
  if (review.edited) return !review.confirmed;
  return (
    (!review.confirmed &&
      (field.confidence === "low" || field.reason !== null)) ||
    field.reason === "invalid_length" ||
    field.reason === "invalid_characters"
  );
}
function evidence(doc: CaseDocument, key: FieldKey) {
  const f = doc.extraction.fields[key],
    r = doc.reviews[key],
    value = effectiveValue(doc, key);
  const show = (v: string | null) =>
    key === "id_number" ? (v === null ? null : maskIdentity(v)) : v;
  return {
    documentId: doc.id,
    documentLabel: doc.label,
    originalValue: show(f.rawValue),
    value: show(value),
    normalizedValue: show(normalizeField(key, value)),
    edited: r.edited,
    pageNumber: f.pageNumber,
    location:
      key === "id_number"
        ? null
        : (f.evidenceLocation?.replace(/[0-9০-৯]{5,}/gu, "••••") ?? null),
  };
}
export function comparePair(
  left: CaseDocument,
  right: CaseDocument,
  key: FieldKey,
): Finding {
  const a = effectiveValue(left, key),
    b = effectiveValue(right, key),
    na = normalizeField(key, a),
    nb = normalizeField(key, b);
  let status: FindingStatus, rule: string;
  const names = key.includes("name");
  if (
    key === "issue_date" ||
    (key === "id_number" && left.documentType !== right.documentType)
  ) {
    status = "not_applicable";
    rule = "document-specific";
  } else if (isUncertain(left, key) || isUncertain(right, key)) {
    status = "unreadable";
    rule = "ocr-uncertainty";
  } else if (a === null || b === null) {
    status = "missing";
    rule = "missing-field";
  } else if (a === b) {
    status = "match";
    rule = "exact";
  } else if (na === nb) {
    status = "format_difference";
    rule = "normalization";
  } else if (
    names &&
    (differentScripts(a, b) ||
      stripHonorifics(na!) === stripHonorifics(nb!) ||
      tokens(na!) === tokens(nb!) ||
      (jaroWinkler(na!, nb!) >= 0.92 && levenshtein(na!, nb!) <= 2))
  ) {
    status = "possible_variation";
    rule = differentScripts(a, b) ? "cross-script" : "name-variation";
  } else {
    status = "possible_discrepancy";
    rule = "unequal-values";
  }
  const severity =
    status === "possible_discrepancy"
      ? "action_required"
      : ["possible_variation", "unreadable", "missing"].includes(status)
        ? "review"
        : "info";
  const stepCode =
    status === "possible_discrepancy"
      ? "verify_difference"
      : status === "possible_variation"
        ? "verify_variation"
        : status === "unreadable"
          ? "read_again"
          : status === "missing"
            ? "provide_if_needed"
            : status === "format_difference"
              ? "check_format"
              : "none";
  return {
    id: `${left.id}--${right.id}--${key}`,
    field: key,
    status,
    severity,
    left: evidence(left, key),
    right: evidence(right, key),
    matchingRule: rule,
    ruleId: null,
    sourceUrl: `/matching-rules#${rule}`,
    stepCode,
    explanationCode: status,
  };
}
export function compareDocumentFields(
  documents: CaseDocument[],
  _rules: ActiveRule[] = [],
) {
  if (!confirmationComplete(documents))
    throw new Error("CONFIRMATION_REQUIRED");
  const findings: Finding[] = [];
  for (let i = 0; i < documents.length; i++)
    for (let j = i + 1; j < documents.length; j++)
      for (const key of fieldKeys)
        findings.push(comparePair(documents[i], documents[j], key));
  return findings;
}
