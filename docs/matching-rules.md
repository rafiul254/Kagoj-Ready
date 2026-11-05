# Deterministic matching rules

These are software comparison rules, **not government rules or rejection criteria**. No fuzzy metric proves identity. Severity is a preparation priority, never an approval or rejection prediction.

1. **document-specific**: issue dates are not expected to agree between documents. Identity numbers on different document types are different identifier systems; do not compare them. Return `not_applicable`.
2. **ocr-uncertainty**: low-confidence/unreadable evidence without confirmation, invalid dates or impossible lengths are `unreadable`, never a real conflict. Users may edit and confirm a visible value; original OCR remains unchanged.
3. **missing-field**: a null field is `missing`. This is not a claim that the document or field is legally required.
4. **exact**: exactly equal confirmed original/effective values are `match`.
5. **normalization**: normalize NFKC Unicode, Bangla digits, zero-width characters, case, whitespace and punctuation. Parse valid ISO or day-first numeric dates with full calendar validation. Equality after normalization is `format_difference`. Preserve both originals. Unsupported date formats remain uncertain.
6. **cross-script**: Bangla vs Latin name text is always `possible_variation`, review-level. We do not assert transliteration agreement or legal identity.
7. **name-variation**: honorific-only differences, identical sorted name tokens, or Jaro-Winkler ≥ 0.92 **and** Levenshtein ≤ 2 return `possible_variation`. Thresholds are explicit heuristics, not measured accuracy or legal claims. We do not strip “Md”/“Mohammed” as harmless formatting.
8. **unequal-values**: other confirmed values return `possible_discrepancy`. Severity `action_required` means verify the difference against source documents; it never means guaranteed rejection or that a legal record must be changed.

All identity fields (names, parent names, DOB, ID) and every low-confidence field must be confirmed before comparison. Missing fields must be acknowledged, not filled by inference. Only explicitly edited, confirmed values replace the value used for comparison; original evidence remains intact.

Findings link to this public rule page and carry document labels, original values, normalized values, page and evidence location. No government rule is associated unless the registry explicitly supports it; current `ruleId` is null. Official sources in the checklist are clearly separate from software comparison rules.

Checklist ordering: verify discrepancies and uncertainty first, then dependent gathering/source steps. Mandatory items can only originate in a verified, non-stale, matching-category registry rule. Unverified/stale/missing rules become “confirm manually”. Users cannot complete a dependent item until prerequisites are checked.
