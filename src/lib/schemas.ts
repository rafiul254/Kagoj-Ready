import { z } from "zod";
export const fieldKeys = [
  "name_bn",
  "name_en",
  "father_name",
  "mother_name",
  "date_of_birth",
  "id_number",
  "address",
  "issue_date",
] as const;
export type FieldKey = (typeof fieldKeys)[number];
export const languageSchema = z.enum(["bn", "en"]);
export type Language = z.infer<typeof languageSchema>;
export const documentTypeSchema = z.enum([
  "nid",
  "birth_certificate",
  "passport",
  "other",
]);
export const rejectionSchema = z.enum([
  "blurry",
  "cropped",
  "glare",
  "wrong_document",
  "unreadable",
]);
export const identificationSchema = z
  .object({
    documentType: documentTypeSchema,
    readable: z.boolean(),
    reason: rejectionSchema.nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.readable
        ? v.reason === null && v.documentType !== "other"
        : v.reason !== null,
    "Inconsistent identification",
  );
export const fieldSchema = z
  .object({
    rawValue: z.string().min(1).max(500).nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    pageNumber: z.literal(1),
    evidenceLocation: z.string().min(1).max(120).nullable(),
    reason: z
      .enum([
        "missing",
        "unreadable",
        "implausible_date",
        "invalid_length",
        "invalid_characters",
      ])
      .nullable(),
  })
  .strict();
const shape = Object.fromEntries(
  fieldKeys.map((k) => [k, fieldSchema]),
) as Record<FieldKey, typeof fieldSchema>;
export const extractionSchema = z
  .object({ fields: z.object(shape).strict() })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export type Identification = z.infer<typeof identificationSchema>;
export const traceSchema = z
  .object({
    tool: z.enum([
      "validateImage",
      "identifyDocument",
      "extractDocumentFields",
    ]),
    status: z.enum(["completed", "failed"]),
    code: z.string().max(40),
  })
  .strict();
export const resultSchema = z
  .object({
    mode: z.enum(["live_gemini", "mock_test"]),
    identification: identificationSchema,
    extraction: extractionSchema.nullable(),
    trace: z.array(traceSchema),
    usage: z.object({
      modelCalls: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
  })
  .strict();
export type PipelineResult = z.infer<typeof resultSchema>;
export const sampleRequestSchema = z
  .object({
    sampleId: z.enum([
      "baseline",
      "format",
      "variant",
      "parent",
      "dob",
      "missing",
      "blurry",
      "wrong",
    ]),
    language: languageSchema,
    consent: z.literal(true),
  })
  .strict();
export const fixtureSchema = z
  .object({
    id: z.string(),
    file: z.string(),
    title: z.string(),
    documentType: documentTypeSchema,
    expectedRejection: rejectionSchema.nullable(),
    fields: z
      .object(
        Object.fromEntries(
          fieldKeys.map((k) => [k, z.string().nullable()]),
        ) as Record<FieldKey, z.ZodNullable<z.ZodString>>,
      )
      .strict(),
    sha256: z.string().length(64),
  })
  .strict();
export type Fixture = z.infer<typeof fixtureSchema>;
export const manifestSchema = z
  .object({
    version: z.literal(1),
    synthetic: z.literal(true),
    description: z.string(),
    context: z.object({
      ageBand: z.literal("20_plus"),
      applicationType: z.literal("first_time"),
      location: z.literal("bangladesh"),
    }),
    fixtures: z.array(fixtureSchema).length(8),
    conflicts: z.array(
      z.object({
        left: z.string(),
        right: z.string(),
        field: z.enum(fieldKeys),
        expected: z.enum([
          "match",
          "format_difference",
          "possible_variation",
          "possible_discrepancy",
          "missing",
        ]),
      }),
    ),
  })
  .strict();
