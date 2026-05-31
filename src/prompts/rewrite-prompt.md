# un-AI-ing rewrite request

Turn this draft into the best next version of the document. Work in passes; do not return your first draft.

## Deliverable
- Return one clean revised draft, only after it passes the acceptance checklist in `skills/rewrite-verify` and the final cull pass in `skills/rewrite-cull`.
- Then a short change log: what you changed, how many revision passes you ran, and the final Flesch-Kincaid grade.
- Save the rewrite into `public/rewrites/` before your final response (format in `skills/rewrite-revise`).

## Hard constraints
- Preserve the draft's meaning, facts, numbers, technical terms, and uncertainty.
- Apply every reviewer mark in this packet: comments, manual highlights, style references, and scribbled deletions. These are the most important instructions here.
- Use style references for style only, never for facts.
- Do not invent claims, evidence, thresholds, citations, or examples. Accuracy beats elegance.
- Preserve the source document's HTML/CSS scaffold when source context is provided. Rewrite text inside the scaffold; do not rebuild a simpler document from the plain-text draft.

## How to run this (skills)
This project ships the rewrite pipeline as skills in `skills/`. Open each SKILL.md and run them in order; do not one-shot it.

1. `skills/rewrite-source-scaffold` — read the source URL, captured HTML, captured CSS, and current editor HTML. Decide which scaffold must be preserved.
2. `skills/rewrite-draft` — plan the brief and structure, then write draft v1 (applies the reviewer marks and the writing standard).
3. `skills/rewrite-verify` — score draft v1 against the acceptance checklist; return ALL PASS or REVISE.
4. `skills/rewrite-revise` — fix the failures, loop verify and revise until ALL PASS.
5. `skills/rewrite-cull` — run the final meaning-cull pass; delete any debatable sentence or phrase that does not add distinct meaning.
6. `skills/rewrite-verify` — verify the culled draft again. If it fails, return to `skills/rewrite-revise`, then cull again before saving.

Loop rewrite-verify and rewrite-revise until every checklist item passes. Then run rewrite-cull, verify once more, and only then save. Before saving, consult rewrite-source-scaffold again so the saved `html` preserves the source structure.

Writing standard: `skills/writing-principles` holds the 100 keys to good writing and the non-negotiable style guardrails. Hold the rewrite to that standard. (Claude Code: copy `skills/` into `.claude/skills/` for auto-discovery.)

## Document snapshot
Title: {{TITLE}}
Document id: {{DOC_ID}}
Words: {{WORD_COUNT}}
Flesch-Kincaid grade level: {{FK_GRADE}} (target: 10.0 or lower when possible; {{FK_TARGET}})
Open highlighted issues: {{ISSUE_COUNT}}
Reviewer comments: {{COMMENT_COUNT}}
Style references: {{REFERENCE_COUNT}}
Scribbled delete marks: {{DELETE_COUNT}}
Captured rewrite versions: {{VERSION_COUNT}}

## Source document context
{{SOURCE_CONTEXT}}

## Markup
- [FIX ...]text[/FIX] marks text highlighted by the app or reviewer. Use the source, issue, why, suggestion, and replacement attributes to fix that span in context.
- [DELETE: text] marks text the reviewer scribbled out. Remove it unless a nearby comment says to keep it.
- Remaining checker underlines were left for you to handle. Ignored checker marks are already gone.
- A mark's category (trim, clarify, support) is a hint at the main problem, not a limit on the edit. Fix whatever is actually wrong with the span; the result must read as a clear claim, not just a shorter one.

## Draft text with inline markup
{{DRAFT_MARKUP}}

## Reviewer notes

### Scribbled deletions
{{DELETE_LINES}}

### Highlighted issues summary
{{ISSUE_LINES}}

### Comments
{{COMMENT_LINES}}

### Style references
{{REFERENCE_LINES}}

### Saved rewrite feedback
{{VERSION_LINES}}
