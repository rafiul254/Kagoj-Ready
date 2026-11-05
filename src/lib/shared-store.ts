import { z } from "zod";
import { SafeError } from "./errors";
export function hasSharedStore() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}
export async function storeCommand(
  command: (string | number)[],
): Promise<unknown> {
  if (!hasSharedStore()) throw new SafeError("NOT_CONFIGURED");
  const endpoint = process.env.UPSTASH_REDIS_REST_URL!;
  if (!endpoint.startsWith("https://")) throw new SafeError("NOT_CONFIGURED");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new SafeError("PROVIDER_UNAVAILABLE");
    const data = z
      .object({ result: z.unknown(), error: z.string().optional() })
      .parse(await response.json());
    if (data.error) throw new SafeError("PROVIDER_UNAVAILABLE");
    return data.result;
  } catch (e) {
    if (e instanceof SafeError) throw e;
    throw new SafeError("PROVIDER_UNAVAILABLE");
  }
}
