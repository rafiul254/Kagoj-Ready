import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import samples from "../src/data/samples.json";
import { manifestSchema } from "../src/lib/schemas";
import { MockProvider } from "../src/lib/ai/mock";
import { extractWithAgent } from "../src/lib/agent/extract";
import { resumeAfterConfirmation, findingDiff } from "../src/lib/agent/report";
import { CaseBudget } from "../src/lib/agent/budget";
import { assertAllowed, transition } from "../src/lib/agent/machine";
import { sampleDoc } from "./helpers/fixtures";
import type { AgentEvent } from "../src/lib/domain/types";
const context = {
  service: "passport",
  ageBand: "20_plus",
  applicationType: "first_time",
  location: "bangladesh",
} as const;
describe("Phase 3 guarded workflow", () => {
  it("rejects arbitrary tools and skipping confirmation", () => {
    expect(() => assertAllowed("EXTRACT", "generateReport")).toThrow(
      "TOOL_NOT_ALLOWED",
    );
    expect(() => transition("EXTRACT", "REPORT")).toThrow(
      "TRANSITION_NOT_ALLOWED",
    );
    expect(transition("REPORT", "COLLECT_DOCUMENTS")).toBe("COLLECT_DOCUMENTS");
  });
  it("has a hard 12-generation case limit", () => {
    const budget = new CaseBudget();
    for (let i = 0; i < 12; i++) budget.reserve(1);
    expect(() => budget.reserve(1)).toThrow("TOKEN_BUDGET");
  });
  it("checks token reservations before spending", () => {
    const budget = new CaseBudget(12, 100);
    expect(() => budget.reserve(101)).toThrow("TOKEN_BUDGET");
    expect(budget.steps).toBe(0);
  });
  it("streams actual steps and always pauses before comparison", async () => {
    const f = manifestSchema.parse(samples).fixtures[0],
      trace: AgentEvent[] = [];
    const result = await extractWithAgent(
      {
        bytes: await readFile("public" + f.file),
        mimeType: "image/png",
        filename: "baseline.png",
        language: "en",
        context,
        documentId: "doc1",
        label: "doc1",
        sampleId: f.id,
      },
      new MockProvider(f),
      (e) => trace.push(e),
    );
    expect(result.document!.reviews.name_en.confirmed).toBe(false);
    expect(trace.at(-1)).toMatchObject({
      state: "AWAIT_USER_CONFIRMATION",
      status: "pending",
    });
    expect(() =>
      resumeAfterConfirmation(context, [result.document!], "en"),
    ).toThrow("CONFIRMATION_REQUIRED");
  });
  it("resumes to a validated report and re-plans only affected pairs", async () => {
    const docs = [
      await sampleDoc("baseline"),
      await sampleDoc("parent"),
      await sampleDoc("format"),
    ];
    const before = resumeAfterConfirmation(context, docs, "en");
    expect(before.mode).toBe("synthetic_fixture");
    expect(before.unverified_items.length).toBeGreaterThan(0);
    const corrected = structuredClone(docs);
    corrected[1].reviews.mother_name = {
      value: "Kalpo Jonaki",
      edited: true,
      confirmed: true,
    };
    const after = resumeAfterConfirmation(
      context,
      corrected,
      "en",
      [],
      before,
      "parent",
    );
    const diff = findingDiff(before, after);
    expect(
      diff.some(
        (d) => d.before === "possible_discrepancy" && d.after === "match",
      ),
    ).toBe(true);
    expect(
      after.findings.filter(
        (f) =>
          f.left.documentId === "baseline" && f.right.documentId === "format",
      ),
    ).toEqual(
      before.findings.filter(
        (f) =>
          f.left.documentId === "baseline" && f.right.documentId === "format",
      ),
    );
    expect(JSON.stringify(after)).not.toContain("SAMPLE-000001");
  });
});
it("refines a field at most twice without overwriting original evidence", async () => {
  const fixture = manifestSchema.parse(samples).fixtures[0];
  let calls = 0;
  class Refiner extends MockProvider {
    async extractDocumentFields() {
      const value = await super.extractDocumentFields();
      value.fields.name_en.confidence = "low";
      return value;
    }
    async chooseExtractionTool(
      eligible: import("../src/lib/schemas").FieldKey[],
    ) {
      return eligible.length
        ? { name: "refineExtraction" as const, args: { fieldKey: eligible[0] } }
        : { name: "requestUserConfirmation" as const, args: {} };
    }
    async refineExtraction() {
      calls++;
      return {
        rawValue: "Namuna Meghla",
        confidence: "low" as const,
        pageNumber: 1 as const,
        evidenceLocation: "Name row",
        reason: null,
      };
    }
  }
  const result = await extractWithAgent(
    {
      bytes: await readFile("public" + fixture.file),
      mimeType: "image/png",
      filename: "baseline.png",
      language: "en",
      context,
      documentId: "doc1",
      label: "doc1",
      sampleId: fixture.id,
    },
    new Refiner(fixture),
    () => {},
  );
  expect(calls).toBe(2);
  expect(result.document!.refinements).toHaveLength(2);
  expect(result.document!.refinements[0].before.rawValue).toBe("Namuna Meghla");
});
it("rejects a provider choosing a non-eligible refinement", async () => {
  const fixture = manifestSchema.parse(samples).fixtures[0];
  class Bad extends MockProvider {
    async chooseExtractionTool() {
      return {
        name: "refineExtraction" as const,
        args: { fieldKey: "name_en" as const },
      };
    }
    async refineExtraction() {
      throw new Error("must not run");
    }
  }
  await expect(
    extractWithAgent(
      {
        bytes: await readFile("public" + fixture.file),
        mimeType: "image/png",
        filename: "baseline.png",
        language: "en",
        context,
        documentId: "doc1",
        label: "doc1",
        sampleId: fixture.id,
      },
      new Bad(fixture),
      () => {},
    ),
  ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
});
