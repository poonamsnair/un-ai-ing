import { Mark, mergeAttributes } from "@tiptap/core";

export const IssueMark = Mark.create({
  name: "issueMark",

  excludes: "",

  inclusive: false,

  addAttributes() {
    return {
      issueId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-issue-id"),
        renderHTML: (attributes) => (attributes.issueId ? { "data-issue-id": attributes.issueId } : {}),
      },
      category: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-category"),
        renderHTML: (attributes) => (attributes.category ? { "data-category": attributes.category } : {}),
      },
      origin: {
        default: "scanner",
        parseHTML: (element) => element.getAttribute("data-origin") ?? "scanner",
        renderHTML: (attributes) => ({ "data-origin": attributes.origin ?? "scanner" }),
      },
      severity: {
        default: "medium",
        parseHTML: (element) => element.getAttribute("data-severity") ?? "medium",
        renderHTML: (attributes) => ({ "data-severity": attributes.severity ?? "medium" }),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => (attributes.label ? { "data-label": attributes.label } : {}),
      },
      source: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-source"),
        renderHTML: (attributes) => (attributes.source ? { "data-source": attributes.source } : {}),
      },
      reason: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-reason"),
        renderHTML: (attributes) => (attributes.reason ? { "data-reason": attributes.reason } : {}),
      },
      suggestion: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion"),
        renderHTML: (attributes) => (attributes.suggestion ? { "data-suggestion": attributes.suggestion } : {}),
      },
      replacements: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-replacements"),
        renderHTML: (attributes) =>
          attributes.replacements ? { "data-replacements": String(attributes.replacements) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-issue-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const category = HTMLAttributes["data-category"] ?? HTMLAttributes.category ?? "ai_jargon";
    const severity = HTMLAttributes["data-severity"] ?? HTMLAttributes.severity ?? "medium";
    const label = HTMLAttributes["data-label"] ?? HTMLAttributes.label ?? "Writing issue";
    const source = HTMLAttributes["data-source"] ?? HTMLAttributes.source;
    const reason = HTMLAttributes["data-reason"] ?? HTMLAttributes.reason;
    const suggestion = HTMLAttributes["data-suggestion"] ?? HTMLAttributes.suggestion;
    const replacements = HTMLAttributes["data-replacements"] ?? HTMLAttributes.replacements;
    const tooltip = [
      source ? `${label} (${source})` : label,
      reason,
      suggestion ? `Fix: ${suggestion}` : null,
      replacements ? `Recommended edits: ${replacements}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `issue-mark issue-${category} issue-severity-${severity}`,
        ...(tooltip ? { "aria-label": tooltip } : {}),
      }),
      0,
    ];
  },
});
