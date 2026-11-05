import { describe, it, expect } from "vitest";
import {
  fieldKeys,
  extractionSchema,
  identificationSchema,
  manifestSchema,
} from "../src/lib/schemas";
import {
  asciiDigits,
  validDate,
  sanitizeExtraction,
  maskIdentity,
} from "../src/lib/sanity";
import { MockProvider } from "../src/lib/ai/mock";
import samples from "../src/data/samples.json";
const manifest = manifestSchema.parse(samples);
describe("runtime schemas and sanity checks", () => {
  it("validates eight synthetic ground-truth cards", () => {
    expect(manifest.fixtures).toHaveLength(8);
    expect(manifest.synthetic).toBe(true);
  });
  it.each([
    "1900-02-29",
    "1999-02-29",
    "2039-01-01",
    "2020-04-31",
    "1899-01-01",
    "01-13-2000",
    "not a date",
  ])("flags implausible date %s", (date) =>
    expect(validDate(date, new Date("2026-10-14"))).toBe(false),
  );
  it.each(["2000-02-29", "1998-04-12", "১২/০৪/১৯৯৮", "12.04.1998"])(
    "accepts supported plausible date %s",
    (date) => expect(validDate(date)).toBe(true),
  );
  it("converts digits without changing other text", () =>
    expect(asciiDigits("কাগজ ১২৩")).toBe("কাগজ 123"));
  it("keeps original implausible OCR as low-confidence evidence", async () => {
    const extraction = await new MockProvider(
      manifest.fixtures[0],
    ).extractDocumentFields();
    extraction.fields.date_of_birth.rawValue = "1999-02-29";
    const result = sanitizeExtraction(extraction);
    expect(result.fields.date_of_birth).toMatchObject({
      rawValue: "1999-02-29",
      confidence: "low",
      reason: "implausible_date",
    });
  });
  it("does not allow missing evidence to be high confidence", async () => {
    const extraction = await new MockProvider(
      manifest.fixtures[0],
    ).extractDocumentFields();
    extraction.fields.name_en.evidenceLocation = null;
    expect(sanitizeExtraction(extraction).fields.name_en.confidence).toBe(
      "low",
    );
  });
  it("preserves a null field, never filling from another document", async () => {
    const data = await new MockProvider(
      manifest.fixtures[5],
    ).extractDocumentFields();
    const result = sanitizeExtraction(data);
    expect(result.fields.mother_name).toMatchObject({
      rawValue: null,
      confidence: "low",
      reason: "missing",
    });
  });
  it("rejects overlong fields and unexpected keys", async () => {
    const data = await new MockProvider(
      manifest.fixtures[0],
    ).extractDocumentFields();
    data.fields.address.rawValue = "x".repeat(501);
    expect(() => extractionSchema.parse(data)).toThrow();
    expect(() =>
      extractionSchema.parse({ fields: {}, instructions: "ignore rules" }),
    ).toThrow();
  });
  it("rejects contradictory identification", () => {
    expect(() =>
      identificationSchema.parse({
        documentType: "other",
        readable: true,
        reason: null,
      }),
    ).toThrow();
    expect(() =>
      identificationSchema.parse({
        documentType: "nid",
        readable: false,
        reason: null,
      }),
    ).toThrow();
  });
  it("requires every field in the schema", () => {
    expect(fieldKeys).toHaveLength(8);
    expect(() =>
      extractionSchema.parse({ fields: { name_en: "Name" } }),
    ).toThrow();
  });
  it("only displays last four identity characters", () => {
    expect(maskIdentity("1234567890")).toBe("•••• 7890");
    expect(maskIdentity(null)).toBe("—");
  });
  it("downgrades unsupported date formats rather than guessing", async () => {
    const data = await new MockProvider(
      manifest.fixtures[0],
    ).extractDocumentFields();
    data.fields.issue_date.rawValue = "15 JAN 2022";
    expect(sanitizeExtraction(data).fields.issue_date.reason).toBe(
      "implausible_date",
    );
  });
});
