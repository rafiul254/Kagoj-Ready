import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import samples from "../src/data/samples.json";
import { manifestSchema } from "../src/lib/schemas";
import { AgentGeminiProvider } from "../src/lib/agent/provider";
import { CaseBudget } from "../src/lib/agent/budget";
import { extractWithAgent } from "../src/lib/agent/extract";
import { MockProvider } from "../src/lib/ai/mock";
import { processDocument } from "../src/lib/pipeline";
import {
  evaluationSchema,
  scoreOutcomes,
  scoreConflicts,
  type Outcome,
} from "../src/lib/evaluation";
import { safeCode } from "../src/lib/errors";
async function main() {
  const manifest = manifestSchema.parse(samples);
  const mock = process.argv.includes("--mock");
  const mode = mock ? "mock_test" : "live_gemini";
  const outcomes: Outcome[] = [];
  const blocked =
    !mock && (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL);
  // The only inputs this script accepts are the version-controlled synthetic manifest.
  // No arbitrary image path, uploads, or extracted values are persisted in results.
  const bytesById = new Map<string, Buffer>();
  for (const f of manifest.fixtures) {
    const bytes = await readFile(resolve("public", f.file.slice(1)));
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
      throw new Error("FIXTURE_INTEGRITY");
    bytesById.set(f.id, bytes);
  }
  if (!blocked)
    for (const fixture of manifest.fixtures) {
      try {
        const provider = mock
          ? new MockProvider(fixture)
          : new AgentGeminiProvider(new CaseBudget());
        const extracted = await extractWithAgent(
          {
            bytes: bytesById.get(fixture.id)!,
            mimeType: "image/png",
            filename: fixture.id + ".png",
            language: "bn",
            context: { service: "passport", ...manifest.context },
            documentId: "doc-1",
            label: "SAMPLE",
            sampleId: fixture.id,
          },
          provider,
          () => {},
          AbortSignal.timeout(50000),
        );
        const result = {
          mode: provider.mode,
          identification: extracted.identification,
          extraction: extracted.document?.extraction ?? null,
          trace: [],
          usage: provider.usage(),
        };
        outcomes.push({ fixture, result });
      } catch (e) {
        outcomes.push({ fixture, error: safeCode(e) });
      }
    }
  const report = evaluationSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    status: blocked
      ? "blocked"
      : outcomes.some((o) => o.error)
        ? "partial_failure"
        : "completed",
    model: mock ? null : (process.env.GEMINI_MODEL ?? null),
    datasetVersion: manifest.version,
    datasetHash: createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
    attempted: outcomes.length,
    completed: outcomes.filter((o) => o.result).length,
    failures: blocked
      ? [{ fixtureId: "all", code: "NOT_CONFIGURED" }]
      : outcomes
          .filter((o) => o.error)
          .map((o) => ({ fixtureId: o.fixture.id, code: o.error })),
    metrics: blocked ? null : scoreOutcomes(outcomes),
    conflictDetection: scoreConflicts(outcomes, manifest.conflicts, blocked),
    limitations: [
      "Eight synthetic diagnostic cards, not authentic government templates. No real-world accuracy claim.",
      "Strict NFC exact field match; whitespace differences count as OCR errors. Dates and IDs excluded from language-specific text groups.",
      "Failed readable documents count against every expected field; missing-field correctness is reported separately.",
      "Blurred and wrong-document cards are scored for identification/rejection, not field extraction.",
      "Confidence is model-reported, not calibrated probability. Extractions have not been human-confirmed.",
      mock
        ? "MOCK TEST: values supplied from ground truth; metrics verify plumbing only, NOT Gemini accuracy."
        : "Live model accuracy is unavailable when blocked. No automatic mock fallback.",
      "Conflict metrics compare raw extraction outputs after automated evaluation-only acknowledgement, not real user confirmation. Missing readable runs count as false negatives for expected conflicts.",
    ],
  });
  if (!mock && !blocked && outcomes.some((o) => o.result)) {
    await writeFile(
      "src/data/recorded-samples.json",
      JSON.stringify(
        {
          schemaVersion: 1,
          recordedAt: new Date().toISOString(),
          model: process.env.GEMINI_MODEL,
          fixtures: Object.fromEntries(
            outcomes
              .filter((o) => o.result)
              .map((o) => [
                o.fixture.id,
                { sha256: o.fixture.sha256, result: o.result },
              ]),
          ),
        },
        null,
        2,
      ) + "\n",
    );
  }
  await mkdir("evaluation", { recursive: true });
  const file = mock ? "evaluation/mock-test.json" : "evaluation/latest.json";
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        file,
        mode,
        status: report.status,
        attempted: report.attempted,
        completed: report.completed,
        metrics: report.metrics,
      },
      null,
      2,
    ),
  );
  if (report.status !== "completed") process.exitCode = 2;
}
main().catch(() => {
  console.error(
    "Evaluation stopped: configuration or fixture integrity error. No document content logged.",
  );
  process.exitCode = 1;
});
