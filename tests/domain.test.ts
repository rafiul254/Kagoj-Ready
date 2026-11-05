import { describe, it, expect } from "vitest";
import { manifestSchema, fieldKeys } from "../src/lib/schemas";
import samples from "../src/data/samples.json";
import { MockProvider } from "../src/lib/ai/mock";
import { type CaseDocument, documentSchema } from "../src/lib/domain/types";
import {
  classifyServiceCase,
  retrieveOfficialRequirements,
  registry,
} from "../src/lib/domain/registry";
import {
  normalizeField,
  levenshtein,
  jaroWinkler,
} from "../src/lib/domain/normalize";
import {
  comparePair,
  compareDocumentFields,
  confirmationComplete,
} from "../src/lib/domain/compare";
import { buildChecklist, missingDocuments } from "../src/lib/domain/checklist";
const manifest = manifestSchema.parse(samples);
const context = {
  service: "passport",
  ageBand: "20_plus",
  applicationType: "first_time",
  location: "bangladesh",
} as const;
import { sampleDoc } from "./helpers/fixtures";
describe("Phase 2 deterministic engine", () => {
  it("supports any complete passport context, with rule coverage reported separately", () => {
    const base = classifyServiceCase(context);
    expect(base.supported).toBe(true);
    expect(base.ruleMatched).toBe(true);
    for (const delta of [
      { ageBand: "18_19" },
      { ageBand: "under_18" },
      { applicationType: "reissue" },
      { applicationType: "other" },
      { location: "abroad" },
    ]) {
      const verdict = classifyServiceCase({ ...context, ...delta });
      expect(verdict.supported).toBe(true);
      expect(verdict.ruleMatched).toBe(false);
      expect(verdict.applicableRuleIds).toEqual([]);
    }
    expect(classifyServiceCase({ ...context, service: "nid" }).supported).toBe(
      false,
    );
    expect(classifyServiceCase({}).missingContext.length).toBeGreaterThan(0);
  });
  it("never inherits another applicant category", () => {
    expect(
      retrieveOfficialRequirements({ ...context, ageBand: "18_19" }),
    ).toEqual([]);
  });
  it("does not treat placeholders as usable rules", () => {
    expect(
      retrieveOfficialRequirements(context).every((r) => !r.usable && r.stale),
    ).toBe(true);
  });
  it("expires verified rules and rejects future verification dates", () => {
    for (const verifiedAt of ["2020-01-01T00:00:00Z", "2100-01-01T00:00:00Z"]) {
      const rule = {
        ...registry.rules[0],
        verificationStatus: "verified" as const,
        verifiedAt,
      };
      expect(retrieveOfficialRequirements(context, [rule])[0].usable).toBe(
        false,
      );
    }
  });
  it("normalizes Bangla digits, Unicode, punctuation and dates deterministically", () => {
    expect(normalizeField("date_of_birth", "১২/০৪/১৯৯৮")).toBe("1998-04-12");
    expect(normalizeField("name_en", "  ＮＡＭＵＮＡ, Meghla ")).toBe(
      "namuna meghla",
    );
    expect(normalizeField("date_of_birth", "31/02/1998")).toBeNull();
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(jaroWinkler("same", "same")).toBe(1);
  });
  for (const scenario of manifest.conflicts)
    it(`matches ground truth ${scenario.right}/${scenario.field}`, async () => {
      expect(
        comparePair(
          await sampleDoc(scenario.left),
          await sampleDoc(scenario.right),
          scenario.field,
        ).status,
      ).toBe(scenario.expected);
    });
  it("blocks comparison before confirmation", async () => {
    const a = await sampleDoc("baseline");
    a.reviews.name_en.confirmed = false;
    expect(confirmationComplete([a])).toBe(false);
    expect(() => compareDocumentFields([a])).toThrow("CONFIRMATION_REQUIRED");
  });
  it("keeps OCR uncertainty distinct from discrepancies", async () => {
    const a = await sampleDoc("baseline"),
      b = await sampleDoc("parent");
    b.extraction.fields.mother_name.confidence = "low";
    b.reviews.mother_name.confirmed = false;
    expect(comparePair(a, b, "mother_name").status).toBe("unreadable");
  });
  it("does not compare document-specific identifiers", async () => {
    const a = await sampleDoc("baseline"),
      b = await sampleDoc("parent");
    expect(comparePair(a, b, "id_number").status).toBe("not_applicable");
    expect(comparePair(a, b, "issue_date").status).toBe("not_applicable");
  });
  it("edits preserve the original evidence and mask identity numbers", async () => {
    const a = await sampleDoc("baseline"),
      b = await sampleDoc("parent");
    b.reviews.mother_name = {
      confirmed: true,
      edited: true,
      value: a.extraction.fields.mother_name.rawValue,
    };
    const finding = comparePair(a, b, "mother_name");
    expect(finding.status).toBe("match");
    expect(finding.right.originalValue).toBe("Kalpo Tara");
    expect(comparePair(a, a, "id_number").left.value).toBe("•••• 0001");
  });
  it("never creates mandatory tasks from unverified rules", async () => {
    const rules = retrieveOfficialRequirements(context);
    const a = await sampleDoc("baseline");
    expect(missingDocuments([a], rules)).toEqual([]);
    expect(buildChecklist([], rules, []).map((i) => i.priority)).toEqual([
      "confirm manually",
    ]);
  });
  it("creates dependent mandatory tasks only from usable rules", async () => {
    const rule = {
      ...registry.rules[0],
      verifiedAt: new Date().toISOString(),
      verificationStatus: "verified" as const,
      requiredDocuments: ["passport" as const],
    };
    const rules = retrieveOfficialRequirements(context, [rule]);
    const a = await sampleDoc("baseline"),
      b = await sampleDoc("parent");
    const items = buildChecklist(
      compareDocumentFields([a, b]),
      rules,
      missingDocuments([a, b], rules),
    );
    expect(items.at(-1)?.priority).toBe("mandatory");
    expect(items.at(-1)?.dependsOn.length).toBeGreaterThan(0);
  });
});
