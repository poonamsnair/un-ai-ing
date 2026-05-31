---
name: rewrite-source-scaffold
description: Use the source document context in an un-AI-ing rewrite packet to preserve the original HTML/CSS scaffold when drafting and saving a rewrite. Run before rewrite-draft and consult again before saving.
---

# rewrite-source-scaffold

Use this when the rewrite packet includes a **Source document context** section.

The goal is to keep the document's original structure. Do not rebuild a plain article if the packet gives you HTML or CSS to preserve.

## What to read

Read the source context before drafting:

- Document URL: the app route for the reviewed document/version.
- Source URL: the original source URL if the imported HTML exposed one.
- Original source CSS / stylesheet references.
- Original source HTML scaffold.
- Current editor HTML scaffold.

Use the draft markup and reviewer notes for the words. Use the HTML/CSS scaffold for structure.

## Scaffold rule

When source HTML is available:

1. Preserve headings, heading levels, lists, list nesting, tables, code blocks, blockquotes, links, classes, inline styles, data attributes, and stylesheet references.
2. Replace text nodes with the revised text instead of generating a new simplified HTML document.
3. Keep structural tags in the same order unless the reviewer explicitly asked for a structural change.
4. If the current editor HTML differs from the original source HTML, use the current editor HTML as the live structure and use the original source HTML/CSS as style provenance.
5. Do not use source URLs or source HTML as new factual evidence. They are provenance and structure only unless the draft itself already contains the fact.

## Saving rule

When you save the rewrite JSON:

- Put the clean rewritten text in `text`.
- Put scaffold-preserving, editor-ready HTML in `html`.
- If the packet includes captured source CSS or full source HTML, keep those details in `sourceContext` if the app's JSON shape permits extra fields.
- Do not save only `<h1>`/`<p>` HTML when the packet provided a richer scaffold with lists, tables, classes, styles, or layout.

## Fallback

If no source HTML is available, build reasonable editor-ready HTML from the clean rewritten draft and say in the change log that no source scaffold was provided.
