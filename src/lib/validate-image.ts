import sharp from "sharp";
import type { Metadata } from "sharp";
import { SafeError } from "./errors";
export const MAX_BYTES = 4 * 1024 * 1024;
export type ValidatedImage = {
  bytes: Buffer;
  mimeType: "image/jpeg";
};
// Formats the bundled sharp/libvips can decode from a Buffer. SVG and raw are
// excluded deliberately: they are not photos and SVG rasterization is a risk.
const DECODABLE = new Set([
  "jpeg",
  "png",
  "webp",
  "tiff",
  "gif",
  "avif",
  "heif",
]);
const LIMITS = {
  limitInputPixels: 16_000_000,
} as const;
export async function validateImage(
  bytes: Buffer,
  _mimeType: string,
  _filename: string,
): Promise<ValidatedImage> {
  if (bytes.length < 20 || bytes.length > MAX_BYTES)
    throw new SafeError("IMAGE_SIZE");
  // Content sniffing decides, not the extension or the browser MIME label —
  // files renamed on disk (a JPEG named .png, a HEIC named .jpg) are common.
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { ...LIMITS, animated: true }).metadata();
  } catch {
    throw new SafeError("UNSUPPORTED_FORMAT");
  }
  if (!meta.format || !DECODABLE.has(meta.format))
    throw new SafeError("UNSUPPORTED_FORMAT");
  if ((meta.pages ?? 1) !== 1) throw new SafeError("MULTIPAGE");
  if (
    !meta.width ||
    !meta.height ||
    meta.width < 320 ||
    meta.height < 240 ||
    meta.width > 6000 ||
    meta.height > 6000 ||
    meta.width * meta.height > 16_000_000
  )
    throw new SafeError("IMAGE_DIMENSIONS");
  try {
    // Decode fully and re-encode as JPEG: strips EXIF, applies EXIF rotation,
    // rejects truncated payloads, and gives every provider one uniform format.
    // Never write to disk.
    const clean = await sharp(bytes, { ...LIMITS, failOn: "warning" })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return { bytes: clean, mimeType: "image/jpeg" };
  } catch (e) {
    if (e instanceof SafeError) throw e;
    throw new SafeError("INVALID_IMAGE");
  }
}
