export const errorCodes = [
  "NOT_CONFIGURED",
  "INVALID_IMAGE",
  "UNSUPPORTED_FORMAT",
  "IMAGE_SIZE",
  "IMAGE_DIMENSIONS",
  "MULTIPAGE",
  "TIMEOUT",
  "QUOTA",
  "PROVIDER_UNAVAILABLE",
  "INVALID_OUTPUT",
  "TOKEN_BUDGET",
  "REQUEST_LIMIT",
  "INVALID_REQUEST",
  "CANCELLED",
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export class SafeError extends Error {
  constructor(
    public code: ErrorCode,
    public detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SafeError";
  }
}
export function safeCode(error: unknown): ErrorCode {
  return error instanceof SafeError ? error.code : "PROVIDER_UNAVAILABLE";
}
// Final scrub for anything that leaves the server: no URLs, e-mails, IP
// addresses, key-like tokens or control characters, and a hard length cap.
function scrub(text: string, max: number): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip]")
    .replace(/\b(?:AIza|gsk_|sk-|sk_|ya29\.|Bearer\s)[\w.-]*/gi, "[redacted]")
    .replace(
      /\b(api[_ -]?key|token|secret|authorization)\b\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
export function safeDetail(error: unknown): string | undefined {
  if (!(error instanceof SafeError) || !error.detail) return undefined;
  return scrub(error.detail, 300) || undefined;
}
// Provider error details are shown to the user. Strip anything that looks like
// a credential and keep the line short; never include request payloads.
export function sanitizeDetail(text: string): string {
  return scrub(text, 140);
}
