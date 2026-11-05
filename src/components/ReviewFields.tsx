"use client";
import { useUi } from "./Shell";
import { workflow } from "@/i18n/workflow";
import { fieldKeys } from "@/lib/schemas";
import type { CaseDocument } from "@/lib/domain/types";
import { normalizeField } from "@/lib/domain/normalize";
import { effectiveValue, mustConfirm } from "@/lib/domain/compare";
import { maskIdentity } from "@/lib/sanity";
export default function ReviewFields({
  document,
  onChange,
}: {
  document: CaseDocument;
  onChange: (next: CaseDocument) => void;
}) {
  const { language, t } = useUi(),
    w = workflow[language];
  return (
    <section className="review-document panel">
      <div className="review-doc-heading">
        <h2>{document.label}</h2>
        <span className={`mode-badge ${document.mode}`}>
          {w.modes[document.mode]}
        </span>
      </div>
      <div className="review-field-grid">
        {fieldKeys.map((key) => {
          const f = document.extraction.fields[key],
            review = document.reviews[key],
            value = effectiveValue(document, key);
          const display = (v: string | null) =>
            key === "id_number" ? maskIdentity(v) : (v ?? w.missing);
          function patch(delta: Partial<typeof review>) {
            onChange({
              ...document,
              reviews: { ...document.reviews, [key]: { ...review, ...delta } },
            });
          }
          return (
            <article
              className={`review-field ${f.confidence === "low" ? "uncertain" : ""}`}
              key={key}
            >
              <div className="field-title">
                <h3>{t.fields[key]}</h3>
                {mustConfirm(document, key) && (
                  <span className="required-tag">{w.required}</span>
                )}
              </div>
              <dl>
                <dt>{w.raw}</dt>
                <dd>{display(f.rawValue)}</dd>
                <dt>{w.normalized}</dt>
                <dd>{display(normalizeField(key, value))}</dd>
              </dl>
              <small>
                {w.confidence}: {w.confidenceLabels[f.confidence]} · {w.page}{" "}
                {f.pageNumber}
              </small>
              {f.evidenceLocation && key !== "id_number" && (
                <p className="caption">
                  {w.evidence}:{" "}
                  {f.evidenceLocation.replace(/[0-9০-৯]{5,}/g, "••••")}
                </p>
              )}
              <label className="edit-label">
                {w.edit}
                <input
                  type={key === "id_number" ? "password" : "text"}
                  autoComplete="off"
                  maxLength={
                    key === "address" ? 500 : key === "id_number" ? 40 : 160
                  }
                  value={
                    key === "id_number" && !review.edited ? "" : (value ?? "")
                  }
                  placeholder={
                    key === "id_number" ? maskIdentity(value) : w.missing
                  }
                  onChange={(e) =>
                    patch({
                      edited: true,
                      confirmed: false,
                      value: e.target.value || null,
                    })
                  }
                />
              </label>
              {value === null && <p className="caption">{w.ackMissing}</p>}
              <label className="confirm-label">
                <input
                  type="checkbox"
                  checked={review.confirmed}
                  onChange={(e) => patch({ confirmed: e.target.checked })}
                />
                {w.confirmed}
              </label>
            </article>
          );
        })}
      </div>
      {document.refinements.length > 0 && (
        <details>
          <summary>
            {w.refined} ({document.refinements.length})
          </summary>
          {document.refinements.map((r, i) => (
            <p key={i}>
              {t.fields[r.field]}:{" "}
              {r.field === "id_number"
                ? maskIdentity(r.before.rawValue)
                : (r.before.rawValue ?? w.missing)}{" "}
              →{" "}
              {r.field === "id_number"
                ? maskIdentity(r.after.rawValue)
                : (r.after.rawValue ?? w.missing)}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
