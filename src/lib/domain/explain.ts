import { workflow } from "@/i18n/workflow";
import type { Language } from "../schemas";
import type { Finding } from "./types";
// Fixed grounded restatements; no unrestricted model prose or added legal advice.
export function explainFinding(finding: Finding, language: Language) {
  return workflow[language].explanations[finding.status];
}
