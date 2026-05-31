# un-AI-ing rewrite skills

These skills implement the deliberate rewrite pipeline that the copied un-AI-ing prompt asks a coding/CLI agent to run. The goal is to stop the agent from shipping its first draft: it preserves the source document scaffold, plans, drafts, verifies against a fixed checklist, revises in a loop until the draft passes, then deletes weak material that survived only because it appeared in the source.

## Pipeline (run in order)

1. **[rewrite-source-scaffold](rewrite-source-scaffold/SKILL.md)** — read the source URL, captured HTML/CSS, and current editor HTML; decide which scaffold must be preserved.
2. **[rewrite-draft](rewrite-draft/SKILL.md)** — plan the brief and structure, then write draft v1.
3. **[rewrite-verify](rewrite-verify/SKILL.md)** — score the draft against the acceptance checklist; return ALL PASS or REVISE.
4. **[rewrite-revise](rewrite-revise/SKILL.md)** — fix the failures and loop verify ↔ revise until ALL PASS.
5. **[rewrite-cull](rewrite-cull/SKILL.md)** — run the final meaning-cull pass; delete any debatable line that does not add distinct meaning.
6. **[rewrite-verify](rewrite-verify/SKILL.md)** — verify the culled draft again. If it fails, revise, then cull again before saving.

Loop verify and revise until every checklist item passes (at least two revision rounds), run the cull pass, then verify again before saving. Consult `rewrite-source-scaffold` again before writing the final `html` field.

## Reference

- **[rewrite-source-scaffold](rewrite-source-scaffold/SKILL.md)** — the structure-preservation standard: use the source URL, captured source HTML/CSS, and current editor HTML as the scaffold for the saved rewrite instead of rebuilding simple HTML from the plain text.
- **[writing-principles](writing-principles/SKILL.md)** — the writing standard: 100 keys to good writing plus the non-negotiable style guardrails. `rewrite-draft` writes to it; `rewrite-verify` scores against it. This is where the bulk of the craft guidance lives, kept out of the copied prompt so the prompt stays a lean per-document packet.
- **[rewrite-cull](rewrite-cull/SKILL.md)** — the final deletion standard: if a line is only debatably useful and does not add meaning, remove it unless it carries facts, precision, scope, reviewer intent, or reader orientation.

## Using these with an agent

- **Any agent (Codex, Cursor, Claude Code, etc.):** the copied prompt names these files; the agent opens each `SKILL.md` and follows it.
- **Claude Code auto-discovery:** copy or symlink this folder into `.claude/skills/` so the skills load automatically:

  ```bash
  mkdir -p .claude/skills
  cp -R skills/rewrite-source-scaffold skills/rewrite-draft skills/rewrite-verify skills/rewrite-revise skills/rewrite-cull skills/writing-principles .claude/skills/
  ```

The skills are intentionally self-contained, so they work whether or not the agent loaded the full prompt.
