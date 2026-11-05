import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import samples from "@/data/samples.json";
import { manifestSchema, languageSchema } from "@/lib/schemas";
import { contextSchema, type AgentEvent } from "@/lib/domain/types";
import { classifyServiceCase } from "@/lib/domain/registry";
import { CaseBudget, getCaseBudget } from "@/lib/agent/budget";
import { extractWithAgent } from "@/lib/agent/extract";
import {
  createLiveAgentProvider,
  liveProviderConfigured,
} from "@/lib/agent/provider";
import { MockProvider } from "@/lib/ai/mock";
import { sameOrigin, boundedBody, safeResponse, clientIp } from "@/lib/http";
import { recordedProvider } from "@/lib/agent/recorded";
import { consumeRequest, assertProductionLimits } from "@/lib/rate-limit";
import { SafeError, safeCode, safeDetail } from "@/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const inputSchema = z
  .object({
    caseId: z.string().min(1).max(200),
    documentId: z.string().regex(/^doc-[123]$/),
    language: languageSchema,
    context: contextSchema,
    consent: z.literal(true),
    sampleId: z
      .enum([
        "baseline",
        "format",
        "variant",
        "parent",
        "dob",
        "missing",
        "blurry",
        "wrong",
      ])
      .nullable(),
    sampleMode: z.enum(["auto", "synthetic_fixture"]),
  })
  .strict();
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await consumeRequest(clientIp(request));
    const raw = await boundedBody(request, 4 * 1024 * 1024 + 16384);
    const contentType = request.headers.get("content-type") ?? "";
    let metadata: unknown,
      file: File | null = null;
    try {
      if (contentType.startsWith("multipart/form-data")) {
        const form = await new Response(raw, {
          headers: { "Content-Type": contentType },
        }).formData();
        metadata = JSON.parse(String(form.get("metadata")));
        const f = form.get("image");
        if (f instanceof File) file = f;
      } else if (contentType.startsWith("application/json"))
        metadata = JSON.parse(raw.toString("utf8"));
      else throw new Error();
    } catch {
      throw new SafeError("INVALID_REQUEST");
    }
    const parsed = inputSchema.safeParse(metadata);
    if (!parsed.success) throw new SafeError("INVALID_REQUEST");
    const input = parsed.data;
    if (!classifyServiceCase(input.context).supported)
      throw new SafeError("INVALID_REQUEST");
    let budget: CaseBudget;
    try {
      budget = await getCaseBudget(input.caseId);
    } catch (error) {
      if (
        input.sampleId &&
        (input.sampleMode === "synthetic_fixture" || !liveProviderConfigured())
      )
        budget = new CaseBudget();
      else throw error;
    }
    await budget.claimDocument(input.documentId);
    let bytes: Buffer, mimeType: string, filename: string;
    const fixture = input.sampleId
      ? manifestSchema
          .parse(samples)
          .fixtures.find((f) => f.id === input.sampleId)
      : null;
    if (fixture) {
      bytes = await readFile(join(process.cwd(), "public", fixture.file));
      mimeType = "image/png";
      filename = fixture.id + ".png";
    } else {
      if (!file || input.sampleMode !== "auto")
        throw new SafeError("INVALID_REQUEST");
      bytes = Buffer.from(await file.arrayBuffer());
      mimeType = file.type;
      filename = file.name;
    }
    const args = {
      bytes,
      mimeType,
      filename,
      language: input.language,
      context: input.context,
      documentId: input.documentId,
      label: input.documentId,
      sampleId: input.sampleId,
    };
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(50000),
    ]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (type: string, data: unknown) => {
          if (!closed)
            try {
              controller.enqueue(
                encoder.encode(
                  `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
                ),
              );
            } catch {
              closed = true;
            }
        };
        const emit = (event: AgentEvent) => send("trace", event);
        try {
          let result;
          if (fixture && input.sampleMode === "synthetic_fixture")
            result = await extractWithAgent(
              args,
              new MockProvider(fixture),
              emit,
              signal,
            );
          else
            try {
              assertProductionLimits();
              result = await extractWithAgent(
                args,
                createLiveAgentProvider(budget),
                emit,
                signal,
              );
            } catch (error) {
              if (!fixture || signal.aborted) throw error;
              const recording = recordedProvider(fixture);
              send("fallback", {
                reason: safeCode(error),
                mode: recording ? "recorded_sample" : "synthetic_fixture",
              });
              result = await extractWithAgent(
                args,
                recording ?? new MockProvider(fixture),
                emit,
                signal,
              );
              if (recording && result.document)
                result.document.mode = "recorded_sample";
            }
          send("result", { ...result, budget: budget.summary() });
        } catch (error) {
          const detail = safeDetail(error);
          send("error", {
            error: safeCode(error),
            ...(detail ? { detail } : {}),
          });
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return safeResponse(error);
  }
}
