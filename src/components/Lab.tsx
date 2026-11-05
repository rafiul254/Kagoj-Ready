"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useUi, DocumentIcon } from "./Shell";
import samples from "@/data/samples.json";
import { resultSchema, fieldKeys, type PipelineResult } from "@/lib/schemas";
import { errorCodes, type ErrorCode } from "@/lib/errors";
import { maskIdentity } from "@/lib/sanity";
const errorSchema = z.object({ error: z.enum(errorCodes) });
const storedSchema = z.object({
  selected: z.enum([
    "baseline",
    "format",
    "variant",
    "parent",
    "dob",
    "missing",
    "blurry",
    "wrong",
  ]),
  result: resultSchema,
});
type SampleId = z.infer<typeof storedSchema>["selected"];
export default function Lab({ configured }: { configured: boolean }) {
  const { t, language } = useUi();
  const [selected, setSelected] = useState<SampleId>("baseline");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kagoj:sample");
      if (raw) {
        const s = storedSchema.safeParse(JSON.parse(raw));
        if (s.success) {
          setSelected(s.data.selected);
          setResult(s.data.result);
        }
      }
    } catch {}
    function clear() {
      generation.current++;
      abortRef.current?.abort();
      setResult(null);
      setError(null);
      setBusy(false);
      setConsent(false);
      setSelected("baseline");
    }
    window.addEventListener("kagoj:delete", clear);
    return () => {
      generation.current++;
      abortRef.current?.abort();
      window.removeEventListener("kagoj:delete", clear);
    };
  }, []);
  async function run() {
    if (!consent || busy) return;
    const gen = ++generation.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      sessionStorage.removeItem("kagoj:sample");
    } catch {}
    try {
      const response = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId: selected, language, consent }),
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (gen !== generation.current) return;
      if (!response.ok) {
        const parsed = errorSchema.safeParse(data);
        setError(parsed.success ? parsed.data.error : "PROVIDER_UNAVAILABLE");
        return;
      }
      const checked = resultSchema.safeParse(data);
      if (!checked.success) {
        setError("INVALID_OUTPUT");
        return;
      }
      setResult(checked.data);
      try {
        sessionStorage.setItem(
          "kagoj:sample",
          JSON.stringify({ selected, result: checked.data }),
        );
      } catch {}
    } catch {
      if (gen === generation.current)
        setError(
          controller.signal.aborted ? "CANCELLED" : "PROVIDER_UNAVAILABLE",
        );
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  function choose(id: SampleId) {
    setSelected(id);
    setResult(null);
    setError(null);
    try {
      sessionStorage.removeItem("kagoj:sample");
    } catch {}
  }
  return (
    <main id="main" className="container lab-page">
      <Link className="back-link" href="/">
        ← {t.back}
      </Link>
      <div className="eyebrow">{t.phase}</div>
      <h1>{t.labTitle}</h1>
      <p className="page-intro">{t.labIntro}</p>
      <div className="context-bar">
        <strong>{t.contextTitle}</strong>
        <span>{t.context}</span>
        <small>{t.contextNote}</small>
      </div>
      <div className="lab-grid">
        <div>
          <section className="panel">
            <h2>{t.select}</h2>
            <div className="sample-options" role="group" aria-label={t.select}>
              {samples.fixtures.map((f) => (
                <button
                  disabled={busy}
                  key={f.id}
                  onClick={() => choose(f.id as SampleId)}
                  aria-pressed={selected === f.id}
                  className={
                    selected === f.id
                      ? "sample-option selected"
                      : "sample-option"
                  }
                >
                  <DocumentIcon small />
                  {t.fixtures[f.id as SampleId]}
                </button>
              ))}
            </div>
            <img
              className="sample-preview"
              src={samples.fixtures.find((f) => f.id === selected)!.file}
              alt={`${t.sample}: ${t.fixtures[selected]}`}
              width="1400"
              height="1040"
            />
            <p className="caption">{t.sample}</p>
          </section>
          <section className="panel consent-panel">
            <h2>{t.consentTitle}</h2>
            <div
              className={configured ? "config-box configured" : "config-box"}
            >
              <strong>{configured ? t.configured : t.notConfigured}</strong>
              {!configured && <p>{t.configHelp}</p>}
            </div>
            <label className="consent-label">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                {t.consent}{" "}
                <a
                  href="https://ai.google.dev/gemini-api/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.terms} ↗
                </a>
              </span>
            </label>
            <button
              className="primary-button run-button"
              disabled={!consent || busy}
              onClick={run}
            >
              {busy ? t.working : t.process}
              <span aria-hidden="true">→</span>
            </button>
            {error && (
              <p className="error-box" role="alert">
                {t.errors[error]}
              </p>
            )}
          </section>
        </div>
        <div>
          <section className="panel results-panel" aria-busy={busy}>
            <h2>{t.resultTitle}</h2>
            {!result ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <DocumentIcon />
                </span>
                <h3>{busy ? t.working : t.resultEmpty}</h3>
                <p>{busy ? t.pending : t.resultEmptyBody}</p>
              </div>
            ) : (
              <>
                <span className="pill result-mode">
                  {result.mode === "live_gemini" ? t.live : t.mock}
                </span>
                <p className="unconfirmed">{t.unconfirmed}</p>
                {result.extraction ? (
                  <div className="field-list">
                    {fieldKeys.map((key) => {
                      const f = result.extraction!.fields[key];
                      return (
                        <article
                          className={
                            f.confidence === "low"
                              ? "field-card uncertain"
                              : "field-card"
                          }
                          key={key}
                        >
                          <div>
                            <h3>{t.fields[key]}</h3>
                            <span className={"confidence " + f.confidence}>
                              {t.confidence}: {t[f.confidence]}
                            </span>
                          </div>
                          <p className="raw-value">
                            {key === "id_number"
                              ? maskIdentity(f.rawValue)
                              : (f.rawValue ?? t.nullValue)}
                          </p>
                          {f.evidenceLocation && key !== "id_number" && (
                            <small>
                              {t.location}:{" "}
                              {f.evidenceLocation.replace(
                                /[0-9০-৯]{5,}/g,
                                "••••",
                              )}
                            </small>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="error-box">
                    <p>{t.rejected}</p>
                    {result.identification.reason && (
                      <p>{t[result.identification.reason]}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
          <section className="panel activity-panel" aria-live="polite">
            <h2>{t.activity}</h2>
            {busy && (
              <p className="pending-line">
                <span className="status-dot" />
                {t.pending}
              </p>
            )}
            {result?.trace.map((event, i) => (
              <p key={i} className="trace-line">
                <span aria-hidden="true">✓</span>
                {t[event.tool]}
                <small>{t.done}</small>
              </p>
            ))}
            {error && <p className="error-box">{t.errors[error]}</p>}
            <p className="caption">{t.activityNote}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
