import type { IssueCategory } from "../types";

interface IssueCategoryMeta {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  background: string;
  border: string;
}

export const ISSUE_CATEGORIES: Record<IssueCategory, IssueCategoryMeta> = {
  grammar: {
    label: "Fix grammar",
    shortLabel: "Grammar",
    description: "Fix spelling, punctuation, or grammar slips so the draft feels trustworthy.",
    color: "#52525b",
    background: "#f1f1f3",
    border: "#a1a1aa",
  },
  style_guide: {
    label: "Match style guide",
    shortLabel: "House style",
    description: "Bring wording into the paper's preferred style, terminology, and level of formality.",
    color: "#66500d",
    background: "#fff0b8",
    border: "#c8a94a",
  },
  ai_jargon: {
    label: "Replace AI words",
    shortLabel: "AI words",
    description: "Replace inflated or generic AI-sounding words with plainer, more precise language.",
    color: "#5f4708",
    background: "#fff2a6",
    border: "#d5aa24",
  },
  em_dash: {
    label: "Swap em dash",
    shortLabel: "Dash",
    description: "Reduce repeated em dashes so the punctuation feels intentional rather than model-like.",
    color: "#70400b",
    background: "#ffd6a8",
    border: "#d98738",
  },
  ai_sentence: {
    label: "Reshape AI sentence",
    shortLabel: "AI sentence",
    description: "Change assistant-like sentence patterns so the claim sounds natural and specific.",
    color: "#743042",
    background: "#ffd0dc",
    border: "#dc7891",
  },
  thinking_fix: {
    label: "Clarify the point",
    shortLabel: "Clarify",
    description: "Make the idea easier to follow when the passage sounds tidy but not fully thought through.",
    color: "#7a294b",
    background: "#ffe0ef",
    border: "#c96aa0",
  },
  meaning_drift: {
    label: "Fix meaning drift",
    shortLabel: "Meaning",
    description: "Catch edits that smooth the sentence shape but accidentally change the claim.",
    color: "#712f37",
    background: "#ffe1e6",
    border: "#dd7582",
  },
  brutal_cut: {
    label: "Cut filler",
    shortLabel: "Cut filler",
    description: "Remove unnecessary, generic, or distracting text so the useful point stands out.",
    color: "#7a2e17",
    background: "#ffe0d3",
    border: "#d4744e",
  },
  passive_voice: {
    label: "Strengthen verbs",
    shortLabel: "Verbs",
    description: "Prefer active verbs over prepositional phrases, and name the actor where the sentence loses force.",
    color: "#58417f",
    background: "#e6d5ff",
    border: "#aa87dc",
  },
  passive_check: {
    label: "Check passive voice",
    shortLabel: "Passive",
    description: "Underline passive-voice checks from the writing checker.",
    color: "#4f3a7a",
    background: "#efe7ff",
    border: "#8f6ed0",
  },
  overcomplex: {
    label: "Simplify sentence",
    shortLabel: "Simplify",
    description: "Split or reorder a long sentence so the main claim is easier to grasp.",
    color: "#265b70",
    background: "#c7edf8",
    border: "#61abc9",
  },
  over_explaining: {
    label: "Trim explanation",
    shortLabel: "Trim",
    description: "Cut explanation that repeats the point or slows the reader without adding substance.",
    color: "#25613b",
    background: "#c8f0d2",
    border: "#62bd7c",
  },
  under_explaining: {
    label: "Add support",
    shortLabel: "Support",
    description: "Add the missing evidence, example, or reasoning a compressed point needs.",
    color: "#4c5686",
    background: "#d9defb",
    border: "#7f8ad0",
  },
  technical_precision: {
    label: "Use precise term",
    shortLabel: "Precision",
    description: "Replace vague wording with the specific term, evidence, or requirement the paper needs.",
    color: "#71480f",
    background: "#ffe1b8",
    border: "#d69045",
  },
  other: {
    label: "Custom note",
    shortLabel: "Note",
    description: "Add a reviewer note that does not fit one of the standard highlight types.",
    color: "#333",
    background: "#eeeeee",
    border: "#9d9d9d",
  },
};
