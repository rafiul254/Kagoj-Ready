> Updated implementation note: guarded function-calling is now implemented in `src/lib/agent/provider.ts` and tested with a mocked transport. Live hosted-model verification remains pending. The Phase 1 discussion below is retained as the original design checkpoint.

# Gemini SDK review — Phase 1

Documentation consulted on **2026-10-14 (Asia/Dhaka)**. This is a documentation-access date, not government-rule verification metadata.

## Official references consulted

- https://ai.google.dev/gemini-api/docs/libraries
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/gemini-api/docs/function-calling
- https://ai.google.dev/gemini-api/docs/generate-content/function-calling

## Implementation decisions

- Official current JavaScript SDK: `@google/genai`, installed and lockfile-pinned through npm (2.29.1 at this build). Do not use legacy `@google/generative-ai`.
- The fetched docs offer Interactions and generateContent APIs. This prototype deliberately uses **stateless generateContent** with inline image data to avoid application-managed provider-side interaction state.
- Read `GEMINI_MODEL` and `GEMINI_API_KEY` on the server. Model catalog availability is not proof of project access. No default model, auto-switch, or silent downgrade is coded.
- Installed SDK types support `responseMimeType` and `responseJsonSchema`; these fields are used with `z.toJSONSchema`. Response parsing and semantic checks remain mandatory even with structured output.
- `countTokens` provides a preflight budget estimate; maximum output is reserved before each generation attempt. Abort signals and SDK HTTP timeouts bound operations. SDK retry attempts are disabled beyond the initial attempt; code alone owns the single transient retry.
- `finishReason` must be `STOP`; truncated/blocked/non-JSON outputs fail safely and are not re-prompted for a desired answer.
- Evidence is a short location, not a quotation. Returned values are still untrusted and not proof of identity. No tools are exposed during vision extraction.

## Function calling — reviewed, NOT implemented in Phase 1

The JavaScript SDK accepts tool declarations and returns requested function calls for application code to dispatch. A declaration or function-call mode does not authorize a side effect. Phase 3 must validate each requested name/arguments against a **state-specific allowlist**, limit steps and tokens, preserve required model response context, and manually execute only permitted tools. Do not blindly invoke arbitrary returned function names. Function-calling/structured-output combinations and model-specific behavior require an integration test with the selected model.

## Live verification still needed

Without credentials, tests can verify our configuration and handling using a mocked SDK transport, but cannot establish that a chosen hosted model accepts every schema option, emits the expected finish reason, reads these Bengali characters, respects the budgets as expected, or produces accurate evidence. `npm run eval` is the next validation step, not optional proof supplied by unit tests.
