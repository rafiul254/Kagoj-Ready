import { z } from "zod";
import data from "@/data/requirements/passport.json";
import {
  contextSchema,
  ruleSchema,
  type ApplicantContext,
  type ActiveRule,
  type Rule,
} from "./types";
export const OFFICIAL_SOURCE =
  "https://www.epassport.gov.bd/instructions/instructions";
export const registrySchema = z
  .object({
    schemaVersion: z.literal(1),
    stalenessPolicy: z.object({
      maxAgeDays: z.number().int().positive(),
      envOverride: z.string(),
      basis: z.literal("verifiedAt"),
      missingDateIsStale: z.boolean(),
    }),
    rules: z.array(ruleSchema),
  })
  .strict();
export const registry = registrySchema.parse(data);
export function staleDays() {
  const n = Number(process.env.RULE_STALE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : registry.stalenessPolicy.maxAgeDays;
}
export function retrieveOfficialRequirements(
  context: ApplicantContext,
  rules: Rule[] = registry.rules,
  now = new Date(),
  maxAgeDays = staleDays(),
): ActiveRule[] {
  if (context.service !== "passport") return [];
  return rules
    .filter(
      (r) =>
        r.service === "adult_first_time_epassport" &&
        Object.entries(r.appliesWhen).every(
          ([k, v]) => context[k as keyof ApplicantContext] === v,
        ),
    )
    .map((r) => {
      const stamp = r.verifiedAt ? new Date(r.verifiedAt).getTime() : NaN;
      const stale =
        !Number.isFinite(stamp) ||
        stamp > now.getTime() ||
        now.getTime() - stamp > maxAgeDays * 86400000;
      return {
        ...r,
        stale,
        usable: r.verificationStatus === "verified" && !stale,
      };
    });
}
export function classifyServiceCase(input: unknown) {
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success)
    return {
      supported: false,
      ruleMatched: false,
      reason: "missing_context" as const,
      applicableRuleIds: [],
      missingContext: parsed.error.issues.map((i) => i.path.join(".")),
      sourceUrl: OFFICIAL_SOURCE,
    };
  const c = parsed.data;
  // Any complete passport context may run the generic pipeline (reading and
  // comparing documents). Whether the verified rule pack covers the exact
  // case is reported separately via ruleMatched so the UI can stay honest
  // without blocking the applicant.
  const supported = c.service === "passport";
  const ruleMatched =
    supported &&
    c.ageBand === "20_plus" &&
    c.applicationType === "first_time" &&
    c.location === "bangladesh";
  return {
    supported,
    ruleMatched,
    reason: ruleMatched ? ("supported" as const) : ("outside_mvp" as const),
    applicableRuleIds: ruleMatched
      ? retrieveOfficialRequirements(c).map((r) => r.id)
      : [],
    missingContext: [],
    sourceUrl: OFFICIAL_SOURCE,
  };
}
