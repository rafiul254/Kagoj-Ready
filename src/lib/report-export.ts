import { BUILDATHON_ASSET } from "@/components/BuildathonWatermark";
import type { ReadinessReport } from "./domain/types";
import { workflow } from "@/i18n/workflow";
import { strings } from "@/i18n/strings";
import { explainFinding } from "./domain/explain";
export function escapeHtml(value: unknown) {
  return String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function reportHtml(
  report: ReadinessReport,
  origin: string,
  watermarkDataUri: string,
) {
  const w = workflow[report.language],
    t = strings[report.language],
    e = escapeHtml;
  const link = (url: string, label: string) => {
    const parsed = new URL(url, origin);
    if (!["https:", "http:"].includes(parsed.protocol)) return e(label);
    return `<a href="${e(parsed.href)}" rel="noreferrer">${e(label)}</a>`;
  };
  const findings = report.findings
    .map(
      (f) =>
        `<section><h3>${e(t.fields[f.field])} — ${e(w.statusLabels[f.status])}</h3><p>${e(explainFinding(f, report.language))}</p><table><tr><th>${e(f.left.documentLabel)}</th><th>${e(f.right.documentLabel)}</th></tr><tr>${[f.left, f.right].map((s) => `<td><b>${e(s.value)}</b><p>${e(w.raw)}: ${e(s.originalValue)}</p><p>${e(w.normalized)}: ${e(s.normalizedValue)}</p><small>${e(w.page)} ${s.pageNumber} · ${e(s.location)}${s.edited ? " · " + e(w.edited) : ""}</small></td>`).join("")}</tr></table>${link(f.sourceUrl, w.softwareRule)}</section>`,
    )
    .join("");
  const documents = report.documents
    .map(
      (d) =>
        `<h3>${e(d.label)}</h3><p>${e(w.modes[d.mode])}</p><table><tr><th>${e(t.field)}</th><th>${e(w.raw)}</th><th>${e(w.effective)}</th><th>${e(w.normalized)}</th></tr>${d.fields.map((f) => `<tr><th>${e(t.fields[f.key])}</th><td>${e(f.rawValue)}</td><td>${e(f.value)}${f.edited ? " · " + e(w.edited) : ""}${f.uncertain ? " · " + e(w.uncertain) : ""}</td><td>${e(f.normalizedValue)}</td></tr>`).join("")}</table>`,
    )
    .join("");
  return `<!doctype html><html lang="${report.language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kagoj Ready — ${e(w.reportTitle)}</title><style>body{font:16px/1.7 Arial,sans-serif;color:#173d32;max-width:960px;margin:35px auto;padding:20px}section{border:1px solid #d3ded3;padding:18px;margin:16px 0;break-inside:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:10px;border:1px solid #d3ded3;text-align:left;overflow-wrap:anywhere}a{color:#176744}small{font-size:12px}footer{border-top:1px solid #ccc;margin-top:30px;padding-top:20px}footer img{max-width:100%}@media print{body{margin:0;font-size:11px}a{color:#173d32}}</style><body><h1>Kagoj Ready — ${e(w.reportTitle)}</h1><p>${e(w.modes[report.mode])}</p><p>${e(w.reviewDate)}: ${e(report.reviewedAt)} (UTC)</p><p>${e(w.ageOptions[2])} · ${e(w.applicationOptions[0])} · ${e(w.locationOptions[0])}</p><p><b>${e(w.rulesWarning)}</b></p>${report.documents.length < 2 ? `<p>${e(w.single)}</p>` : ""}<h2>${e(w.findings)}</h2>${findings}<h2>${e(w.checklist)}</h2><ol>${report.checklist.map((item) => `<li><b>${e(w.priority[item.priority])}</b>: ${e(item.documentType ? w.documentTypes[item.documentType] : "")} ${e(item.field ? t.fields[item.field] : "")} ${e(item.custom ? item.custom[report.language] : w.tasks[item.taskCode])}<p>${e(w.whyCodes[item.whyCode as keyof typeof w.whyCodes])}</p>${item.dependsOn.length ? `<p>${e(w.depends)}</p>` : ""}${link(item.sourceUrl, w.source)}</li>`).join("")}</ol><h2>${e(w.reviewedFields)}</h2>${documents}<h2>${e(w.sources)}</h2>${report.sources.map((r) => `<section><b>${e(w[r.verificationStatus])}${r.stale ? " · " + e(w.stale) : ""}</b><h3>${e(report.language === "bn" ? r.ruleTitle_bn : r.ruleTitle_en)}</h3><p>${e(report.language === "bn" ? r.ruleText_bn : r.ruleText_en)}</p>${link(r.sourceUrl, r.sourceTitle)}<p>${e(w.verified)}: ${e(r.verifiedAt ?? w.notVerified)} · ${e(w.published)}: ${e(r.sourcePublishedAt ?? w.unknown)}</p></section>`).join("")}<h2>${e(w.limitations)}</h2><ul>${w.limitationsList.map((s) => `<li>${e(s)}</li>`).join("")}</ul><footer><p>${e(t.disclaimer)}</p><img src="${e(watermarkDataUri)}" alt="Built for YUNet AIgnite Buildathon 2026 — PLACEHOLDER, official asset pending" width="410" height="48"></footer></body></html>`;
}
export async function downloadReport(report: ReadinessReport) {
  const svg = await (await fetch(BUILDATHON_ASSET)).text();
  const html = reportHtml(
    report,
    location.origin,
    `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
  );
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "kagoj-ready-report.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
