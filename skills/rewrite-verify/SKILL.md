---
name: rewrite-verify
description: Score an un-AI-ing rewrite draft against the acceptance checklist and report pass or fail for every item, with the exact fix needed. Use after rewrite-draft, after every rewrite-revise pass, and once more after rewrite-cull. Returns a verdict of ALL PASS or REVISE.
---

# rewrite-verify

Act as a demanding outside editor, not the author. Read the draft aloud. Score it against every item below — each item operationalizes the standard in `skills/writing-principles` (the 100 keys); consult that skill when an item is borderline. For each item output PASS or FAIL; if FAIL, give the exact location and the fix.

## Acceptance checklist

- Meaning, facts, numbers, technical terms, and uncertainty are unchanged, unless a reviewer mark asked otherwise.
- Every reviewer comment, highlight, style reference, and scribbled deletion is addressed.
- Nothing is invented: no new claims, evidence, thresholds, citations, or examples.
- The opening starts near the useful tension; the ending completes the thought.
- The order of ideas is logical and each paragraph has one job.
- The saved HTML preserves the source/current HTML scaffold when one was provided; it does not flatten tables, lists, code blocks, classes, styles, or links into generic paragraphs.
- Actors and actions are visible; needless passives and zombie nouns are gone.
- Every sentence states its subject and says what is true, not mainly what is not. Flag lines that rely on an unstated who or what, or that define something by negation.
- Clutter, redundancy, hedges, and generic AI phrasing are cut.
- Debatable lines that do not add distinct meaning are removed, even if they appeared in the source draft.
- Claims are specific and supported; missing support is flagged, not faked.
- The voice is consistent and human, not interchangeable.
- Flesch-Kincaid grade is at or below 10 without flattening precise or technical prose.
- A first-time reader can follow the piece without re-reading.

## Output

1. A short table: `item -> PASS/FAIL -> fix (if FAIL)`.
2. The current Flesch-Kincaid grade of the draft.
3. A verdict: **ALL PASS** or **REVISE**.
4. If REVISE, hand the list of FAIL items to `rewrite-revise`.

## Rules

- Be strict. If you are unsure whether an item passes, treat it as FAIL and name what would make it pass.
- Never raise a score by changing facts or inventing support.
