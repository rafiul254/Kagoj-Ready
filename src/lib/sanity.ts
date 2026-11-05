import { extractionSchema, fieldKeys, type Extraction } from "./schemas";
export function asciiDigits(s: string) {
  return s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));
}
export function validDate(s: string, now = new Date()): boolean {
  const value = asciiDigits(s).trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    [, y, m, d] = match.map(Number);
  } else {
    match = /^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/.exec(value);
    if (!match) return false;
    [, d, m, y] = match.map(Number);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    y >= 1900 &&
    dt <= now &&
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
export function sanitizeExtraction(input: unknown): Extraction {
  const result = extractionSchema.parse(input);
  for (const key of fieldKeys) {
    const field = result.fields[key];
    if (field.rawValue === null) {
      field.confidence = "low";
      field.reason = field.reason === "unreadable" ? "unreadable" : "missing";
      continue;
    }
    if (!field.rawValue.trim()) {
      field.rawValue = null;
      field.confidence = "low";
      field.reason = "unreadable";
      continue;
    }
    if (!field.evidenceLocation) {
      field.confidence = "low";
      field.reason = "unreadable";
    }
    if (
      (key === "date_of_birth" || key === "issue_date") &&
      !validDate(field.rawValue)
    ) {
      field.confidence = "low";
      field.reason = "implausible_date";
    }
    const limit = key === "address" ? 500 : key === "id_number" ? 40 : 160;
    if (field.rawValue.length > limit) {
      field.confidence = "low";
      field.reason = "invalid_length";
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(field.rawValue)) {
      field.confidence = "low";
      field.reason = "invalid_characters";
    }
    if (field.reason) field.confidence = "low";
  }
  return result;
}
export function maskIdentity(value: string | null) {
  return value ? "•••• " + value.slice(-4) : "—";
}
