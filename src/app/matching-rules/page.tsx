"use client";
import { useUi } from "@/components/Shell";
import { workflow } from "@/i18n/workflow";
export default function Page() {
  const { language } = useUi(),
    w = workflow[language];
  const rules = [
    ["document-specific", "not_applicable"],
    ["ocr-uncertainty", "unreadable"],
    ["missing-field", "missing"],
    ["exact", "match"],
    ["normalization", "format_difference"],
    ["cross-script", "possible_variation"],
    ["name-variation", "possible_variation"],
    ["unequal-values", "possible_discrepancy"],
  ] as const;
  return (
    <main id="main" className="container privacy-page">
      <h1>{w.matchingTitle}</h1>
      <p className="warning-box">{w.softwareRule}</p>
      {rules.map(([id, status]) => (
        <section id={id} className="privacy-section" key={id}>
          <h2>{w.statusLabels[status]}</h2>
          <p>{w.explanations[status]}</p>
          {id === "normalization" && <p>{w.normalizationDetail}</p>}
          {id === "name-variation" && <p>{w.variationDetail}</p>}
        </section>
      ))}
    </main>
  );
}
