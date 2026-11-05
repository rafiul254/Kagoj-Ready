"use client";
import { useState } from "react";
import { useUi } from "./Shell";
import { workflow } from "@/i18n/workflow";
import type { ReadinessReport } from "@/lib/domain/types";
import { findingDiff } from "@/lib/agent/report";
import { explainFinding } from "@/lib/domain/explain";
import { downloadReport } from "@/lib/report-export";
export default function Report({
  report,
  previous,
  checked,
  onCheck,
  onReplace,
}: {
  report: ReadinessReport;
  previous: ReadinessReport | null;
  checked: string[];
  onCheck: (ids: string[]) => void;
  onReplace: (id: string) => void;
}) {
  const { language, t } = useUi(),
    w = workflow[language];
  const [filter, setFilter] = useState("all");
  const [saveError, setSaveError] = useState(false);
  const diff = previous ? findingDiff(previous, report) : [];
  const uncertain = report.documents.flatMap((d) =>
    d.fields
      .filter((f) => f.uncertain)
      .map((f) => `${d.label} · ${t.fields[f.key]}`),
  );
  return (
    <article id="report-document" className="report-document">
      <header className="report-heading">
        <div className="eyebrow">
          {t.brand} · {t.tagline}
        </div>
        <h1>{w.reportTitle}</h1>
        <p>{w.reportIntro}</p>
        <span className={`mode-badge ${report.mode}`}>
          {w.modes[report.mode]}
        </span>
        <p className="caption">
          {w.reviewDate}:{" "}
          {new Date(report.reviewedAt).toLocaleString(
            language === "bn" ? "bn-BD" : "en-GB",
            { timeZone: "Asia/Dhaka" },
          )}{" "}
          (Asia/Dhaka)
        </p>
        <p className="caption">
          {w.ageOptions[2]} · {w.applicationOptions[0]} · {w.locationOptions[0]}
        </p>
        <div className="report-actions no-print">
          <button className="primary-button" onClick={() => window.print()}>
            {w.print}
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              downloadReport({ ...report, language }).catch(() =>
                setSaveError(true),
              )
            }
          >
            {w.download}
          </button>
        </div>
        {saveError && <p role="alert">{w.saveFailed}</p>}
      </header>
      <section className="report-summary panel">
        <h2>
          {report.documents.length < 2
            ? w.single
            : report.findings.some((f) => f.severity === "action_required")
              ? w.hasConflicts
              : w.noConflicts}
        </h2>
        <div className="summary-counts">
          {(["action_required", "review", "info"] as const).map((severity) => (
            <div key={severity}>
              <strong>
                {
                  report.findings.filter(
                    (f) =>
                      f.severity === severity && f.status !== "not_applicable",
                  ).length
                }
              </strong>
              <span>{w.severity[severity]}</span>
            </div>
          ))}
        </div>
        <p className="warning-box">{w.rulesWarning}</p>
      </section>
      {previous && (
        <section className="panel diff-panel">
          <h2>{w.diff}</h2>
          {diff.length ? (
            diff.map((d) => (
              <div className="diff-row" key={d.id}>
                <strong>{t.fields[d.field]}</strong>
                <span>
                  {w.before}: {d.before ? w.statusLabels[d.before] : "—"} (
                  {d.beforeValues.map((v) => v ?? w.missing).join(" / ")})
                </span>
                <span>
                  {w.after}: {d.after ? w.statusLabels[d.after] : "—"} (
                  {d.afterValues.map((v) => v ?? w.missing).join(" / ")})
                </span>
              </div>
            ))
          ) : (
            <p>{w.noDiff}</p>
          )}
        </section>
      )}
      <section className="report-section">
        <div className="section-heading">
          <h2>{w.findings}</h2>
          <div
            className="filter-row no-print"
            role="group"
            aria-label={w.findings}
          >
            {[
              ["all", w.viewAll],
              ["action_required", w.severity.action_required],
              ["review", w.severity.review],
              ["info", w.severity.info],
            ].map(([value, label]) => (
              <button
                className={filter === value ? "selected" : ""}
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {(["action_required", "review", "info"] as const).map((severity) => (
          <div
            key={severity}
            className={
              filter !== "all" && filter !== severity
                ? "filtered-out"
                : "finding-group"
            }
          >
            <h3 className="group-title">{w.severity[severity]}</h3>
            {report.findings
              .filter((f) => f.severity === severity)
              .map((f) => (
                <section className={`finding-card ${severity}`} key={f.id}>
                  <div className="finding-title">
                    <h3>{t.fields[f.field]}</h3>
                    <span className="status-tag">
                      {w.statusLabels[f.status]}
                    </span>
                  </div>
                  <p>{explainFinding(f, language)}</p>
                  <div className="evidence-pair">
                    {[f.left, f.right].map((side, i) => (
                      <div key={i}>
                        <strong>{side.documentLabel}</strong>
                        <span>{side.value ?? w.missing}</span>
                        <small>
                          {w.raw}: {side.originalValue ?? w.missing}
                        </small>
                        <small>
                          {w.normalized}: {side.normalizedValue ?? w.missing}
                        </small>
                        <small>
                          {w.page} {side.pageNumber}
                          {side.location ? ` · ${side.location}` : ""}
                          {side.edited ? ` · ${w.edited}` : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                  <a
                    className="rule-link"
                    href={f.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {w.softwareRule} ↗
                  </a>
                </section>
              ))}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{w.uncertain}</h2>
        {uncertain.length ? (
          <ul>
            {uncertain.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>{w.uncertainNone}</p>
        )}
      </section>
      <section className="panel checklist-section">
        <h2>{w.checklist}</h2>
        <ol>
          {report.checklist.map((item, i) => {
            const disabled = item.dependsOn.some((id) => !checked.includes(id));
            return (
              <li
                key={item.id}
                className={checked.includes(item.id) ? "checked" : ""}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={checked.includes(item.id)}
                    disabled={disabled}
                    onChange={(e) => {
                      if (e.target.checked) onCheck([...checked, item.id]);
                      else {
                        const removed = new Set([
                          item.id,
                          ...report.checklist
                            .filter((c) => c.dependsOn.includes(item.id))
                            .map((c) => c.id),
                        ]);
                        onCheck(checked.filter((id) => !removed.has(id)));
                      }
                    }}
                  />
                  <span>
                    <small>
                      {String(i + 1).padStart(2, "0")} ·{" "}
                      {w.priority[item.priority]}
                    </small>
                    <strong>
                      {item.documentType &&
                        `${w.documentTypes[item.documentType]} — `}
                      {item.field && `${t.fields[item.field]} — `}
                      {item.custom
                        ? item.custom[language]
                        : w.tasks[item.taskCode]}
                    </strong>
                  </span>
                </label>
                <p>
                  {w.why}: {w.whyCodes[item.whyCode as keyof typeof w.whyCodes]}
                </p>
                {disabled && <p className="caption">{w.depends}</p>}
                <a
                  className="rule-link"
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {w.source} ↗
                </a>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="panel">
        <h2>{w.reviewedFields}</h2>
        {report.documents.map((d) => (
          <section className="report-doc" key={d.id}>
            <div className="review-doc-heading">
              <h3>{d.label}</h3>
              <span className={`mode-badge ${d.mode}`}>{w.modes[d.mode]}</span>
              <button
                className="link-button no-print"
                onClick={() => onReplace(d.id)}
              >
                {w.replace} ↗
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.field}</th>
                    <th>{w.raw}</th>
                    <th>{w.effective}</th>
                    <th>{w.normalized}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.fields.map((f) => (
                    <tr key={f.key}>
                      <th>{t.fields[f.key]}</th>
                      <td>{f.rawValue ?? w.missing}</td>
                      <td>
                        {f.value ?? w.missing}
                        {f.edited && ` (${w.edited})`}
                      </td>
                      <td>{f.normalizedValue ?? w.missing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </section>
      <section className="panel source-section">
        <h2>{w.sources}</h2>
        {!report.sources.length && <p>{w.noRules}</p>}
        {report.sources.map((rule) => (
          <div className="source-card" key={rule.id}>
            <div className="source-badges">
              <span>{w[rule.verificationStatus]}</span>
              {rule.stale && <span>{w.stale}</span>}
            </div>
            <h3>{language === "bn" ? rule.ruleTitle_bn : rule.ruleTitle_en}</h3>
            <p>{language === "bn" ? rule.ruleText_bn : rule.ruleText_en}</p>
            <a href={rule.sourceUrl} target="_blank" rel="noreferrer">
              {rule.sourceTitle} ↗
            </a>
            <p className="caption">
              {w.verified}: {rule.verifiedAt ?? w.notVerified} · {w.published}:{" "}
              {rule.sourcePublishedAt ?? w.unknown}
            </p>
          </div>
        ))}
      </section>
      <section className="panel limitations">
        <h2>{w.limitations}</h2>
        <ul>
          {w.limitationsList.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
