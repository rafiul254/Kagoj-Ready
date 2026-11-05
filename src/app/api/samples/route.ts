import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sampleRequestSchema, manifestSchema } from "@/lib/schemas";
import samples from "@/data/samples.json";
import { createLiveProvider } from "@/lib/agent/provider";
import { processDocument } from "@/lib/pipeline";
import { SafeError, safeCode } from "@/lib/errors";
import { clientIp, labEnabled } from "@/lib/http";
import { consumeRequest, assertProductionLimits } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
};
export async function POST(request: Request) {
  if (!labEnabled()) return new Response(null, { status: 404 });
  try {
    // Browser same-origin only. No permissive CORS header. Origin host must equal routed Host.
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      throw new SafeError("INVALID_REQUEST");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new SafeError("INVALID_REQUEST");
    if (Number(request.headers.get("content-length") ?? 0) > 1024)
      throw new SafeError("INVALID_REQUEST");
    // Stream to a bounded buffer, even when Content-Length is missing or dishonest.
    const reader = request.body?.getReader();
    if (!reader) throw new SafeError("INVALID_REQUEST");
    let body = "";
    let size = 0;
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new SafeError("INVALID_REQUEST");
      }
      body += decoder.decode(value, { stream: true });
    }
    let input;
    try {
      input = sampleRequestSchema.parse(JSON.parse(body));
    } catch {
      throw new SafeError("INVALID_REQUEST");
    }
    await consumeRequest(clientIp(request));
    assertProductionLimits();
    const provider = createLiveProvider();
    const fixture = manifestSchema
      .parse(samples)
      .fixtures.find((f) => f.id === input.sampleId)!;
    const bytes = await readFile(join(process.cwd(), "public", fixture.file));
    const result = await processDocument(
      {
        bytes,
        mimeType: "image/png",
        filename: input.sampleId + ".png",
        language: input.language,
      },
      provider,
      AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
    );
    return Response.json(result, { headers });
  } catch (e) {
    const code = safeCode(e);
    const status =
      code === "NOT_CONFIGURED"
        ? 503
        : code === "REQUEST_LIMIT" || code === "QUOTA"
          ? 429
          : code === "INVALID_REQUEST"
            ? 400
            : code === "TIMEOUT"
              ? 504
              : 502;
    // Never return or log provider error strings, schema values, image bytes, or document text.
    return Response.json({ error: code }, { status, headers });
  }
}
