import { comparePair } from "./domain/compare";
import { documentSchema } from "./domain/types";
import { z } from "zod";
import { fieldKeys, type Fixture, type PipelineResult } from "./schemas";
export type Outcome = {
  fixture: Fixture;
  result?: PipelineResult;
  error?: string;
};
const metricSchema = z.object({
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1).nullable(),
});
export const evaluationSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  mode: z.enum(["live_gemini", "mock_test"]),
  status: z.enum(["completed", "partial_failure", "blocked"]),
  model: z.string().nullable(),
  datasetVersion: z.literal(1),
  datasetHash: z.string(),
  attempted: z.number().int(),
  completed: z.number().int(),
  failures: z.array(z.object({ fixtureId: z.string(), code: z.string() })),
  metrics: z
    .object({
      presentFields: metricSchema,
      banglaText: metricSchema,
      englishText: metricSchema,
      missingFields: metricSchema,
      rejections: metricSchema,
    })
    .nullable(),
  conflictDetection: z.object({
    status: z.enum(["measured", "not_run"]),
    precision: z.number().min(0).max(1).nullable(),
    recall: z.number().min(0).max(1).nullable(),
    truePositives: z.number().int(),
    falsePositives: z.number().int(),
    falseNegatives: z.number().int(),
    testedComparisons: z.number().int(),
    totalComparisons: z.number().int(),
    exactStatusMatches: z.number().int(),
  }),
  limitations: z.array(z.string()),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export function scoreOutcomes(
  outcomes: Outcome[],
): NonNullable<Evaluation["metrics"]> {
  const tally = {
    presentFields: { correct: 0, total: 0 },
    banglaText: { correct: 0, total: 0 },
    englishText: { correct: 0, total: 0 },
    missingFields: { correct: 0, total: 0 },
    rejections: { correct: 0, total: 0 },
  };
  for (const { fixture, result } of outcomes) {
    const rejectionCorrect =
      !!result &&
      (fixture.expectedRejection
        ? result.identification.reason === fixture.expectedRejection
        : result.identification.readable &&
          result.identification.documentType === fixture.documentType);
    tally.rejections.total++;
    if (rejectionCorrect) tally.rejections.correct++;
    if (fixture.expectedRejection) continue; // Illegible and wrong-document cards do not have readable OCR targets.
    for (const key of fieldKeys) {
      const expected = fixture.fields[key];
      const observed = result?.extraction?.fields[key].rawValue;
      const correct =
        observed !== undefined &&
        (expected === null
          ? observed === null
          : observed?.normalize("NFC") === expected.normalize("NFC"));
      const buckets: (keyof typeof tally)[] =
        expected === null ? ["missingFields"] : ["presentFields"];
      if (
        expected !== null &&
        !["date_of_birth", "issue_date", "id_number"].includes(key)
      )
        buckets.push(
          /[\u0980-\u09ff]/u.test(expected) ? "banglaText" : "englishText",
        );
      for (const bucket of buckets) {
        tally[bucket].total++;
        if (correct) tally[bucket].correct++;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(tally).map(([k, v]) => [
      k,
      { ...v, accuracy: v.total ? v.correct / v.total : null },
    ]),
  ) as NonNullable<Evaluation["metrics"]>;
}

export function scoreConflicts(
  outcomes: Outcome[],
  scenarios: {
    left: string;
    right: string;
    field: (typeof fieldKeys)[number];
    expected: string;
  }[],
  blocked = false,
): Evaluation["conflictDetection"] {
  let truePositives = 0,
    falsePositives = 0,
    falseNegatives = 0,
    testedComparisons = 0,
    exactStatusMatches = 0;
  if (!blocked)
    for (const s of scenarios) {
      const left = outcomes.find((o) => o.fixture.id === s.left),
        right = outcomes.find((o) => o.fixture.id === s.right);
      const expected = s.expected === "possible_discrepancy";
      if (!left?.result?.extraction || !right?.result?.extraction) {
        if (expected) falseNegatives++;
        continue;
      }
      const toDoc = (o: Outcome) => ({
        id: o.fixture.id,
        label: o.fixture.id,
        documentType: o.result!.identification.documentType,
        extraction: o.result!.extraction!,
        reviews: Object.fromEntries(
          fieldKeys.map((k) => [
            k,
            {
              confirmed: true,
              edited: false,
              value: o.result!.extraction!.fields[k].rawValue,
            },
          ]),
        ),
        mode: "synthetic_fixture",
        sampleId: o.fixture.id,
      });
      const actual = comparePair(
        documentSchema.parse(toDoc(left)),
        documentSchema.parse(toDoc(right)),
        s.field,
      ).status;
      testedComparisons++;
      if (actual === s.expected) exactStatusMatches++;
      const positive = actual === "possible_discrepancy";
      if (expected && positive) truePositives++;
      if (!expected && positive) falsePositives++;
      if (expected && !positive) falseNegatives++;
    }
  return {
    status: blocked ? "not_run" : "measured",
    precision:
      truePositives + falsePositives
        ? truePositives / (truePositives + falsePositives)
        : null,
    recall:
      !blocked && truePositives + falseNegatives
        ? truePositives / (truePositives + falseNegatives)
        : null,
    truePositives,
    falsePositives,
    falseNegatives,
    testedComparisons,
    totalComparisons: scenarios.length,
    exactStatusMatches,
  };
}
