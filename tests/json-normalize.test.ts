import { describe, expect, it } from "vitest";
import { parseModelJson } from "../src/lib/ai/json";
import { extractionSchema, identificationSchema } from "../src/lib/schemas";

describe("lenient model output normalisation", () => {
  it("accepts a near-miss identification", () => {
    const r = parseModelJson(
      '```json\n{"documentType":"Birth Certificate","readable":"true","reason":"none","extra":1}\n```',
      identificationSchema,
    );
    expect(r).toEqual({
      documentType: "birth_certificate",
      readable: true,
      reason: null,
    });
  });
  it("accepts near-miss extraction and still validates", () => {
    const r = parseModelJson(
      JSON.stringify({
        name_en: { rawValue: "Sumaiya", confidence: "HIGH", pageNumber: "1" },
        mother_name: "Rahima Begum",
      }),
      extractionSchema,
    );
    expect(r.fields.name_en.rawValue).toBe("Sumaiya");
    expect(r.fields.mother_name.rawValue).toBe("Rahima Begum");
    expect(r.fields.address.reason).toBe("missing");
  });
  it("still rejects non-JSON prose", () => {
    expect(() =>
      parseModelJson("I cannot read this", identificationSchema),
    ).toThrow();
  });
});
