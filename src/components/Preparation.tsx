"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import samples from "@/data/samples.json";
import { useUi } from "./Shell";
import { workflow } from "@/i18n/workflow";
import {
  contextSchema,
  documentSchema,
  reportSchema,
  agentEventSchema,
  type ApplicantContext,
  type CaseDocument,
  type AgentEvent,
} from "@/lib/domain/types";
import { classifyServiceCase, OFFICIAL_SOURCE } from "@/lib/domain/registry";
import { confirmationComplete } from "@/lib/domain/compare";
import {
  resumeAfterConfirmation,
  requestMissingDocument,
} from "@/lib/agent/report";
import {
  readAgentStream,
  prepareClientImage,
  errorSchema,
} from "@/lib/agent/client";
import { SafeError, safeCode, safeDetail } from "@/lib/errors";
import ReviewFields from "./ReviewFields";
import Report from "./Report";
import Activity from "./Activity";
const caseSchema = z.object({
  version: z.literal(2),
  stage: z.enum(["context", "upload", "review", "report"]),
  sample: z.boolean(),
  context: contextSchema,
  consent: z.boolean(),
  documents: z.array(documentSchema).max(3),
  trace: z.array(agentEventSchema).max(240),
  report: reportSchema.nullable(),
  previous: reportSchema.nullable(),
  replaceId: z.string().nullable(),
  caseId: z.string().nullable(),
  checked: z.array(z.string()),
  sampleMode: z.enum(["auto", "synthetic_fixture"]),
  sampleIds: z.array(z.string()).max(3),
  fallback: z.boolean(),
  modelSteps: z.number().int(),
});
type CaseState = z.infer<typeof caseSchema>;
const initial = (sample: boolean): CaseState => ({
  version: 2,
  stage: "context",
  sample,
  context: {
    service: "passport",
    ageBand: "20_plus",
    applicationType: "first_time",
    location: "bangladesh",
  },
  consent: false,
  documents: [],
  trace: [],
  report: null,
  previous: null,
  replaceId: null,
  caseId: null,
  checked: [],
  sampleMode: "auto",
  sampleIds: ["baseline", "parent"],
  fallback: false,
  modelSteps: 0,
});
// The most common supported case is pre-selected, but every answer stays
// visible and editable so the unsupported-case path is one change away.
const DEFAULT_SELECTED = ["ageBand", "applicationType", "location"];
async function createCase(signal: AbortSignal): Promise<string> {
  const response = await fetch("/api/cases", {
    method: "POST",
    signal,
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  const parsed = z
    .object({ caseId: z.string().min(1).max(200) })
    .safeParse(body);
  if (parsed.success) return parsed.data.caseId;
  const code = errorSchema.safeParse(body);
  throw new SafeError(code.success ? code.data.error : "PROVIDER_UNAVAILABLE");
}
export default function Preparation({ sampleEntry }: { sampleEntry: boolean }) {
  const { t, language } = useUi(),
    w = workflow[language];
  const [state, setState] = useState<CaseState>(() => initial(sampleEntry));
  const [restored, setRestored] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [contextSelected, setContextSelected] =
    useState<string[]>(DEFAULT_SELECTED);
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const gallery = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kagoj:case");
      if (raw) {
        const saved = caseSchema.safeParse(JSON.parse(raw));
        if (saved.success && saved.data.sample === sampleEntry)
          setState(saved.data);
      }
    } catch {
      setStorageWarning(true);
    }
    setRestored(true);
    const clear = () => {
      epoch.current++;
      controller.current?.abort();
      setState(initial(sampleEntry));
      setFiles([]);
      setBusy(false);
      setError(null);
      setUnsupported(false);
      setContextSelected(DEFAULT_SELECTED);
    };
    window.addEventListener("kagoj:delete", clear);
    return () => {
      epoch.current++;
      controller.current?.abort();
      window.removeEventListener("kagoj:delete", clear);
    };
  }, [sampleEntry]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (state.stage === "context" && !state.documents.length)
        sessionStorage.removeItem("kagoj:case");
      else sessionStorage.setItem("kagoj:case", JSON.stringify(state));
    } catch {
      setStorageWarning(true);
    }
  }, [state, restored]);
  useEffect(() => {
    section.current?.focus();
  }, [state.stage]);
  const patch = (value: Partial<CaseState>) =>
    setState((s) => ({ ...s, ...value }));
  const context = (key: keyof ApplicantContext, value: string) => {
    setContextSelected((s) => [...new Set([...s, key])]);
    patch({ context: { ...state.context, [key]: value } as ApplicantContext });
    setUnsupported(false);
  };
  function next() {
    const verdict = classifyServiceCase(state.context);
    if (!verdict.supported) {
      setUnsupported(true);
      return;
    }
    setUnsupported(!verdict.ruleMatched);
    if (state.consent) patch({ stage: "upload" });
  }
  const closeCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOpen(false);
    setCameraError(null);
  };
  useEffect(() => () => closeCamera(), []);
  async function openCamera() {
    setCameraError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(w.cameraInsecure);
      setCameraOpen(true);
      return;
    }
    setCameraOpen(true);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play().catch(() => undefined);
      }
    } catch (e) {
      stream.current = null;
      setCameraError(
        e instanceof DOMException && e.name === "NotFoundError"
          ? w.cameraNotFound
          : e instanceof DOMException && e.name === "NotAllowedError"
            ? w.cameraDenied
            : w.cameraGeneric,
      );
    }
  }
  function captureFrame() {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const scale = Math.min(1, 2200 / Math.max(el.videoWidth, el.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(el.videoWidth * scale);
    canvas.height = Math.round(el.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob)
          addFiles([new File([blob], "camera.jpg", { type: "image/jpeg" })]);
        closeCamera();
      },
      "image/jpeg",
      0.92,
    );
  }
  async function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const chosen = Array.from(list);
    if (
      (state.replaceId
        ? chosen.length
        : files.length + chosen.length + state.documents.length) >
      (state.replaceId ? 1 : 3)
    ) {
      setError(w.tooMany);
      return;
    }
    try {
      const prepared: File[] = [];
      for (const f of chosen) prepared.push(await prepareClientImage(f));
      setFiles((s) => (state.replaceId ? prepared : [...s, ...prepared]));
      setError(null);
    } catch {
      setError(w.imageError);
    }
  }
  async function process() {
    if (busy) return;
    setError(null);
    const total = state.sample ? state.sampleIds.length : files.length;
    if (!total) {
      setError(w.emptyFiles);
      return;
    }
    if (
      (state.replaceId && total !== 1) ||
      (!state.replaceId && state.documents.length + total > 3)
    ) {
      setError(w.tooMany);
      return;
    }
    const generation = ++epoch.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    let caseId = state.caseId;
    let added = 0;
    const safePatch = (value: Partial<CaseState>) => {
      if (epoch.current === generation) patch(value);
    };
    const trace = (event: AgentEvent) => {
      if (epoch.current === generation)
        setState((s) => ({ ...s, trace: [...s.trace, event].slice(-240) }));
    };
    try {
      if (!caseId) {
        caseId = await createCase(abort.signal);
        safePatch({ caseId });
      }
      for (let index = 0; index < total; index++) {
        if (epoch.current !== generation) return;
        const documentId =
          state.replaceId ?? `doc-${state.documents.length + index + 1}`;
        const sampleId = state.sample ? state.sampleIds[index] : null;
        let result: Awaited<ReturnType<typeof readAgentStream>>;
        for (let attempt = 0; ; attempt++) {
          const metadata = {
            caseId,
            documentId,
            language,
            context: state.context,
            consent: state.consent,
            sampleId,
            sampleMode: state.sample ? state.sampleMode : "auto",
          };
          let body: BodyInit, headers: HeadersInit | undefined;
          if (state.sample) {
            body = JSON.stringify(metadata);
            headers = { "Content-Type": "application/json" };
          } else {
            const form = new FormData();
            form.set("metadata", JSON.stringify(metadata));
            form.set("image", files[index]);
            body = form;
          }
          const response = await fetch("/api/agent", {
            method: "POST",
            headers,
            body,
            signal: abort.signal,
            cache: "no-store",
          });
          try {
            result = await readAgentStream(response, trace, () =>
              safePatch({ fallback: true }),
            );
            break;
          } catch (e) {
            // A saved case can outlive its server-side budget (restart or a
            // one-hour expiry). Re-create it once and retry this document.
            if (
              attempt === 0 &&
              !abort.signal.aborted &&
              safeCode(e) === "INVALID_REQUEST"
            ) {
              caseId = await createCase(abort.signal);
              safePatch({ caseId });
              continue;
            }
            throw e;
          }
        }
        if (epoch.current !== generation) return;
        safePatch({ modelSteps: result.budget.steps });
        if (result.document) {
          added++;
          const doc = {
            ...result.document,
            label: `${w.document} ${state.replaceId ? state.documents.findIndex((d) => d.id === state.replaceId) + 1 : state.documents.length + index + 1} · ${w.documentTypes[result.document.documentType]}`,
          };
          setState((s) => ({
            ...s,
            documents: s.replaceId
              ? s.documents.map((d) => (d.id === s.replaceId ? doc : d))
              : [...s.documents, doc],
          }));
        } else
          setError(
            `${w.rejection} ${result.rejection ? (t[result.rejection as keyof typeof t] as string) : ""}`,
          );
      }
      if (added) {
        safePatch({ stage: "review", report: null, checked: [] });
        setFiles([]);
      }
    } catch (e) {
      if (epoch.current === generation) {
        const detail = safeDetail(e);
        setError(
          `${t.errors[safeCode(e)]}${detail ? ` (${detail})` : ""} ${w.recovery}`,
        );
      }
    } finally {
      if (epoch.current === generation) setBusy(false);
    }
  }
  function build() {
    try {
      const report = resumeAfterConfirmation(
        state.context,
        state.documents,
        language,
        state.trace,
        state.replaceId ? (state.previous ?? undefined) : undefined,
        state.replaceId ?? undefined,
      );
      patch({
        report,
        trace: report.agent_trace,
        stage: "report",
        replaceId: null,
        checked: [],
      });
      setError(null);
    } catch {
      setError(w.allConfirm);
    }
  }
  function replace(id: string) {
    patch({
      replaceId: id,
      previous: state.report,
      stage: "upload",
      sampleIds: ["format"],
      checked: [],
    });
    setFiles([]);
    setError(null);
  }
  function reset() {
    epoch.current++;
    controller.current?.abort();
    try {
      sessionStorage.removeItem("kagoj:case");
    } catch {}
    setState(initial(sampleEntry));
    setFiles([]);
    setBusy(false);
    setError(null);
    setUnsupported(false);
    setContextSelected(DEFAULT_SELECTED);
  }
  const stageIndex = ["context", "upload", "review", "report"].indexOf(
    state.stage,
  );
  return (
    <main id="main" className="container preparation-page">
      <div className="workspace-top no-print">
        <Link href="/" className="back-link">
          ← {t.back}
        </Link>
        <div>
          <Link href="/evaluation">{w.evaluation}</Link>
          <button className="link-button" onClick={reset}>
            {w.newCase}
          </button>
        </div>
      </div>
      <nav className="journey-steps no-print" aria-label={w.title}>
        {w.steps.map((label, i) => (
          <div
            className={
              i === stageIndex ? "current" : i < stageIndex ? "complete" : ""
            }
            key={label}
            aria-current={i === stageIndex ? "step" : undefined}
          >
            <span>{i < stageIndex ? "✓" : i + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </nav>
      {storageWarning && (
        <p role="status" className="warning-box">
          {w.storageWarning}
        </p>
      )}
      {state.sample && (
        <div className="sample-context no-print">
          <strong>SAMPLE</strong>
          <span>{w.sampleConsent}</span>
        </div>
      )}
      <div ref={section} tabIndex={-1} className="stage-focus">
        {state.stage === "context" && (
          <section className="context-form panel">
            <div className="eyebrow">{t.tagline}</div>
            <h1>{w.contextTitle}</h1>
            <p>{w.contextNote}</p>
            <p className="caption context-defaults">{w.contextDefaults}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <label>
                {w.service}
                <select
                  value={state.context.service}
                  onChange={(e) => context("service", e.target.value)}
                >
                  <option value="passport">{w.passport}</option>
                  <option disabled value="nid">
                    {w.nid}
                  </option>
                </select>
              </label>
              <div className="context-fields">
                <label>
                  {w.age}
                  <select
                    required
                    value={
                      contextSelected.includes("ageBand")
                        ? state.context.ageBand
                        : ""
                    }
                    onChange={(e) => context("ageBand", e.target.value)}
                  >
                    <option value="" disabled>
                      {w.choose}
                    </option>
                    {["under_18", "18_19", "20_plus"].map((value, i) => (
                      <option key={value} value={value}>
                        {w.ageOptions[i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {w.application}
                  <select
                    required
                    value={
                      contextSelected.includes("applicationType")
                        ? state.context.applicationType
                        : ""
                    }
                    onChange={(e) => context("applicationType", e.target.value)}
                  >
                    <option value="" disabled>
                      {w.choose}
                    </option>
                    {["first_time", "reissue", "other"].map((value, i) => (
                      <option key={value} value={value}>
                        {w.applicationOptions[i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {w.location}
                  <select
                    required
                    value={
                      contextSelected.includes("location")
                        ? state.context.location
                        : ""
                    }
                    onChange={(e) => context("location", e.target.value)}
                  >
                    <option value="" disabled>
                      {w.choose}
                    </option>
                    {["bangladesh", "abroad"].map((value, i) => (
                      <option key={value} value={value}>
                        {w.locationOptions[i]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="consent-label">
                <input
                  type="checkbox"
                  checked={state.consent}
                  onChange={(e) => patch({ consent: e.target.checked })}
                />
                <span>{w.consent}</span>
              </label>
              <details className="consent-details">
                <summary>{w.consentDetailsLabel}</summary>
                <p>
                  {w.consentDetails}{" "}
                  <a
                    href="https://ai.google.dev/gemini-api/terms"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {w.terms} ↗
                  </a>
                </p>
              </details>
              <p className="caption">{t.disclaimer}</p>
              <button className="primary-button" disabled={!state.consent}>
                {w.next} →
              </button>
            </form>
            {unsupported && (
              <section className="warning-box" role="alert">
                <h2>{w.unsupported}</h2>
                <p>{w.unsupportedNote}</p>
                <a href={OFFICIAL_SOURCE} target="_blank" rel="noreferrer">
                  {w.official} ↗
                </a>
              </section>
            )}
          </section>
        )}
        {state.stage === "upload" && (
          <div className="workflow-grid">
            <section>
              <div className="page-title">
                <h1>{state.replaceId ? w.replace : w.uploadTitle}</h1>
                <p>{state.replaceId ? w.replacementNote : w.uploadNote}</p>
              </div>
              {unsupported && (
                <section className="warning-box" role="note">
                  <h2>{w.unsupported}</h2>
                  <p>{w.unsupportedNote}</p>
                  <a href={OFFICIAL_SOURCE} target="_blank" rel="noreferrer">
                    {w.official} ↗
                  </a>
                </section>
              )}
              {state.replaceId && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    patch({
                      replaceId: null,
                      stage: "report",
                      report: state.previous,
                      previous: null,
                    });
                    setFiles([]);
                  }}
                >
                  {w.cancelReplace}
                </button>
              )}
              {state.sample ? (
                <section className="panel">
                  <h2>{w.samplePick}</h2>
                  <p className="caption">{w.sampleDefault}</p>
                  <div className="sample-card-grid">
                    {samples.fixtures.map((f) => (
                      <button
                        key={f.id}
                        disabled={busy}
                        aria-pressed={state.sampleIds.includes(f.id)}
                        className={
                          state.sampleIds.includes(f.id)
                            ? "sample-choice selected"
                            : "sample-choice"
                        }
                        onClick={() => {
                          const ids = state.replaceId
                            ? [f.id]
                            : state.sampleIds.includes(f.id)
                              ? state.sampleIds.filter((id) => id !== f.id)
                              : state.sampleIds.length < 3
                                ? [...state.sampleIds, f.id]
                                : state.sampleIds;
                          patch({ sampleIds: ids });
                        }}
                      >
                        <img
                          src={f.file}
                          alt={`SAMPLE: ${t.fixtures[f.id as keyof typeof t.fixtures]}`}
                          width="1400"
                          height="1040"
                        />
                        <span>
                          {t.fixtures[f.id as keyof typeof t.fixtures]}
                        </span>
                        <b aria-hidden="true">
                          {state.sampleIds.includes(f.id) ? "✓" : "+"}
                        </b>
                      </button>
                    ))}
                  </div>
                  <label className="select-label">
                    {w.sampleMode}
                    <select
                      value={state.sampleMode}
                      disabled={busy}
                      onChange={(e) =>
                        patch({
                          sampleMode: e.target.value as CaseState["sampleMode"],
                        })
                      }
                    >
                      <option value="auto">{w.auto}</option>
                      <option value="synthetic_fixture">{w.fixture}</option>
                    </select>
                  </label>
                </section>
              ) : (
                <section className="panel upload-panel">
                  <div
                    className="drop-zone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!busy) addFiles(e.dataTransfer.files);
                    }}
                  >
                    <span className="upload-glyph" aria-hidden="true">
                      ↑
                    </span>
                    <h2>{w.drop}</h2>
                    <input
                      ref={gallery}
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      multiple={!state.replaceId}
                      aria-label={w.gallery}
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div className="upload-actions">
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => gallery.current?.click()}
                      >
                        {w.gallery}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={openCamera}
                      >
                        {w.camera}
                      </button>
                    </div>
                    <p>{w.tips}</p>
                  </div>
                  {files.map((f, i) => (
                    <div className="file-row" key={i}>
                      <span>
                        {w.document} {i + 1} ·{" "}
                        {(f.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <button
                        className="link-button"
                        disabled={busy}
                        onClick={() =>
                          setFiles((all) => all.filter((_, n) => i !== n))
                        }
                      >
                        {w.remove}
                      </button>
                    </div>
                  ))}
                </section>
              )}
              {state.documents.length > 0 && (
                <div className="panel">
                  <h2>{w.documents}</h2>
                  {state.documents.map((d) => (
                    <p key={d.id}>
                      {d.label} · {w.modes[d.mode]}
                    </p>
                  ))}
                </div>
              )}
              {requestMissingDocument(state.context, state.documents).map(
                (m) => (
                  <p className="warning-box" key={m.ruleId + m.documentType}>
                    {w.priority.mandatory}: {w.documentTypes[m.documentType]} ·{" "}
                    <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                      {w.source} ↗
                    </a>
                  </p>
                ),
              )}
              <div className="button-row">
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={process}
                >
                  {busy ? w.processing : w.process} →
                </button>
                {state.documents.length > 0 && !state.replaceId && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => patch({ stage: "review" })}
                  >
                    {w.review}
                  </button>
                )}
              </div>
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              {state.fallback && (
                <p className="warning-box" role="status">
                  {w.fallback}
                </p>
              )}
            </section>
            <Activity events={state.trace} busy={busy} />
          </div>
        )}
        {state.stage === "review" && (
          <>
            <div className="page-title">
              <h1>{w.reviewTitle}</h1>
              <p>{w.reviewNote}</p>
            </div>
            {state.fallback && <p className="warning-box">{w.fallback}</p>}
            <div className="workflow-grid">
              <div>
                {state.documents
                  .filter((d) => !state.replaceId || d.id === state.replaceId)
                  .map((d) => (
                    <ReviewFields
                      key={d.id}
                      document={d}
                      onChange={(doc) =>
                        patch({
                          documents: state.documents.map((item) =>
                            item.id === doc.id ? doc : item,
                          ),
                        })
                      }
                    />
                  ))}
                <div className="button-row">
                  <button
                    className="primary-button"
                    disabled={!confirmationComplete(state.documents)}
                    onClick={build}
                  >
                    {w.build} →
                  </button>
                  {state.documents.length < 3 && !state.replaceId && (
                    <button
                      className="secondary-button"
                      onClick={() => patch({ stage: "upload", sampleIds: [] })}
                    >
                      {w.addMore}
                    </button>
                  )}
                </div>
                {!confirmationComplete(state.documents) && (
                  <p className="caption">{w.allConfirm}</p>
                )}
                {error && (
                  <p role="alert" className="error-box">
                    {error}
                  </p>
                )}
              </div>
              <Activity events={state.trace} busy={false} />
            </div>
          </>
        )}
        {state.stage === "report" && state.report && (
          <Report
            report={state.report}
            previous={state.previous}
            checked={state.checked}
            onCheck={(checked) => patch({ checked })}
            onReplace={replace}
          />
        )}
      </div>
      {state.stage !== "context" && (
        <p className="caption no-print">
          {w.remaining}: {state.modelSteps} / 12 · {w.emptyState}
        </p>
      )}
      {cameraOpen && (
        <div
          className="camera-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={w.cameraTitle}
        >
          <div className="camera-panel">
            <h2>{w.cameraTitle}</h2>
            {cameraError ? (
              <p role="alert" className="error-box">
                {cameraError}
              </p>
            ) : (
              <video
                ref={video}
                className="camera-preview"
                autoPlay
                playsInline
                muted
              />
            )}
            <div className="upload-actions">
              {!cameraError && (
                <button className="primary-button" onClick={captureFrame}>
                  {w.cameraCapture}
                </button>
              )}
              <button className="secondary-button" onClick={closeCamera}>
                {w.cameraClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
