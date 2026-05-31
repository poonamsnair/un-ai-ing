import { Mark, mergeAttributes } from "@tiptap/core";

export const ReferenceMark = Mark.create({
  name: "referenceMark",

  inclusive: false,

  addAttributes() {
    return {
      referenceId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-reference-id"),
        renderHTML: (attributes) => (attributes.referenceId ? { "data-reference-id": attributes.referenceId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-reference-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "reference-mark",
      }),
      0,
    ];
  },
});
