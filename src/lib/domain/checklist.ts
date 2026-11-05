import { OFFICIAL_SOURCE } from "./registry";
import type {
  ActiveRule,
  CaseDocument,
  Finding,
  ChecklistItem,
  Missing,
} from "./types";
export function missingDocuments(
  documents: CaseDocument[],
  rules: ActiveRule[],
): Missing[] {
  return rules
    .filter((r) => r.usable)
    .flatMap((r) =>
      r.requiredDocuments
        .filter((type) => !documents.some((d) => d.documentType === type))
        .map((documentType) => ({
          documentType,
          ruleId: r.id,
          sourceUrl: r.sourceUrl,
        })),
    );
}
export function buildChecklist(
  findings: Finding[],
  rules: ActiveRule[],
  missing: Missing[],
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (item: ChecklistItem) => items.push(item);
  for (const f of findings.filter((f) =>
    [
      "possible_discrepancy",
      "unreadable",
      "possible_variation",
      "missing",
    ].includes(f.status),
  )) {
    add({
      id: `finding-${f.id}`,
      taskCode: f.stepCode as ChecklistItem["taskCode"],
      field: f.field,
      documentType: null,
      whyCode: f.status,
      supportIds: [f.id],
      priority: "confirm manually",
      sourceUrl: f.sourceUrl,
      dependsOn: [],
      custom: null,
    });
  }
  items.sort((a, b) => {
    const priority = [
      "possible_discrepancy",
      "unreadable",
      "possible_variation",
      "missing",
    ];
    return priority.indexOf(a.whyCode) - priority.indexOf(b.whyCode);
  });
  const dependencies = items.map((i) => i.id);
  if (rules.length === 0 || rules.some((r) => !r.usable))
    add({
      id: "verify-rules",
      taskCode: "verify_rules",
      field: null,
      documentType: null,
      whyCode: "rules_unverified",
      supportIds: rules.filter((r) => !r.usable).map((r) => r.id),
      priority: "confirm manually",
      sourceUrl: OFFICIAL_SOURCE,
      dependsOn: [],
      custom: null,
    });
  for (const m of missing)
    add({
      id: `missing-${m.ruleId}-${m.documentType}`,
      taskCode: "gather_document",
      field: null,
      documentType: m.documentType,
      whyCode: "verified_requirement",
      supportIds: [m.ruleId],
      priority: "mandatory",
      sourceUrl: m.sourceUrl,
      dependsOn: dependencies,
      custom: null,
    });
  for (const r of rules.filter((r) => r.usable))
    r.recommendedNextSteps.forEach((custom, i) =>
      add({
        id: `rule-${r.id}-${i}`,
        taskCode: "source_step",
        field: null,
        documentType: null,
        whyCode: "verified_source_step",
        supportIds: [r.id],
        priority: "recommended",
        sourceUrl: r.sourceUrl,
        dependsOn: dependencies,
        custom,
      }),
    );
  return items;
}
