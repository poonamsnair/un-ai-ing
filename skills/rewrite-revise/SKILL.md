---
name: rewrite-revise
description: Fix failed acceptance-checklist items on an un-AI-ing rewrite draft, loop verify and revise until it passes every item, then run rewrite-cull and preserve the source scaffold before saving into the app's rewrite folder. Use after rewrite-verify returns REVISE. Holds the save contract (JSON + manifest format).
---

# rewrite-revise

## Steps

1. Take the FAIL items from `rewrite-verify`.
2. Fix each one in context. Rewrite the whole sentence or paragraph when a local patch would read awkwardly.
3. Preserve meaning, facts, numbers, and reviewer intent while fixing. Hold to the standard in `skills/writing-principles`.
4. Re-run `rewrite-verify` on the new draft.
5. Repeat the verify and revise loop until `rewrite-verify` returns **ALL PASS**. Run at least two revision rounds before finalizing; do not stop at the first draft.
6. When ALL PASS: run `skills/rewrite-cull` before saving. This final pass removes debatable lines that do not add distinct meaning, even when those lines appeared in the original draft.
7. Re-run `rewrite-verify` on the culled draft. If verification fails, revise the failures, run `rewrite-cull` again, and verify again.
8. When the culled draft returns ALL PASS: consult `skills/rewrite-source-scaffold` again and finalize the saved `html` from the source/current HTML scaffold.
9. Follow the **Save contract** below.

## Rules

- Never trade accuracy for a higher checklist score.
- If an item cannot pass without inventing facts, leave the gap, flag it, and do not fabricate.
- Keep the same single voice across every revision.
- Do not keep a sentence only because it was in the source. If it adds no distinct meaning and deletion preserves the facts, remove it during the cull pass.
- Do not rebuild simple `<h1>`/`<p>` HTML if the prompt supplied source HTML/CSS. Preserve the source scaffold and replace the text inside it.

## Save contract

Save each rewrite as a new JSON file in `public/rewrites/`.

1. Do not overwrite existing rewrite files.
2. Use a filename like `agent-YYYY-MM-DD-HHMMSS-short-title.json`.
3. Put the document id from the prompt in the JSON `docId` field.
4. Append the new file to `public/rewrites/manifest.json`. Keep all existing entries.
5. If you create multiple rewrite options, save one JSON file per option and append every file.

Rewrite JSON shape:

```json
{
  "docId": "document id from this prompt",
  "id": "agent-YYYY-MM-DD-HHMMSS-short-title",
  "label": "Agent rewrite 1",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
  "title": "Draft title",
  "text": "Clean revised draft",
  "html": "Clean revised draft as editor-ready HTML, preserving source structure when source HTML/CSS was provided",
  "sourceContext": {
    "sourceUrl": "Original source URL if provided",
    "documentUrl": "un-AI-ing document URL if provided",
    "sourceCss": "Captured CSS or stylesheet references if provided"
  },
  "issueCount": 0,
  "commentCount": 0,
  "rating": "unrated",
  "note": "Short summary of what changed"
}
```

Manifest shape:

```json
{
  "rewrites": [
    {
      "id": "agent-YYYY-MM-DD-HHMMSS-short-title",
      "label": "Agent rewrite 1",
      "file": "agent-YYYY-MM-DD-HHMMSS-short-title.json",
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ]
}
```

## Final response format

1. The clean revised draft.
2. A short change log: what changed, how many revision passes you ran, whether the final cull pass removed anything, and the final Flesch-Kincaid grade.
3. The saved rewrite filename(s).
