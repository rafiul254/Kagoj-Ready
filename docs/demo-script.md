# Two-minute demo — Kagoj Ready

**Scenario:** the same `baseline` + `parent` SAMPLE cards used in automated tests. Correction replaces document 2 with `format`. All content is fictional and watermarked SAMPLE. Do not include real people's documents in the recording.

**Honest mode:** select **Synthetic fixture only — no model** unless a live Gemini run has actually been configured, tested and completed. Never narrate a fixture/recording as live AI. The current build has no live accuracy result.

## Preparation

- Open `/prepare?sample=1`; choose Bangla or English.
- Reset any prior case. Keep the browser at a readable width and use the large-text control if needed.
- Show the mode label and unverified source badges in the video.
- Have the report and evaluation pages available. Use a real observed run, not edited fake results.

## Script and actions

### 0:00–0:18 — Problem

“Before visiting a government office, a person may be unsure whether their own documents agree. Kagoj Ready helps them see what differs and what still needs checking. It does not submit applications or promise approval.”

**Show:** home, tagline, supported passport scope and the non-official-service disclaimer.

### 0:18–0:35 — Scope and consent

“This MVP supports first-time e-Passport preparation for adults aged twenty or over applying from Bangladesh. Other categories get an official-source link instead of guessed rules. Processing and privacy are explained before documents are sent.”

**Show:** applicant context and consent. Briefly point to the sample banner.

### 0:35–0:55 — Read, but never pretend

“These are fictional SAMPLE cards. This demonstration is using the clearly labeled synthetic fixture mode, not a live model result. With credentials configured, Gemini vision reads the same workflow, and the agent can request a bounded re-read of uncertain fields.”

**Show:** baseline + parent selection, processing mode, actual activity events.

### 0:55–1:18 — Human confirmation

“Before comparison, the agent pauses. I check the original reading and normalized value, edit any OCR mistakes, and confirm the identity fields. Original evidence is preserved, and identity numbers remain masked.”

**Show:** the disabled compare button, the mother's-name fields, required confirmations. Confirm each required field, then generate the report.

### 1:18–1:40 — Evidence and next steps

“The two confirmed mother's names differ. Deterministic code—not the language model—finds that difference. The report shows both values and the matching rule. It asks for verification, not an automatic legal-record change. Government requirements are still visibly unverified.”

**Show:** finding, software-rule link, ordered checklist and source badges. Do not call it a rejection prediction.

### 1:40–1:55 — Re-plan

“Replacing the second sample reruns that document, pauses for confirmation again, and shows what changed. The unaffected evidence stays intact.”

**Show:** replace document 2 with `format`, confirm affected fields, before/after diff. Preparation may still be incomplete because source requirements remain unverified.

### 1:55–2:00 — Close

“Print the evidence-linked report, then delete the browser-held case. Know before you go.”

**Show:** print preview and footer watermark placeholder, then Delete my data.

## If presenting live AI later

Replace only the mode narration after a real live run succeeds. If fallback occurs, say “Recorded sample run” only when a genuine recording exists; otherwise say “Synthetic fixture run.” Show `/evaluation` separately: current fixture metrics are software tests, not AI accuracy. Do not add impact, accuracy or time-saved claims without measurement.
