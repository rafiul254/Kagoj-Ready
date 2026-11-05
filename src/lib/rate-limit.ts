import { createHash } from "node:crypto";
import { SafeError } from "./errors";
import { hasSharedStore, storeCommand } from "./shared-store";
const state = {
  day: "",
  daily: 0,
  clients: new Map<string, { start: number; count: number }>(),
};
function positiveEnv(key: string, fallback: number) {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
export async function consumeRequest(ip: string, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10),
    perMinute = positiveEnv("RATE_LIMIT_PER_MINUTE", 20),
    dailyCap = positiveEnv("DAILY_REQUEST_CAP", 1500);
  const hash = createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? ""}:${day}:${ip}`)
    .digest("hex");
  if (hasSharedStore()) {
    const minute = Math.floor(now / 60000);
    const script =
      "local a=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if a>=tonumber(ARGV[1]) or b>=tonumber(ARGV[2]) then return 0 end redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],120); redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],172800); return 1";
    const result = await storeCommand([
      "EVAL",
      script,
      2,
      `kagoj:rate:${minute}:${hash}`,
      `kagoj:daily:${day}`,
      perMinute,
      dailyCap,
    ]);
    if (result !== 1) throw new SafeError("REQUEST_LIMIT");
    return;
  }
  if (state.day !== day) {
    state.day = day;
    state.daily = 0;
    state.clients.clear();
  }
  for (const [key, value] of state.clients)
    if (now - value.start >= 60000) state.clients.delete(key);
  const item = state.clients.get(hash) ?? { start: now, count: 0 };
  if (
    item.count >= perMinute ||
    state.daily >= dailyCap ||
    state.clients.size >= 10000
  )
    throw new SafeError("REQUEST_LIMIT");
  item.count++;
  state.daily++;
  state.clients.set(hash, item);
}
export function assertProductionLimits() {
  if (
    process.env.VERCEL === "1" &&
    !hasSharedStore() &&
    process.env.ALLOW_IN_MEMORY_LIMITS !== "true"
  )
    throw new SafeError("NOT_CONFIGURED");
}
