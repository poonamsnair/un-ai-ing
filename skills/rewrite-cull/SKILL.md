---
name: rewrite-cull
description: Run the final meaning-cull pass on an un-AI-ing rewrite after verify/revise has produced a near-final draft. Use before saving. Removes sentences, phrases, transitions, and rhetorical claims that are present in the source but do not add distinct meaning.
---

# rewrite-cull

Use this after `rewrite-verify` and `rewrite-revise` have produced a near-final draft, but before saving or returning it.

The goal is not to polish. The goal is to delete weak material that survived because it was in the original draft.

## Cull rule

If a sentence, clause, phrase, transition, example, or rhetorical claim is **debatably useful** and does not add clear meaning, remove it.

Default to deletion when all three are true:

1. The line does not add a new fact, condition, consequence, definition, example, contrast, scope boundary, or reader action.
2. Removing it does not change the draft's meaning, facts, numbers, technical terms, uncertainty, or reviewer intent.
3. Its main job is tone, emphasis, throat-clearing, rhythm, confidence, or a broad claim the surrounding text already proves.

Example cull candidate:

> In Australian tax, confidence is the easy part.

This sounds punchy, but it does not explain what confidence means or add a fact. If the next sentence already says the real work is reading facts, applying the right income-year rule, and calculating, delete the confidence sentence.

## What to keep

Do not delete material that carries:

- A fact, number, threshold, date, citation, legal reference, technical term, or named source.
- A reviewer comment, highlighted fix, style-reference instruction, or scribbled deletion outcome.
- A scope boundary, limitation, uncertainty, caveat, safety warning, or non-endorsement.
- A necessary definition or example that helps a first-time reader follow the piece.
- A transition that prevents two adjacent paragraphs from becoming confusing.

## Steps

1. Read the near-final draft aloud.
2. Mark every sentence or phrase whose contribution is unclear.
3. For each marked item, ask: "What would the reader lose if this vanished?"
4. Delete it if the honest answer is "little", "nothing", "tone only", or "the surrounding text already says it better."
5. Smooth the join after deletion, but do not add new claims to replace what was cut.
6. Re-run `rewrite-verify` on the culled draft.
7. If verification fails, send the failures back through `rewrite-revise`, then run `rewrite-cull` again before saving.

## Output

When reporting the final change log, include:

- That the final cull pass ran.
- The main kind of material removed, such as rhetorical filler, duplicate setup, unsupported emphasis, or soft transition lines.
