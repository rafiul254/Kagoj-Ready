// Lists the Gemini models your API key can actually call for generateContent.
// Run: npm run models   (reads GEMINI_API_KEY from .env / .env.local)
import { GoogleGenAI } from "@google/genai";

// Wrapped in main(): top-level await breaks tsx under CommonJS output
// ("Top-level await is currently not supported with the cjs output format").
async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY is not set in .env or .env.local");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey: key });
  const rows: string[] = [];
  try {
    for await (const m of await ai.models.list({ config: { pageSize: 100 } })) {
      if (m.supportedActions?.includes("generateContent") && m.name)
        rows.push(m.name.replace(/^models\//, ""));
    }
  } catch (e) {
    console.error(
      "Could not list models:",
      e instanceof Error ? e.message.slice(0, 200) : "unknown error",
    );
    process.exit(1);
  }
  console.log("Models usable for generateContent (put one in GEMINI_MODEL):");
  for (const r of rows.sort()) console.log(" ", r);
  console.log("Pick a current *flash* model that supports image input.");
}

main();
