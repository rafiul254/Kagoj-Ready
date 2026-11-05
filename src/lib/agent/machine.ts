import type { AgentState } from "../domain/types";
export const ALLOWED_TOOLS: Record<AgentState, readonly string[]> = {
  CONTEXT: ["classifyServiceCase"],
  SUPPORT_CHECK: ["classifyServiceCase", "retrieveOfficialRequirements"],
  COLLECT_DOCUMENTS: ["requestMissingDocument", "identifyDocument"],
  EXTRACT: [
    "extractDocumentFields",
    "refineExtraction",
    "requestUserConfirmation",
  ],
  AWAIT_USER_CONFIRMATION: ["requestUserConfirmation"],
  COMPARE: ["normalizeFields", "compareDocumentFields", "explainFinding"],
  PLAN: ["retrieveOfficialRequirements", "buildChecklist"],
  REPORT: ["generateReport"],
};
const transitions: Record<AgentState, AgentState[]> = {
  CONTEXT: ["SUPPORT_CHECK"],
  SUPPORT_CHECK: ["COLLECT_DOCUMENTS"],
  COLLECT_DOCUMENTS: ["EXTRACT"],
  EXTRACT: ["AWAIT_USER_CONFIRMATION"],
  AWAIT_USER_CONFIRMATION: ["COMPARE", "COLLECT_DOCUMENTS"],
  COMPARE: ["PLAN"],
  PLAN: ["REPORT"],
  REPORT: ["COLLECT_DOCUMENTS"],
};
export function assertAllowed(state: AgentState, tool: string) {
  if (!ALLOWED_TOOLS[state].includes(tool)) throw new Error("TOOL_NOT_ALLOWED");
}
export function transition(from: AgentState, to: AgentState) {
  if (!transitions[from].includes(to))
    throw new Error("TRANSITION_NOT_ALLOWED");
  return to;
}
