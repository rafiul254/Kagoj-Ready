import { z } from "zod";
import { agentEventSchema, documentSchema } from "../domain/types";
import { errorCodes, SafeError } from "../errors";
export const agentResultSchema = z.object({
  document: documentSchema.nullable(),
  rejection: z
    .enum(["blurry", "cropped", "glare", "wrong_document", "unreadable"])
    .nullable(),
  budget: z.object({
    steps: z.number().int(),
    reservedTokens: z.number().int(),
    maxSteps: z.number().int(),
    maxTokens: z.number().int(),
  }),
});
export const errorSchema = z.object({
  error: z.enum(errorCodes),
  detail: z.string().max(300).optional(),
});
export async function readAgentStream(
  response: Response,
  onTrace: (event: z.infer<typeof agentEventSchema>) => void,
  onFallback: () => void,
) {
  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json());
    throw new SafeError(
      parsed.success ? parsed.data.error : "PROVIDER_UNAVAILABLE",
      parsed.success ? parsed.data.detail : undefined,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SafeError("INVALID_OUTPUT");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: z.infer<typeof agentResultSchema> | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 500000) throw new SafeError("INVALID_OUTPUT");
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const type = event
          .split("\n")
          .find((s) => s.startsWith("event: "))
          ?.slice(7);
        const raw = event
          .split("\n")
          .find((s) => s.startsWith("data: "))
          ?.slice(6);
        if (!raw) continue;
        const data: unknown = JSON.parse(raw);
        if (type === "trace") onTrace(agentEventSchema.parse(data));
        else if (type === "fallback") onFallback();
        else if (type === "result") result = agentResultSchema.parse(data);
        else if (type === "error") {
          const parsed = errorSchema.parse(data);
          throw new SafeError(parsed.error, parsed.detail);
        }
      }
    }
  } catch (error) {
    await reader.cancel();
    if (error instanceof SafeError) throw error;
    throw new SafeError("INVALID_OUTPUT");
  }
  if (!result) throw new SafeError("INVALID_OUTPUT");
  return result;
}
export const NORMALIZED_MAX_SIDE = 2200;
// Browser-side normalization for ANY image the picker/camera/dropzone can
// produce. Decodes via createImageBitmap (JPEG, PNG, WebP, AVIF, BMP, GIF,
// HEIC on Safari), EXIF-rotates, downscales, re-encodes to a compact JPEG.
// When the browser cannot decode the file (e.g. HEIC on Chrome), the original
// bytes are sent and the server's sharp pipeline is the second chance.
export async function prepareClientImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/"))
    throw new SafeError("UNSUPPORTED_FORMAT");
  if (file.size > 50 * 1024 * 1024) throw new SafeError("IMAGE_SIZE");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (file.size > 4 * 1024 * 1024) throw new SafeError("IMAGE_SIZE");
    return file;
  }
  try {
    if (bitmap.width < 320 || bitmap.height < 240)
      throw new SafeError("IMAGE_DIMENSIONS");
    const scale = Math.min(
      1,
      NORMALIZED_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new SafeError("INVALID_IMAGE");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) throw new SafeError("INVALID_IMAGE");
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
