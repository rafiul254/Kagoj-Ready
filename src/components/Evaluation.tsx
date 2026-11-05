"use client";
import Link from "next/link";
import { useUi } from "./Shell";
import { evaluationCopy } from "@/i18n/evaluation";
import type { Evaluation as EvaluationData } from "@/lib/evaluation";
export default function Evaluation({
  live,
  mock,
}: {
  live: EvaluationData;
  mock: EvaluationData;
}) {
  const { language } = useUi(),
    w = evaluationCopy[language];
  const pct = (value: number | null) =>
    value === null ? w.notMeasured : `${(value * 100).toFixed(1)}%`;
  return (
    <main id="main" className="container evaluation-page">
      <div className="eyebrow">{w.eyebrow}</div>
      <h1>{w.title}</h1>
      <p className="page-intro">{w.intro}</p>
      <div className="evaluation-grid">
        {[live, mock].map((run, i) => (
          <section className="panel" key={i}>
            <h2>{i ? w.fixture : w.live}</h2>
            {i ? (
              <p className="warning-box">{w.mockWarning}</p>
            ) : (
              run.status === "blocked" && (
                <p className="warning-box">{w.blocked}</p>
              )
            )}
            <dl className="evaluation-meta">
              <div>
                <dt>{w.attempts}</dt>
                <dd>{run.attempted}</dd>
              </div>
              <div>
                <dt>{w.completed}</dt>
                <dd>{run.completed}</dd>
              </div>
              <div>
                <dt>{w.model}</dt>
                <dd>{run.model ?? "—"}</dd>
              </div>
            </dl>
            <p className="caption">
              {w.generated}:{" "}
              {new Date(run.generatedAt).toLocaleString(
                language === "bn" ? "bn-BD" : "en-GB",
                { timeZone: "Asia/Dhaka" },
              )}{" "}
              (Asia/Dhaka)
            </p>
            <table className="metric-table">
              <thead>
                <tr>
                  <th>{w.metric}</th>
                  <th>{w.correct}</th>
                  <th>{w.accuracy}</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(w.metrics) as (keyof typeof w.metrics)[]).map(
                  (key) => (
                    <tr key={key}>
                      <th>{w.metrics[key]}</th>
                      <td>
                        {run.metrics
                          ? `${run.metrics[key].correct} / ${run.metrics[key].total}`
                          : "—"}
                      </td>
                      <td>{pct(run.metrics?.[key].accuracy ?? null)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <h3>{w.conflicts}</h3>
            <dl className="evaluation-meta">
              <div>
                <dt>{w.precision}</dt>
                <dd>{pct(run.conflictDetection.precision)}</dd>
              </div>
              <div>
                <dt>{w.recall}</dt>
                <dd>{pct(run.conflictDetection.recall)}</dd>
              </div>
            </dl>
            <p className="caption">
              {w.comparisons}: {run.conflictDetection.testedComparisons} /{" "}
              {run.conflictDetection.totalComparisons} · {w.exact}:{" "}
              {run.conflictDetection.exactStatusMatches}
            </p>
            <p className="caption">
              {w.truePositives}: {run.conflictDetection.truePositives} ·{" "}
              {w.falsePositives}: {run.conflictDetection.falsePositives} ·{" "}
              {w.falseNegatives}: {run.conflictDetection.falseNegatives}
            </p>
            {run.failures.length > 0 && (
              <details>
                <summary>{w.failures}</summary>
                {run.failures.map((f, n) => (
                  <p className="caption" key={n}>
                    {f.fixtureId}: {f.code}
                  </p>
                ))}
              </details>
            )}
            <details>
              <summary>{w.dataset}</summary>
              <code className="hash-code">{run.datasetHash}</code>
            </details>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>{w.method}</h2>
        <ul className="method-list">
          {w.methodItems.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <h3>{w.limitations}</h3>
        <p>{w.limits}</p>
      </section>
      <section className="panel">
        <h2>{w.rerun}</h2>
        <p>{w.run}</p>
        <pre>npm run eval{`\n`}npm run eval:mock</pre>
        <Link className="primary-button" href="/prepare?sample=1">
          {w.sample} →
        </Link>
      </section>
    </main>
  );
}
