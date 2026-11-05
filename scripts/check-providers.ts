// Self-diagnostic: run `npm run check:providers`
// Reads .env.local, pings every configured provider with a tiny text request,
// and prints exactly why each one fails — no keys are ever printed.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  const env: Record<string, string> = {};
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = { ...loadEnv(), ...process.env } as Record<
  string,
  string | undefined
>;
const mask = (v?: string) => (v ? `${v.slice(0, 5)}…(${v.length} chars)` : "—");
const geminiReady = Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
const groqReady = Boolean(env.GROQ_API_KEY);
const openrouterReady = Boolean(env.OPENROUTER_API_KEY);
console.log("=".repeat(64));
console.log("Provider self-check");
console.log(
  `GEMINI_API_KEY ${mask(env.GEMINI_API_KEY)} · GEMINI_MODEL ${env.GEMINI_MODEL ?? "—"}`,
);
console.log(`GROQ_API_KEY   ${mask(env.GROQ_API_KEY)}`);
console.log(`OPENROUTER_API_KEY ${mask(env.OPENROUTER_API_KEY)}`);
console.log("=".repeat(64));
const timeout = AbortSignal.timeout(15000);

async function gemini() {
  if (!geminiReady)
    return console.log("gemini: SKIP (GEMINI_API_KEY or GEMINI_MODEL missing)");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: timeout,
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: "Reply with the single word OK" }] },
      ],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (res.ok) console.log("gemini: OK ✓");
  else {
    const message = body.error?.message ?? "unknown";
    let hint = "region blocked or bad key; just use Groq/OpenRouter instead";
    if (res.status === 403 && /free tier/i.test(message))
      hint =
        "this project/region has no Gemini free tier (needs billing) — the app still works via OpenRouter: either enable billing at aistudio.google.com/billing, try once with a fresh key, or blank GEMINI_API_KEY+GEMINI_MODEL in .env.local so the app skips it instantly";
    console.log(`gemini: FAIL ✗ HTTP ${res.status} — ${message}\n  → ${hint}`);
  }
}

async function groq() {
  if (!groqReady) return console.log("groq: SKIP (GROQ_API_KEY missing)");
  const list = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    signal: timeout,
  });
  if (!list.ok) {
    const body = (await list.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    return console.log(
      `groq: FAIL ✗ HTTP ${list.status} — ${body.error?.message ?? "invalid key"}`,
    );
  }
  const models =
    ((await list.json()) as { data?: Array<{ id: string }> }).data ?? [];
  const vision = models
    .map((m) => m.id)
    .filter((id) => /scout|maverick|vl|vision|pixtral|gemma-[4-9]/i.test(id));
  console.log(
    `groq: key OK ✓ · ${models.length} models · vision-capable: ${vision.join(", ") || "NONE — Groq has no vision model on this account"}`,
  );
  if (!vision.length)
    console.log(
      "  → set OPENROUTER_API_KEY instead: Groq can no longer read images",
    );
  else
    console.log(
      "  → the app auto-picks one of these; or set GROQ_MODEL=<id> to pin it",
    );
}

async function openrouter() {
  if (!openrouterReady)
    return console.log("openrouter: SKIP (OPENROUTER_API_KEY missing)");
  // Account status first: shows how many free-model requests are left today,
  // so a 429 can be told apart (own daily cap vs upstream saturation).
  try {
    const key = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: timeout,
    });
    if (key.ok) {
      const info = (await key.json()) as {
        data?: {
          usage?: number;
          free_model_daily_requests?: {
            used?: number;
            limit?: number;
            remaining?: number;
          };
        };
      };
      const free = info.data?.free_model_daily_requests;
      if (free) {
        const remaining =
          free.remaining ?? (free.limit ?? 50) - (free.used ?? 0);
        console.log(
          `openrouter free quota today: ${free.used ?? "?"} used · ${remaining} remaining (resets 00:00 UTC ≈ 6am BD)`,
        );
      } else {
        console.log(
          `openrouter key: valid ✓ (usage ${info.data?.usage ?? "?"})`,
        );
      }
    } else {
      console.log(`openrouter key: HTTP ${key.status} — check the key`);
    }
  } catch {
    console.log("openrouter key: status check failed (network) — continuing");
  }
  // `||` not `??`: an empty OPENROUTER_MODEL= line in .env.local must resolve
  // to the built-in default, not be sent as an empty model ("No models provided").
  const defaults = [
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3.5-super-vl:free",
    "google/gemma-4-26b-a4b-it:free",
    "dots-studio/dots-3-note-preview:free",
  ];
  const userFallbacks = (
    env.OPENROUTER_FALLBACK_MODELS ||
    env.OPENROUTER_FALLBACK_MODEL ||
    ""
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = [
    ...new Set([
      env.OPENROUTER_MODEL || defaults[0],
      ...userFallbacks,
      ...defaults,
    ]),
  ].slice(0, 4);
  let ok = false;
  for (const model of models) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: timeout,
      body: JSON.stringify({
        model,
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reply with the single word OK" },
              // 1x1 PNG: proves the model actually accepts image input.
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                },
              },
            ],
          },
        ],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (res.ok) {
      console.log(`openrouter ${model}: OK ✓ (image accepted)`);
      ok = true;
      break; // first working model is enough — every unused probe saves quota
    }
    console.log(
      `openrouter ${model}: FAIL ✗ HTTP ${res.status} — ${body.error?.message ?? "unknown"}`,
    );
  }
  if (ok) return;
  console.log(
    "  → 429 notes: free models allow 20/min and 50/day (resets 00:00 UTC ≈ 6am Bangladesh). " +
      '429 with "Provider returned error" usually means the upstream pool is momentarily saturated — wait a few minutes and re-run. ' +
      "$10 of credits raises the daily cap to 1000. The app itself walks this same model pool automatically.",
  );
}

async function main() {
  try {
    await gemini();
    await groq();
    await openrouter();
  } catch (e) {
    console.log("network error:", e instanceof Error ? e.message : e);
  }
  console.log("=".repeat(64));
  console.log("Next: fix the ✗ line, restart `npm run dev`, and try again.");
}
main();
