import { z } from "zod";
import {
  extractionSchema,
  fieldKeys,
  languageSchema,
  documentTypeSchema,
  fieldSchema,
} from "../schemas";
export const contextSchema = z
  .object({
    service: z.enum(["passport", "nid"]),
    ageBand: z.enum(["under_18", "18_19", "20_plus"]),
    applicationType: z.enum(["first_time", "reissue", "other"]),
    location: z.enum(["bangladesh", "abroad"]),
  })
  .strict();
export type ApplicantContext = z.infer<typeof contextSchema>;
export const ruleSchema = z
  .object({
    id: z.string(),
    service: z.string(),
    ruleTitle_bn: z.string(),
    ruleTitle_en: z.string(),
    ruleText_bn: z.string(),
    ruleText_en: z.string(),
    appliesWhen: z
      .object({
        ageBand: contextSchema.shape.ageBand,
        applicationType: contextSchema.shape.applicationType,
        location: contextSchema.shape.location,
      })
      .strict(),
    requiredDocuments: z.array(documentTypeSchema),
    recommendedNextSteps: z.array(z.object({ bn: z.string(), en: z.string() })),
    sourceTitle: z.string(),
    sourceUrl: z
      .url()
      .refine((s) => new URL(s).hostname === "www.epassport.gov.bd"),
    sourcePublishedAt: z.string().nullable(),
    verifiedAt: z.iso.datetime().nullable(),
    verificationStatus: z.enum([
      "verified",
      "needs_human_review",
      "unverified",
    ]),
    notes: z.string(),
  })
  .strict();
export type Rule = z.infer<typeof ruleSchema>;
export const activeRuleSchema = ruleSchema.extend({
  stale: z.boolean(),
  usable: z.boolean(),
});
export type ActiveRule = z.infer<typeof activeRuleSchema>;
export const fieldReviewSchema = z
  .object({
    confirmed: z.boolean(),
    value: z.string().max(500).nullable(),
    edited: z.boolean(),
  })
  .strict();
export const reviewsSchema = z
  .object(
    Object.fromEntries(fieldKeys.map((k) => [k, fieldReviewSchema])) as Record<
      (typeof fieldKeys)[number],
      typeof fieldReviewSchema
    >,
  )
  .strict();
export const documentSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
    label: z.string().min(1).max(80),
    documentType: documentTypeSchema,
    extraction: extractionSchema,
    reviews: reviewsSchema,
    mode: z.enum([
      "live_gemini",
      "live_groq",
      "live_openrouter",
      "synthetic_fixture",
      "recorded_sample",
    ]),
    sampleId: z.string().nullable(),
    refinements: z
      .array(
        z.object({
          field: z.enum(fieldKeys),
          before: fieldSchema,
          after: fieldSchema,
        }),
      )
      .max(16)
      .default([]),
  })
  .strict();
export type CaseDocument = z.infer<typeof documentSchema>;
export const statusSchema = z.enum([
  "match",
  "format_difference",
  "possible_variation",
  "possible_discrepancy",
  "unreadable",
  "missing",
  "not_applicable",
]);
export type FindingStatus = z.infer<typeof statusSchema>;
export const evidenceSchema = z.object({
  documentId: z.string(),
  documentLabel: z.string(),
  originalValue: z.string().nullable(),
  value: z.string().nullable(),
  normalizedValue: z.string().nullable(),
  edited: z.boolean(),
  pageNumber: z.number(),
  location: z.string().nullable(),
});
export const findingSchema = z
  .object({
    id: z.string(),
    field: z.enum(fieldKeys),
    status: statusSchema,
    severity: z.enum(["info", "review", "action_required"]),
    left: evidenceSchema,
    right: evidenceSchema,
    matchingRule: z.string(),
    ruleId: z.string().nullable(),
    sourceUrl: z.string(),
    stepCode: z.enum([
      "none",
      "check_format",
      "verify_variation",
      "verify_difference",
      "read_again",
      "provide_if_needed",
    ]),
    explanationCode: z.string(),
  })
  .strict();
export type Finding = z.infer<typeof findingSchema>;
export const missingSchema = z
  .object({
    documentType: documentTypeSchema,
    ruleId: z.string(),
    sourceUrl: z.url(),
  })
  .strict();
export type Missing = z.infer<typeof missingSchema>;
export const checklistItemSchema = z
  .object({
    id: z.string(),
    taskCode: z.enum([
      "verify_rules",
      "verify_difference",
      "verify_variation",
      "read_again",
      "provide_if_needed",
      "check_format",
      "gather_document",
      "source_step",
    ]),
    field: z.enum(fieldKeys).nullable(),
    documentType: documentTypeSchema.nullable(),
    whyCode: z.string(),
    supportIds: z.array(z.string()),
    priority: z.enum(["mandatory", "recommended", "confirm manually"]),
    sourceUrl: z.string(),
    dependsOn: z.array(z.string()),
    custom: z.object({ bn: z.string(), en: z.string() }).nullable(),
  })
  .strict();
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export const agentStateSchema = z.enum([
  "CONTEXT",
  "SUPPORT_CHECK",
  "COLLECT_DOCUMENTS",
  "EXTRACT",
  "AWAIT_USER_CONFIRMATION",
  "COMPARE",
  "PLAN",
  "REPORT",
]);
export type AgentState = z.infer<typeof agentStateSchema>;
export const agentEventSchema = z
  .object({
    state: agentStateSchema,
    tool: z.string().max(60),
    status: z.enum(["pending", "completed", "failed"]),
    code: z.string().max(60),
    documentId: z.string().nullable(),
  })
  .strict();
export type AgentEvent = z.infer<typeof agentEventSchema>;
export const reportSchema = z
  .object({
    version: z.literal(1),
    context: contextSchema,
    language: languageSchema,
    reviewedAt: z.iso.datetime(),
    mode: z.enum([
      "live_gemini",
      "live_groq",
      "live_openrouter",
      "synthetic_fixture",
      "recorded_sample",
      "mixed",
    ]),
    documents: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        documentType: documentTypeSchema,
        mode: z.enum([
          "live_gemini",
          "live_groq",
          "live_openrouter",
          "synthetic_fixture",
          "recorded_sample",
        ]),
        fields: z.array(
          z.object({
            key: z.enum(fieldKeys),
            rawValue: z.string().nullable(),
            value: z.string().nullable(),
            normalizedValue: z.string().nullable(),
            confidence: z.enum(["high", "medium", "low"]),
            confirmed: z.boolean(),
            edited: z.boolean(),
            pageNumber: z.number(),
            location: z.string().nullable(),
            uncertain: z.boolean(),
          }),
        ),
      }),
    ),
    findings: z.array(findingSchema),
    missing: z.array(missingSchema),
    checklist: z.array(checklistItemSchema),
    unverified_items: z.array(activeRuleSchema),
    sources: z.array(activeRuleSchema),
    agent_trace: z.array(agentEventSchema),
    limitations: z.array(z.string()),
  })
  .strict();
export type ReadinessReport = z.infer<typeof reportSchema>;
