import { z } from "zod";
import { SafeError } from "../errors";

// Free chat models often answer in prose or wrap the payload in a markdown
// fence despite response_format, so a strict JSON.parse of the raw text is
// not enough. Returns the first balanced {...} object found after stripping
// a surrounding fence, or null when no complete object exists.
export function extractJsonObject(text: string): string | null {
  let body = text.trim();
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  return null;
}

const FIELD_KEYS = [
  "name_bn",
  "name_en",
  "father_name",
  "mother_name",
  "date_of_birth",
  "id_number",
  "address",
  "issue_date",
];
const FIELD_REASONS = [
  "missing",
  "unreadable",
  "implausible_date",
  "invalid_length",
  "invalid_characters",
];
const REJECTIONS = [
  "blurry",
  "cropped",
  "glare",
  "wrong_document",
  "unreadable",
];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nullish = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === "string" &&
    ["", "null", "none", "n/a", "na", "undefined", "-"].includes(
      v.trim().toLowerCase(),
    ));
const slug = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

function normalizeField(v: unknown) {
  const o = isObj(v) ? v : { rawValue: v };
  let raw: string | null = nullish(o.rawValue ?? o.value)
    ? null
    : String(o.rawValue ?? o.value)
        .trim()
        .slice(0, 500);
  if (raw === "") raw = null;
  const conf = slug(o.confidence);
  const confidence = ["high", "medium", "low"].includes(conf)
    ? conf
    : raw === null
      ? "low"
      : "medium";
  const loc = nullish(o.evidenceLocation)
    ? null
    : String(o.evidenceLocation).trim().slice(0, 120) || null;
  let reason: string | null = nullish(o.reason) ? null : slug(o.reason);
  if (reason !== null && !FIELD_REASONS.includes(reason)) reason = null;
  if (raw === null && reason === null) reason = "missing";
  return {
    rawValue: raw,
    confidence: raw === null ? "low" : confidence,
    pageNumber: 1,
    evidenceLocation: loc,
    reason: raw === null ? reason : reason,
  };
}

// Tidy common free-model deviations (string page numbers, odd casing, extra
// keys, empty strings for null). The result is STILL validated by the strict
// schema, so this can only turn a near-miss into a valid object.
export function normalizeModelPayload(input: unknown): unknown {
  if (!isObj(input)) return input;
  if ("documentType" in input || "document_type" in input) {
    const t = slug(input.documentType ?? input.document_type);
    const documentType = t.includes("birth")
      ? "birth_certificate"
      : t === "nid" || t.includes("national")
        ? "nid"
        : t.includes("passport")
          ? "passport"
          : "other";
    const rd = input.readable;
    const readable =
      typeof rd === "string" ? rd.trim().toLowerCase() === "true" : Boolean(rd);
    let reason: string | null = nullish(input.reason)
      ? null
      : slug(input.reason);
    if (reason !== null && !REJECTIONS.includes(reason)) reason = "unreadable";
    // Never repair semantics: an inconsistent answer must still be rejected
    // by the strict schema's refinement.
    return { documentType, readable, reason };
  }
  const src = isObj(input.fields)
    ? input.fields
    : FIELD_KEYS.some((k) => k in input)
      ? input
      : null;
  if (src) {
    return {
      fields: Object.fromEntries(
        FIELD_KEYS.map((k) => [k, normalizeField(src[k])]),
      ),
    };
  }
  return input;
}

// Parse a model response into a schema-validated value: direct JSON first,
// then the repaired object. Throws SafeError("INVALID_OUTPUT") on failure so
// the provider chain can move to the next model.
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    // Fall through to repair.
  }
  const repaired = extractJsonObject(text);
  if (repaired) {
    try {
      return schema.parse(JSON.parse(repaired));
    } catch {
      // Try normalising below.
    }
    try {
      return schema.parse(normalizeModelPayload(JSON.parse(repaired)));
    } catch {
      // Not salvageable.
    }
  }
  throw new SafeError("INVALID_OUTPUT");
}
