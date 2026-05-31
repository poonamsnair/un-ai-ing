import { Mark, mergeAttributes } from "@tiptap/core";

export const CommentMark = Mark.create({
  name: "commentMark",

  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => (attributes.commentId ? { "data-comment-id": attributes.commentId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "comment-mark",
      }),
      0,
    ];
  },
});
