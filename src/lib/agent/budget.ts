import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { SafeError } from "../errors";
import { hasSharedStore, storeCommand } from "../shared-store";
export class CaseBudget {
  private documentIds = new Set<string>();
  steps = 0;
  reservedTokens = 0;
  expiresAt = Date.now() + 3600000;
  constructor(
    readonly maxSteps = 12,
    readonly maxTokens = 60000,
  ) {}
  claimDocument(id: string): void | Promise<void> {
    if (!this.documentIds.has(id) && this.documentIds.size >= 3)
      throw new SafeError("INVALID_REQUEST");
    this.documentIds.add(id);
  }
  reserve(tokens: number): void | Promise<void> {
    if (
      !Number.isInteger(tokens) ||
      tokens < 1 ||
      this.steps + 1 > this.maxSteps ||
      this.reservedTokens + tokens > this.maxTokens ||
      Date.now() > this.expiresAt
    )
      throw new SafeError("TOKEN_BUDGET");
    this.steps++;
    this.reservedTokens += tokens;
  }
  summary() {
    return {
      steps: this.steps,
      reservedTokens: this.reservedTokens,
      maxSteps: this.maxSteps,
      maxTokens: this.maxTokens,
    };
  }
}
class SharedCaseBudget extends CaseBudget {
  constructor(
    private id: string,
    steps: number,
    tokens: number,
  ) {
    super();
    this.steps = steps;
    this.reservedTokens = tokens;
  }
  async claimDocument(id: string) {
    if (!/^doc-[123]$/.test(id)) throw new SafeError("INVALID_REQUEST");
  }
  async reserve(tokens: number) {
    if (!Number.isInteger(tokens) || tokens < 1)
      throw new SafeError("TOKEN_BUDGET");
    const script =
      "if redis.call('EXISTS',KEYS[1])==0 then return {-1,0} end local s=tonumber(redis.call('HGET',KEYS[1],'steps') or '0'); local t=tonumber(redis.call('HGET',KEYS[1],'tokens') or '0'); if s+1>tonumber(ARGV[1]) or t+tonumber(ARGV[3])>tonumber(ARGV[2]) then return {-2,0} end redis.call('HSET',KEYS[1],'steps',s+1,'tokens',t+tonumber(ARGV[3])); return {s+1,t+tonumber(ARGV[3])}";
    const result = z
      .tuple([z.number(), z.number()])
      .parse(
        await storeCommand([
          "EVAL",
          script,
          1,
          `kagoj:budget:${this.id}`,
          this.maxSteps,
          this.maxTokens,
          tokens,
        ]),
      );
    if (result[0] < 0) throw new SafeError("TOKEN_BUDGET");
    [this.steps, this.reservedTokens] = result;
  }
}
const globalBudgets = globalThis as typeof globalThis & {
  kagojBudgets?: Map<string, CaseBudget>;
};
const budgets = (globalBudgets.kagojBudgets ??= new Map<string, CaseBudget>());
export async function createCaseBudget() {
  const id = randomUUID();
  if (hasSharedStore()) {
    await storeCommand([
      "EVAL",
      "redis.call('HSET',KEYS[1],'steps',0,'tokens',0); redis.call('EXPIRE',KEYS[1],3600); return 1",
      1,
      `kagoj:budget:${id}`,
    ]);
    return id;
  }
  for (const [key, b] of budgets)
    if (b.expiresAt < Date.now()) budgets.delete(key);
  if (budgets.size >= 10000) throw new SafeError("REQUEST_LIMIT");
  // Serverless instances do not share memory, so the case id is a SIGNED
  // token: any instance can verify it without a shared store. Without Redis
  // the step/token counters are per instance (best effort); set the Upstash
  // variables for exact cross-instance accounting.
  const expiresAt = Date.now() + 3600000;
  const token = signCase(id, expiresAt);
  const budget = new CaseBudget();
  budget.expiresAt = expiresAt;
  budgets.set(token, budget);
  return token;
}
function caseSecret() {
  return (
    process.env.CASE_SIGNING_SECRET ||
    createHash("sha256")
      .update(
        "kagoj-case:" +
          (process.env.OPENROUTER_API_KEY ||
            process.env.GEMINI_API_KEY ||
            process.env.GROQ_API_KEY ||
            "local-development"),
      )
      .digest("hex")
  );
}
function signCase(id: string, expiresAt: number) {
  const sig = createHmac("sha256", caseSecret())
    .update(`${id}.${expiresAt}`)
    .digest("base64url")
    .slice(0, 32);
  return `${id}.${expiresAt}.${sig}`;
}
function verifyCase(token: string): number | null {
  const [id, exp, sig, extra] = token.split(".");
  if (extra !== undefined || !id || !exp || !sig) return null;
  if (!z.uuid().safeParse(id).success || !/^\d{10,15}$/.test(exp)) return null;
  const expected = signCase(id, Number(exp)).split(".")[2];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Number(exp) < Date.now() ? null : Number(exp);
}
export async function getCaseBudget(id: string) {
  if (typeof id !== "string" || id.length > 200)
    throw new SafeError("INVALID_REQUEST");
  if (!hasSharedStore()) {
    const exp = verifyCase(id);
    if (exp === null) throw new SafeError("INVALID_REQUEST");
    let known = budgets.get(id);
    if (!known) {
      known = new CaseBudget();
      known.expiresAt = exp;
      budgets.set(id, known);
    }
    return known;
  }
  if (!z.uuid().safeParse(id).success) throw new SafeError("INVALID_REQUEST");
  if (hasSharedStore()) {
    const values = z
      .array(z.string())
      .parse(await storeCommand(["HGETALL", `kagoj:budget:${id}`]));
    if (values.length < 4) throw new SafeError("INVALID_REQUEST");
    const fields = Object.fromEntries(
      Array.from({ length: values.length / 2 }, (_, i) => [
        values[i * 2],
        values[i * 2 + 1],
      ]),
    );
    return new SharedCaseBudget(
      id,
      Number(fields.steps),
      Number(fields.tokens),
    );
  }
  const budget = budgets.get(id);
  if (!budget || budget.expiresAt < Date.now())
    throw new SafeError("INVALID_REQUEST");
  return budget;
}
