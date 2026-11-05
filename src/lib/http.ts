import { isIP } from "node:net";
import { SafeError, safeCode } from "./errors";
// Best-effort client address for rate limiting. Never trusts the first
// x-forwarded-for hop (client-controlled): it prefers headers a platform proxy
// sets itself, then the LAST forwarded hop (appended by the nearest proxy).
// Invalid values collapse into one shared "unknown" bucket (fail closed).
export function clientIp(request: Request): string {
  const h = request.headers;
  const last = h.get("x-forwarded-for")?.split(",").pop()?.trim();
  const candidates =
    process.env.VERCEL === "1"
      ? [
          h.get("x-vercel-forwarded-for")?.split(",")[0],
          h.get("x-real-ip"),
          last,
        ]
      : [h.get("x-real-ip"), last];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && isIP(ip)) return isIP(ip) === 6 ? ipv6Prefix(ip) : ip;
  }
  return "unknown";
}
// IPv6 users own a whole /64: bucket by prefix so rotating addresses inside it
// cannot dodge the limit.
function ipv6Prefix(ip: string): string {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b]
    : a;
  return (
    groups
      .slice(0, 4)
      .map((g) => g.replace(/^0+(?=.)/, ""))
      .join(":") + "::/64"
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Browsers always send Origin on cross-origin POST; a missing Origin with a
    // cross-site fetch-metadata header is a forged or odd context, so refuse.
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new SafeError("INVALID_REQUEST");
    return;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new SafeError("INVALID_REQUEST");
  }
  const hosts = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ];
  if (hosts.some((h) => h?.split(",").some((p) => p.trim() === originHost)))
    return;
  // Preview/tunnel proxies may rewrite Host; stay strict only in production.
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1")
    return;
  throw new SafeError("INVALID_REQUEST");
}
export async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new SafeError("IMAGE_SIZE");
  const reader = request.body?.getReader();
  if (!reader) throw new SafeError("INVALID_REQUEST");
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new SafeError("IMAGE_SIZE");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
export function safeResponse(error: unknown) {
  const code = safeCode(error);
  return Response.json(
    { error: code },
    {
      status:
        code === "REQUEST_LIMIT" || code === "QUOTA"
          ? 429
          : code === "NOT_CONFIGURED"
            ? 503
            : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// The single-sample diagnostic lab (/lab, /api/samples) spends provider quota
// without the confirmation flow, so it is off in production unless opted in.
export function labEnabled() {
  return (
    process.env.NODE_ENV !== "production" || process.env.ENABLE_LAB === "true"
  );
}
