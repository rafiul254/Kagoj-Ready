import { asciiDigits, validDate } from "../sanity";
import type { FieldKey } from "../schemas";
export function clean(value: string) {
  return asciiDigits(value.normalize("NFKC"))
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .replace(/\s+/gu, " ");
}
export function normalizedDate(value: string): string | null {
  const text = clean(value);
  if (!validDate(text)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const [d, m, y] = text.split(/[/.\-]/);
  return `${y}-${m}-${d}`;
}
export function normalizeField(key: FieldKey, value: string | null) {
  if (value === null) return null;
  if (key === "date_of_birth" || key === "issue_date")
    return normalizedDate(value);
  const text = clean(value).toLocaleLowerCase("en");
  if (key === "id_number") return text.replace(/[\s-]/gu, "");
  return text
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
export function stripHonorifics(value: string) {
  return value.replace(/^(mr|mrs|ms|miss|dr|শ্রী|জনাব|বেগম)\s+/iu, "");
}
export function tokens(value: string) {
  return value.split(/\s+/u).filter(Boolean).sort().join(" ");
}
export function levenshtein(a: string, b: string) {
  const x = [...a],
    y = [...b];
  let row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[y.length];
}
export function jaroWinkler(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const span = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1),
    am = Array(a.length).fill(false),
    bm = Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++)
    for (
      let j = Math.max(0, i - span);
      j < Math.min(b.length, i + span + 1);
      j++
    )
      if (!bm[j] && a[i] === b[j]) {
        am[i] = true;
        bm[j] = true;
        matches++;
        break;
      }
  if (!matches) return 0;
  const aa = [...a].filter((_, i) => am[i]),
    bb = [...b].filter((_, i) => bm[i]);
  const trans = aa.filter((c, i) => c !== bb[i]).length / 2;
  const j =
    (matches / a.length + matches / b.length + (matches - trans) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix])
    prefix++;
  return j > 0.7 ? j + prefix * 0.1 * (1 - j) : j;
}
export function differentScripts(a: string, b: string) {
  const bn = (s: string) => /[\u0980-\u09ff]/u.test(s),
    latin = (s: string) => /[a-z]/i.test(s);
  return bn(a) !== bn(b) && ((bn(a) && latin(b)) || (bn(b) && latin(a)));
}
