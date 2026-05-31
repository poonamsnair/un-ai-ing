import { Extension } from "@tiptap/core";
import { Table as TableExtension, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { toggleMark } from "@tiptap/pm/commands";
import { redo, undo } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import gsap from "gsap";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Code2,
  Columns2,
  Copy,
  Download,
  Eraser,
  FilePenLine,
  FileText,
  GripHorizontal,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  MessageSquare,
  Minus,
  Paintbrush,
  Pilcrow,
  Plus,
  Quote,
  Rows3,
  Save,
  Table as TableIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CommentMark } from "./editor/CommentMark";
import { IssueMark } from "./editor/IssueMark";
import { ReferenceMark } from "./editor/ReferenceMark";
import { ISSUE_CATEGORIES } from "./lib/issueCategories";
import { calculateFleschKincaidGrade, formatFleschKincaidGrade } from "./lib/readability";
import { SAMPLE_DOCUMENT_HTML, SAMPLE_TITLE } from "./lib/sampleDocument";
import rewritePromptTemplate from "./prompts/rewrite-prompt.md?raw";
import type {
  CommentThread,
  Issue,
  IssueCategory,
  IssueSeverity,
  SessionPayload,
  SourceDocumentContext,
  StyleReference,
} from "./types";

interface TextSegment {
  start: number;
  end: number;
  from: number;
}

interface DraftMarkup {
  text: string;
  deletes: string[];
}

type IssueFixMarkup = Pick<Issue, "label" | "reason" | "suggestion"> & {
  source?: string;
  replacements?: string[];
};

interface SelectionSnapshot {
  from: number;
  to: number;
  text: string;
  key: string;
}

interface IssueHoverHint {
  issueIds: string[];
  label: string;
  detail: string;
  x: number;
  y: number;
}

interface EraserDrag {
  anchor: number;
  head: number;
}

interface EraserMarkCollection {
  issueIds: Set<string>;
  commentIds: Set<string>;
  referenceIds: Set<string>;
  strikeRanges: Array<{ from: number; to: number }>;
  underlineRanges: Array<{ from: number; to: number }>;
}

type ToolDock = "top" | "bottom";
type ReviewTool = "comment" | "reference" | null;

type SavedSession = SessionPayload & {
  manualIssues?: Issue[];
  ignoredIssueIds?: string[];
  hiddenFolderRewriteKeys?: string[];
  rewriteVersions?: RewriteVersion[];
  styleReferences?: StyleReference[];
  marginNoteLayout?: Record<string, MarginNoteLayout>;
};

type SavedDocument = SavedSession & {
  id: string;
  createdAt: string;
};

interface SavedWorkspace {
  activeDocumentId?: string;
  documents?: SavedDocument[];
  updatedAt?: string;
}

type RewriteRating = "unrated" | "better" | "worse" | "same";

interface RewriteVersion {
  id: string;
  label: string;
  createdAt: string;
  text: string;
  html: string;
  issueCount: number;
  commentCount: number;
  rating: RewriteRating;
  note: string;
  source?: "local" | "folder";
  file?: string;
  documentId?: string;
  documentTitle?: string;
}

interface RewriteManifestEntry {
  id?: string;
  label?: string;
  file: string;
  createdAt?: string;
}

interface RewriteManifest {
  rewrites?: RewriteManifestEntry[];
}

interface AgentReviewManifestEntry {
  id?: string;
  label?: string;
  file: string;
  createdAt?: string;
  docId?: string;
  title?: string;
}

interface AgentReviewManifest {
  reviews?: AgentReviewManifestEntry[];
}

interface AgentReviewTextTarget {
  selectedText?: string;
  text?: string;
  start?: number;
  end?: number;
  occurrence?: number;
}

interface AgentReviewIssuePayload extends AgentReviewTextTarget {
  id?: string;
  category?: IssueCategory;
  severity?: IssueSeverity;
  reason?: string;
  suggestion?: string;
}

interface AgentReviewCommentPayload extends AgentReviewTextTarget {
  id?: string;
  body?: string;
}

interface AgentReviewStyleReferencePayload extends AgentReviewTextTarget {
  id?: string;
  referenceText?: string;
}

interface AgentReviewPayload {
  docId?: string;
  id?: string;
  label?: string;
  createdAt?: string;
  title?: string;
  note?: string;
  documentHtml?: string;
  html?: string;
  plainText?: string;
  text?: string;
  issues?: AgentReviewIssuePayload[];
  comments?: AgentReviewCommentPayload[];
  styleReferences?: AgentReviewStyleReferencePayload[];
}

type LoadedAgentReview = AgentReviewPayload & {
  file: string;
  createdAt: string;
};

interface FolderRewritePayload {
  docId?: string;
  id?: string;
  label?: string;
  createdAt?: string;
  title?: string;
  text?: string;
  plainText?: string;
  html?: string;
  documentHtml?: string;
  sourceContext?: SourceDocumentContext;
  sourceHtml?: string;
  sourceCss?: string;
  sourceUrl?: string;
  issueCount?: number;
  commentCount?: number;
  rating?: RewriteRating;
  note?: string;
}

interface DiffToken {
  text: string;
  type: "same" | "added" | "removed";
}

interface SideBySideDiff {
  before: DiffToken[];
  after: DiffToken[];
  added: number;
  removed: number;
}

interface CompareVersion {
  id: string;
  label: string;
  text: string;
}

interface TableControlsPosition {
  left: number;
  top: number;
}

type MarginNoteSide = "left" | "right";

interface MarginNoteLayout {
  side: MarginNoteSide;
  top: number;
  left?: number;
  offset?: number;
  size?: number;
  userMoved?: boolean;
  anchorX?: number;
  anchorY?: number;
  targetLeft?: number;
  targetRight?: number;
  targetTop?: number;
  targetBottom?: number;
  targetRects?: Array<{ left: number; right: number; top: number; bottom: number }>;
}

interface MarginNoteDrag {
  kind: "comment" | "reference";
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  startTop: number;
  startLeft: number;
  cardWidth: number;
  cardHeight: number;
  moved: boolean;
}

const categoryOrder = Object.keys(ISSUE_CATEGORIES) as IssueCategory[];
const manualIssueCategoryOrder = categoryOrder.filter((category) => category !== "passive_check");
const underlineOnlyCategories = new Set<IssueCategory>(["passive_check"]);
const minMarginNoteSize = 0.8;
const maxMarginNoteSize = 1.35;
const marginNoteSizeStep = 0.15;
const defaultMarginNoteSize = 1;
const marginNoteBaseWidth = 142;
const marginNoteBaseHeight = 92;
const marginNoteBaseArrowWidth = 68;
const marginNoteInset = 18;

const fontSizeOptions = [
  { label: "Default size", value: "" },
  { label: "Small", value: "22px" },
  { label: "Normal", value: "28px" },
  { label: "Large", value: "34px" },
  { label: "Extra large", value: "42px" },
];

const blockStyleOptions = [
  { label: "Paragraph", value: "paragraph" },
  { label: "Heading 1", value: "heading-1" },
  { label: "Heading 2", value: "heading-2" },
  { label: "Heading 3", value: "heading-3" },
  { label: "Block quote", value: "blockquote" },
  { label: "Code block", value: "codeBlock" },
];

const issueSeverityRank = {
  high: 0,
  medium: 1,
  low: 2,
};

const allIssuesTip = "Shows every open mark in the document, including highlights, underlines, and manual notes.";
const checkerSources = new Set(["LanguageTool", "retext-passive", "Vale"]);
const isCheckerIssue = (issue: Issue | null) => Boolean(issue?.source && checkerSources.has(issue.source));
type IssueMarkerKind = "highlight" | "underline" | "mixed";

const storageKey = "un-ai-ing-workspace-v1";
const legacyStorageKey = "un-ai-ing-session-v3";
const rewriteManifestPath = "/rewrites/manifest.json";
const agentReviewManifestPath = "/agent-reviews/manifest.json";
interface WorkspaceRoute {
  docId: string;
  versionId: string;
}

const currentVersionId = "current";

const readWorkspaceRouteFromUrl = (): WorkspaceRoute => {
  const params = new URLSearchParams(window.location.search);
  return {
    docId: params.get("doc")?.trim() ?? "",
    versionId: params.get("version")?.trim() || currentVersionId,
  };
};

const createWorkspaceRouteUrl = (docId: string, versionId: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("doc", docId);
  url.searchParams.set("version", versionId || currentVersionId);
  return url;
};

const writeWorkspaceRouteToUrl = (docId: string, versionId: string) => {
  if (!docId) {
    return;
  }

  const url = createWorkspaceRouteUrl(docId, versionId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
};

const uploadAccept = [
  ".doc",
  ".docx",
  ".pdf",
  ".txt",
  ".md",
  ".html",
  ".htm",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
].join(",");
const supportedUploadExtensions = new Set(["doc", "docx", "pdf", "txt", "md", "html", "htm"]);

function parseHtmlDocument(html: string) {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return null;
  }

  return new DOMParser().parseFromString(html, "text/html");
}

function extractSourceUrlFromHtml(html: string) {
  const sourceDocument = parseHtmlDocument(html);
  if (!sourceDocument) {
    return "";
  }

  const canonical = sourceDocument.querySelector('link[rel~="canonical"]')?.getAttribute("href")?.trim();
  const ogUrl = sourceDocument.querySelector('meta[property="og:url"]')?.getAttribute("content")?.trim();
  const baseHref = sourceDocument.querySelector("base[href]")?.getAttribute("href")?.trim();
  return canonical || ogUrl || baseHref || "";
}

function extractOriginalCssFromHtml(html: string) {
  if (!/<(?:style|link)\b/i.test(html)) {
    return "";
  }

  const sourceDocument = parseHtmlDocument(html);
  if (!sourceDocument) {
    return "";
  }

  const stylesheetLinks = Array.from(sourceDocument.querySelectorAll('link[rel~="stylesheet"]'))
    .map((link) => link.outerHTML.trim())
    .filter(Boolean);
  const styleBlocks = Array.from(sourceDocument.querySelectorAll("style"))
    .map((style, index) => {
      const css = style.textContent?.trim() ?? "";
      return css ? `/* source style ${index + 1} */\n${css}` : "";
    })
    .filter(Boolean);

  return [...stylesheetLinks, ...styleBlocks].join("\n\n");
}

function createSourceContextFromHtml(
  kind: SourceDocumentContext["kind"],
  name: string,
  html: string,
  overrides: Partial<SourceDocumentContext> = {},
): SourceDocumentContext {
  return {
    kind,
    name,
    originalHtml: html,
    originalCss: extractOriginalCssFromHtml(html),
    sourceUrl: extractSourceUrlFromHtml(html) || undefined,
    ...overrides,
  };
}

const nowIso = () => new Date().toISOString();

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const blankDocumentHtml = "<h1>Untitled draft</h1><p></p>";

const normalizeDocumentTitle = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const slugifyDocumentKey = (value: string) =>
  value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "untitled";

const documentMatchesIdentity = (
  document: Pick<SavedDocument, "id" | "title">,
  identity: { docId?: string; title?: string },
) => {
  if (identity.docId && document.id === identity.docId) {
    return true;
  }

  if (identity.title && normalizeDocumentTitle(document.title) === normalizeDocumentTitle(identity.title)) {
    return true;
  }

  return false;
};

const rewriteBelongsToDocument = (version: RewriteVersion, document: Pick<SavedDocument, "id" | "title">) => {
  if (version.documentId && version.documentId === document.id) {
    return true;
  }

  if (version.documentTitle) {
    return normalizeDocumentTitle(version.documentTitle) === normalizeDocumentTitle(document.title);
  }

  return false;
};

const agentReviewBelongsToDocument = (review: AgentReviewPayload, document: Pick<SavedDocument, "id" | "title">) =>
  documentMatchesIdentity(document, { docId: review.docId, title: review.title });

const createSavedDocument = (overrides: Partial<SavedDocument> = {}): SavedDocument => {
  const createdAt = overrides.createdAt ?? nowIso();
  const documentHtml = overrides.documentHtml ?? SAMPLE_DOCUMENT_HTML;
  const fallbackSourceContext = createSourceContextFromHtml(
    documentHtml === blankDocumentHtml ? "blank" : "sample",
    overrides.title?.trim() || SAMPLE_TITLE,
    documentHtml,
  );

  return {
    id: overrides.id ?? createId("doc"),
    title: overrides.title?.trim() || SAMPLE_TITLE,
    documentHtml,
    plainText: overrides.plainText ?? htmlToText(documentHtml),
    sourceContext: overrides.sourceContext ?? fallbackSourceContext,
    issues: overrides.issues ?? [],
    comments: overrides.comments ?? [],
    styleReferences: overrides.styleReferences ?? [],
    manualIssues: overrides.manualIssues ?? [],
    ignoredIssueIds: overrides.ignoredIssueIds ?? [],
    hiddenFolderRewriteKeys: overrides.hiddenFolderRewriteKeys ?? [],
    rewriteVersions: overrides.rewriteVersions ?? [],
    marginNoteLayout: overrides.marginNoteLayout ?? {},
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
  };
};

const createBlankSavedDocument = () =>
  createSavedDocument({
    title: "Untitled draft",
    documentHtml: blankDocumentHtml,
    plainText: "Untitled draft",
    sourceContext: createSourceContextFromHtml("blank", "Untitled draft", blankDocumentHtml),
  });

const normalizeSelectionText = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const stripRepeatedSelectedTextFromComment = (body: string, selectedText: string) => {
  const trimmedBody = body.trim();
  const trimmedSelectedText = selectedText.trim();

  if (!trimmedBody || !trimmedSelectedText) {
    return trimmedBody;
  }

  const selectedTextPattern = trimmedSelectedText
    .split(/\s+/)
    .map((word) => escapeRegExp(word))
    .join("\\s+");
  const repeatedSelectedTextPattern = new RegExp(
    `^[\\s"'“”‘’*_]*(?:selected text|text|span)?\\s*:?\\s*[\\s"'“”‘’*_]*${selectedTextPattern}[\\s"'“”‘’*_]*[:;,.\\-–—]*\\s*`,
    "i",
  );
  const strippedBody = trimmedBody.replace(repeatedSelectedTextPattern, "").trim();

  return strippedBody === trimmedBody ? trimmedBody : strippedBody;
};

const createSelectionKey = (from: number, to: number, value: string) => `${from}:${to}:${normalizeSelectionText(value)}`;

const getIssueIgnoreKey = (issue: Issue) =>
  [
    issue.source ?? "un-AI-ing",
    issue.ruleId ?? issue.category,
    normalizeSelectionText(issue.text),
    normalizeSelectionText(issue.reason),
  ].join("::");

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const clampMarginNoteSize = (value: number) => clamp(value, minMarginNoteSize, maxMarginNoteSize);

const WritingKeyboardShortcuts = Extension.create({
  name: "writingKeyboardShortcuts",

  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.editor.commands.undo(),
      "Mod-y": () => this.editor.commands.redo(),
      "Shift-Mod-z": () => this.editor.commands.redo(),
      "Mod-Shift-z": () => this.editor.commands.redo(),
      "Mod-b": () => this.editor.commands.toggleBold(),
      "Mod-i": () => this.editor.commands.toggleItalic(),
      "Mod-u": () => this.editor.commands.toggleUnderline(),
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
      "Shift-Mod-x": () => this.editor.commands.toggleStrike(),
    };
  },
});

const runMarkShortcut = (view: EditorView, markName: "bold" | "italic" | "underline" | "strike") => {
  const markType = view.state.schema.marks[markName];
  return markType ? toggleMark(markType)(view.state, view.dispatch, view) : false;
};

const handleEditorKeyboardCommand = (view: EditorView, event: KeyboardEvent) => {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (!mod || event.altKey) {
    return false;
  }

  const run = (command: () => boolean) => {
    event.preventDefault();
    command();
    return true;
  };

  if (key === "z" && !event.shiftKey) {
    return run(() => undo(view.state, view.dispatch, view));
  }

  if ((key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey)) {
    return run(() => redo(view.state, view.dispatch, view));
  }

  if (key === "b" && !event.shiftKey) {
    return run(() => runMarkShortcut(view, "bold"));
  }

  if (key === "i" && !event.shiftKey) {
    return run(() => runMarkShortcut(view, "italic"));
  }

  if (key === "u" && !event.shiftKey) {
    return run(() => runMarkShortcut(view, "underline"));
  }

  if (key === "x" && event.shiftKey) {
    return run(() => runMarkShortcut(view, "strike"));
  }

  return false;
};

const findMatchingAnnotation = <T extends { selectedText: string; selectionKey?: string }>(
  annotations: T[],
  selectedText: string,
  selectionKey: string,
) => {
  const textKey = normalizeSelectionText(selectedText);
  return annotations.find((annotation) =>
    annotation.selectionKey && selectionKey
      ? annotation.selectionKey === selectionKey
      : normalizeSelectionText(annotation.selectedText) === textKey,
  );
};

const createSnapshot = (editor: Editor, from: number, to: number): SelectionSnapshot | null => {
  if (from === to) {
    return null;
  }

  const text = editor.state.doc.textBetween(from, to, " ").trim();
  if (!text) {
    return null;
  }

  return {
    from,
    to,
    text,
    key: createSelectionKey(from, to, text),
  };
};

const getEditorSelectionSnapshot = (editor: Editor) => {
  const { from, to } = editor.state.selection;
  return createSnapshot(editor, from, to);
};

function getDragRange(view: EditorView, drag: EraserDrag) {
  const docMax = view.state.doc.content.size;
  const from = Math.max(0, Math.min(drag.anchor, drag.head, docMax));
  const to = Math.max(0, Math.min(Math.max(drag.anchor, drag.head), docMax));

  return from === to ? { from, to: Math.min(from + 1, docMax) } : { from, to };
}

function collectAnnotationIdsInRange(view: EditorView, drag: EraserDrag) {
  const { from, to } = getDragRange(view, drag);
  const issueIds = new Set<string>();
  const commentIds = new Set<string>();
  const referenceIds = new Set<string>();
  const strikeRanges: EraserMarkCollection["strikeRanges"] = [];
  const underlineRanges: EraserMarkCollection["underlineRanges"] = [];

  if (from >= to) {
    return { issueIds, commentIds, referenceIds, strikeRanges, underlineRanges };
  }

  view.state.doc.nodesBetween(from, to, (node, position) => {
    if (!node.isText) {
      return;
    }

    for (const mark of node.marks) {
      if (mark.type.name === "issueMark" && typeof mark.attrs.issueId === "string") {
        issueIds.add(mark.attrs.issueId);
      }

      if (mark.type.name === "commentMark" && typeof mark.attrs.commentId === "string") {
        commentIds.add(mark.attrs.commentId);
      }

      if (mark.type.name === "referenceMark" && typeof mark.attrs.referenceId === "string") {
        referenceIds.add(mark.attrs.referenceId);
      }

      if (mark.type.name === "strike") {
        strikeRanges.push({ from: position, to: position + node.nodeSize });
      }

      if (mark.type.name === "underline") {
        underlineRanges.push({ from: position, to: position + node.nodeSize });
      }
    }
  });

  return { issueIds, commentIds, referenceIds, strikeRanges, underlineRanges };
}

function removeAnnotationMarksByIds(
  view: EditorView,
  ids: EraserMarkCollection,
) {
  const tr = view.state.tr;
  const issueMark = view.state.schema.marks.issueMark;
  const commentMark = view.state.schema.marks.commentMark;
  const referenceMark = view.state.schema.marks.referenceMark;
  const strikeMark = view.state.schema.marks.strike;
  const underlineMark = view.state.schema.marks.underline;

  view.state.doc.descendants((node, position) => {
    if (!node.isText) {
      return;
    }

    for (const mark of node.marks) {
      if (mark.type === issueMark && ids.issueIds.has(mark.attrs.issueId)) {
        tr.removeMark(position, position + node.nodeSize, mark);
      }

      if (mark.type === commentMark && ids.commentIds.has(mark.attrs.commentId)) {
        tr.removeMark(position, position + node.nodeSize, mark);
      }

      if (mark.type === referenceMark && ids.referenceIds.has(mark.attrs.referenceId)) {
        tr.removeMark(position, position + node.nodeSize, mark);
      }
    }
  });

  if (strikeMark) {
    for (const range of ids.strikeRanges) {
      tr.removeMark(range.from, range.to, strikeMark);
    }
  }

  if (underlineMark) {
    for (const range of ids.underlineRanges) {
      tr.removeMark(range.from, range.to, underlineMark);
    }
  }

  if (tr.docChanged) {
    view.dispatch(tr);
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const textToHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

const isPdfTextItem = (item: unknown): item is { str: string; hasEOL?: boolean } =>
  typeof item === "object" && item !== null && "str" in item && typeof (item as { str?: unknown }).str === "string";

async function extractPdfText(file: File) {
  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorkerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let pageText = "";

      for (const item of textContent.items) {
        if (!isPdfTextItem(item)) {
          continue;
        }

        pageText += item.str;
        pageText += item.hasEOL ? "\n" : " ";
      }

      const cleanPageText = pageText
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      if (cleanPageText) {
        pages.push(cleanPageText);
      }
    }
  } finally {
    if ("destroy" in loadingTask && typeof loadingTask.destroy === "function") {
      await loadingTask.destroy();
    }
  }

  const text = pages.join("\n\n").trim();

  if (!text) {
    throw new Error("This PDF does not contain readable text. It may be a scanned image.");
  }

  return text;
}

function extractLegacyDocText(fileBuffer: ArrayBuffer) {
  const candidates = ["utf-16le", "windows-1252"]
    .map((encoding) => new TextDecoder(encoding).decode(fileBuffer))
    .map((text) =>
      text
        .replace(/[^\p{L}\p{N}\p{P}\p{Sc}\p{Zs}\n\r\t]/gu, "\n")
        .replace(/[ \t]+/g, " ")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => {
          const letters = line.match(/\p{L}/gu)?.length ?? 0;
          const words = line.match(/\p{L}{2,}/gu)?.length ?? 0;
          return line.length >= 8 && words >= 2 && letters / line.length > 0.35;
        })
        .join("\n\n"),
    );

  const best = candidates.reduce((currentBest, candidate) =>
    (candidate.match(/\p{L}{2,}/gu)?.length ?? 0) > (currentBest.match(/\p{L}{2,}/gu)?.length ?? 0)
      ? candidate
      : currentBest,
  "");

  if (!best.trim()) {
    throw new Error("This older Word file could not be read. Try saving it as .docx and uploading it again.");
  }

  return best.trim();
}

async function getUploadHtml(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!supportedUploadExtensions.has(extension)) {
    throw new Error("un-AI-ing can import Word, PDF, text, Markdown, and HTML files.");
  }

  if (extension === "pdf") {
    return textToHtml(await extractPdfText(file));
  }

  if (extension === "docx") {
    const { default: mammoth } = await import("mammoth/mammoth.browser");
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  if (extension === "doc") {
    return textToHtml(extractLegacyDocText(await file.arrayBuffer()));
  }

  if (extension === "html" || extension === "htm") {
    return file.text();
  }

  return textToHtml(await file.text());
}

const isRewriteRating = (value: unknown): value is RewriteRating =>
  value === "unrated" || value === "better" || value === "worse" || value === "same";

const sortRewriteVersions = (versions: RewriteVersion[]) =>
  [...versions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

const getRewriteVersionKey = (version: RewriteVersion) =>
  version.file ? `file:${version.file}` : `${version.source ?? "local"}:${version.id}`;

const mergeRewriteVersions = (existing: RewriteVersion[], incoming: RewriteVersion[]) => {
  const byKey = new Map<string, RewriteVersion>();

  for (const version of existing) {
    byKey.set(getRewriteVersionKey(version), version);
  }

  for (const version of incoming) {
    byKey.set(getRewriteVersionKey(version), version);
  }

  return sortRewriteVersions(Array.from(byKey.values()));
};

const htmlToText = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  const blockText = Array.from(container.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, th, td"))
    .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  return blockText || container.textContent?.replace(/\s+/g, " ").trim() || "";
};

const normaliseFolderRewrite = (
  entry: RewriteManifestEntry,
  payload: FolderRewritePayload,
): RewriteVersion | null => {
  const html = payload.html ?? payload.documentHtml ?? payload.sourceHtml ?? "";
  const text = payload.text ?? payload.plainText ?? (html ? htmlToText(html) : "");

  if (!text.trim() && !html.trim()) {
    return null;
  }

  const fileKey = entry.file.replace(/[^a-z0-9_.-]/gi, "-");
  const createdAt = payload.createdAt ?? entry.createdAt ?? nowIso();

  return {
    id: payload.id ?? entry.id ?? `folder-${fileKey}`,
    label: payload.label ?? entry.label ?? payload.title ?? fileKey.replace(/\.json$/i, ""),
    createdAt,
    text,
    html: html || textToHtml(text),
    issueCount: payload.issueCount ?? 0,
    commentCount: payload.commentCount ?? 0,
    rating: isRewriteRating(payload.rating) ? payload.rating : "unrated",
    note: payload.note ?? "Saved by an agent into the rewrite folder.",
    source: "folder",
    file: entry.file,
    documentId: payload.docId,
    documentTitle: payload.title,
  };
};

const getAgentReviewDocumentHtml = (review: AgentReviewPayload) => {
  const html = review.documentHtml ?? review.html ?? "";
  const text = review.plainText ?? review.text ?? "";

  if (html.trim()) {
    return html;
  }

  return text.trim() ? textToHtml(text) : "";
};

const getAgentReviewDocumentText = (review: AgentReviewPayload) => {
  const text = review.plainText ?? review.text ?? "";
  const html = review.documentHtml ?? review.html ?? "";

  if (text.trim()) {
    return text;
  }

  return html.trim() ? htmlToText(html) : "";
};

const getDocumentStructureScore = (html: string) =>
  (html.match(/<(?:h[1-6]|p|ul|ol|li|pre|blockquote|table|tr|td|th)\b/gi) ?? []).length;

const isStructuredEnoughToReplaceDraft = (reviewHtml: string, fallbackHtml = "") => {
  const reviewScore = getDocumentStructureScore(reviewHtml);
  const fallbackScore = getDocumentStructureScore(fallbackHtml);

  if (!reviewHtml.trim()) {
    return false;
  }

  return fallbackScore ? reviewScore >= Math.max(6, fallbackScore * 0.6) : reviewScore >= 4;
};

const createPlaceholderDocumentHtml = (title: string, fileLabel: string) =>
  `<h1>${escapeHtml(title)}</h1><p>This document was found in the project folder, but ${escapeHtml(
    fileLabel,
  )} does not include the draft text yet.</p>`;

const createFolderDocuments = (folderRewriteVersions: RewriteVersion[], folderAgentReviews: LoadedAgentReview[]) => {
  const groups = new Map<
    string,
    {
      docId?: string;
      title: string;
      rewrites: RewriteVersion[];
      reviews: LoadedAgentReview[];
    }
  >();

  const ensureGroup = (identity: { docId?: string; title?: string; fallback: string }) => {
    const cleanTitle = identity.title?.trim() || identity.fallback;
    const key = identity.docId ? `id:${identity.docId}` : `title:${normalizeDocumentTitle(cleanTitle)}`;
    const existing = groups.get(key);

    if (existing) {
      if (!existing.docId && identity.docId) {
        existing.docId = identity.docId;
      }
      if (!existing.title && cleanTitle) {
        existing.title = cleanTitle;
      }
      return existing;
    }

    const group = {
      docId: identity.docId,
      title: cleanTitle,
      rewrites: [] as RewriteVersion[],
      reviews: [] as LoadedAgentReview[],
    };
    groups.set(key, group);
    return group;
  };

  for (const version of folderRewriteVersions) {
    const fallback = version.label || version.file || "Folder draft";
    ensureGroup({ docId: version.documentId, title: version.documentTitle, fallback }).rewrites.push(version);
  }

  for (const review of folderAgentReviews) {
    const fallback = review.label || review.id || review.file || "Folder review";
    ensureGroup({ docId: review.docId, title: review.title, fallback }).reviews.push(review);
  }

  return Array.from(groups.values()).map((group) => {
    const sortedReviews = [...group.reviews].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const reviewWithDocument = sortedReviews.find((review) => getAgentReviewDocumentHtml(review).trim());
    const sortedRewrites = sortRewriteVersions(group.rewrites);
    const baseRewrite = sortedRewrites[0];
    const title = group.title || reviewWithDocument?.title || baseRewrite?.documentTitle || "Folder draft";
    const reviewHtml = reviewWithDocument ? getAgentReviewDocumentHtml(reviewWithDocument) : "";
    const shouldUseReviewDocument = isStructuredEnoughToReplaceDraft(reviewHtml, baseRewrite?.html);
    const documentHtml =
      (shouldUseReviewDocument ? reviewHtml : "") ||
      baseRewrite?.html ||
      createPlaceholderDocumentHtml(title, sortedReviews[0]?.file || baseRewrite?.file || "the saved file");
    const plainText = shouldUseReviewDocument && reviewWithDocument
      ? getAgentReviewDocumentText(reviewWithDocument)
      : baseRewrite?.text || htmlToText(documentHtml);

    return createSavedDocument({
      id: group.docId || `folder-doc-${slugifyDocumentKey(title)}`,
      title,
      documentHtml,
      plainText,
    });
  });
};

const tokeniseForDiff = (value: string) => value.match(/\S+\s*/g) ?? [];

function buildSideBySideDiff(beforeText: string, afterText: string): SideBySideDiff {
  const beforeTokens = tokeniseForDiff(beforeText);
  const afterTokens = tokeniseForDiff(afterText);
  const lcs = Array.from({ length: beforeTokens.length + 1 }, () => new Uint32Array(afterTokens.length + 1));

  for (let beforeIndex = beforeTokens.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterTokens.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeTokens[beforeIndex] === afterTokens[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1]);
    }
  }

  const before: DiffToken[] = [];
  const after: DiffToken[] = [];
  let added = 0;
  let removed = 0;
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeTokens.length || afterIndex < afterTokens.length) {
    if (beforeTokens[beforeIndex] === afterTokens[afterIndex]) {
      before.push({ text: beforeTokens[beforeIndex], type: "same" });
      after.push({ text: afterTokens[afterIndex], type: "same" });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      afterIndex < afterTokens.length &&
      (beforeIndex === beforeTokens.length ||
        lcs[beforeIndex][afterIndex + 1] >= lcs[beforeIndex + 1][afterIndex])
    ) {
      after.push({ text: afterTokens[afterIndex], type: "added" });
      added += 1;
      afterIndex += 1;
    } else if (beforeIndex < beforeTokens.length) {
      before.push({ text: beforeTokens[beforeIndex], type: "removed" });
      removed += 1;
      beforeIndex += 1;
    }
  }

  return { before, after, added, removed };
}

function getTextMap(editor: Editor) {
  const segments: TextSegment[] = [];
  let text = "";

  editor.state.doc.descendants((node, position) => {
    if (node.isBlock && node.type.name !== "doc" && text.length > 0) {
      text += "\n";
    }

    if (node.isText && node.text) {
      const start = text.length;
      text += node.text;
      segments.push({
        start,
        end: text.length,
        from: position,
      });
    }
  });

  return { text, segments };
}

const cleanInlineMarkupValue = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/\]/g, ")")
    .trim();

const uniqueInlineValues = (values: string[]) => Array.from(new Set(values.map(cleanInlineMarkupValue).filter(Boolean)));

const getIssueFixTag = (issues: IssueFixMarkup | IssueFixMarkup[]) => {
  const issueList = Array.isArray(issues) ? issues : [issues];
  const source =
    issueList.length === 1
      ? cleanInlineMarkupValue(issueList[0].source ?? "un-AI-ing")
      : uniqueInlineValues(issueList.map((issue) => issue.source ?? "un-AI-ing")).join(" | ");
  const label = uniqueInlineValues(
    issueList.map((issue) => `${issue.label}${issue.source ? ` (${issue.source})` : ""}`),
  ).join(" | ");
  const reason = uniqueInlineValues(issueList.map((issue) => issue.reason)).join(" | ");
  const suggestion = uniqueInlineValues(issueList.map((issue) => issue.suggestion)).join(" | ");
  const replacements = uniqueInlineValues(issueList.flatMap((issue) => issue.replacements ?? []));

  return `[FIX source="${source}" issue="${label}" why="${reason}" suggestion="${suggestion}"${
    replacements.length ? ` replacements="${replacements.join(" | ")}"` : ""
  }]`;
};

const stringFromMarkAttr = (value: unknown) => (typeof value === "string" ? value : "");

const getIssueFixMarkupFromMarkAttrs = (attrs: Record<string, unknown>): IssueFixMarkup | null => {
  const label = stringFromMarkAttr(attrs.label);
  const reason = stringFromMarkAttr(attrs.reason);
  const suggestion = stringFromMarkAttr(attrs.suggestion);

  if (!label || !reason || !suggestion) {
    return null;
  }

  const replacementsValue = stringFromMarkAttr(attrs.replacements);
  const replacements = replacementsValue
    ? replacementsValue
        .split(" | ")
        .map((replacement) => replacement.trim())
        .filter(Boolean)
    : undefined;

  return {
    label,
    reason,
    suggestion,
    source: stringFromMarkAttr(attrs.source) || "un-AI-ing",
    replacements,
  };
};

function getDraftWithInlineMarkup(editor: Editor, issueById: Map<string, Issue>): DraftMarkup {
  const deletes: string[] = [];
  let text = "";

  editor.state.doc.descendants((node) => {
    if (node.isBlock && node.type.name !== "doc" && text.length > 0) {
      text += "\n";
    }

    if (!node.isText || !node.text) {
      return;
    }

    const isScribbledDelete = node.marks.some((mark) => mark.type.name === "strike");
    const issueMarks = node.marks.filter((mark) => mark.type.name === "issueMark" && typeof mark.attrs.issueId === "string");
    let nodeText = node.text;

    const issueFixes = issueMarks
      .map((mark) => issueById.get(mark.attrs.issueId) ?? getIssueFixMarkupFromMarkAttrs(mark.attrs as Record<string, unknown>))
      .filter((issue): issue is IssueFixMarkup => Boolean(issue));

    if (issueFixes.length) {
      nodeText = `${getIssueFixTag(issueFixes)}${nodeText}[/FIX]`;
    }

    if (isScribbledDelete) {
      const cleanDelete = node.text.replace(/\s+/g, " ").trim();
      if (cleanDelete) {
        deletes.push(cleanDelete);
      }
      text += `[DELETE: ${nodeText}]`;
      return;
    }

    text += nodeText;
  });

  return {
    text,
    deletes: Array.from(new Set(deletes)),
  };
}

function mapTextRangeToDocRanges(segments: TextSegment[], start: number, end: number) {
  return segments
    .map((segment) => {
      const overlapStart = Math.max(start, segment.start);
      const overlapEnd = Math.min(end, segment.end);

      if (overlapStart >= overlapEnd) {
        return null;
      }

      return {
        from: segment.from + (overlapStart - segment.start),
        to: segment.from + (overlapEnd - segment.start),
      };
    })
    .filter((range): range is { from: number; to: number } => Boolean(range));
}

const isIssueCategory = (value: unknown): value is IssueCategory =>
  typeof value === "string" && categoryOrder.includes(value as IssueCategory);

const isIssueSeverity = (value: unknown): value is IssueSeverity =>
  value === "high" || value === "medium" || value === "low";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getAgentReviewTargetText = (target: AgentReviewTextTarget) =>
  (target.selectedText ?? target.text ?? "").replace(/\s+/g, " ").trim();

function findAgentReviewTextRange(
  textMap: ReturnType<typeof getTextMap>,
  target: AgentReviewTextTarget,
): { start: number; end: number; text: string } | null {
  const targetText = getAgentReviewTargetText(target);

  if (!targetText) {
    return null;
  }

  if (
    typeof target.start === "number" &&
    typeof target.end === "number" &&
    target.start >= 0 &&
    target.end > target.start &&
    target.end <= textMap.text.length
  ) {
    return {
      start: target.start,
      end: target.end,
      text: textMap.text.slice(target.start, target.end).replace(/\s+/g, " ").trim(),
    };
  }

  const occurrence = Math.max(1, target.occurrence ?? 1);
  const exactMatches = Array.from(textMap.text.matchAll(new RegExp(escapeRegExp(targetText), "g")));
  const exactMatch = exactMatches[occurrence - 1];

  if (exactMatch?.index !== undefined) {
    return {
      start: exactMatch.index,
      end: exactMatch.index + exactMatch[0].length,
      text: exactMatch[0].replace(/\s+/g, " ").trim(),
    };
  }

  const flexiblePattern = targetText.split(/\s+/).map(escapeRegExp).join("\\s+");
  const flexibleMatches = Array.from(textMap.text.matchAll(new RegExp(flexiblePattern, "gi")));
  const flexibleMatch = flexibleMatches[occurrence - 1];

  if (flexibleMatch?.index !== undefined) {
    return {
      start: flexibleMatch.index,
      end: flexibleMatch.index + flexibleMatch[0].length,
      text: flexibleMatch[0].replace(/\s+/g, " ").trim(),
    };
  }

  return null;
}

function removeScannerIssueMarks(editor: Editor) {
  const markType = editor.schema.marks.issueMark;
  const tr = editor.state.tr;

  editor.state.doc.descendants((node, position) => {
    if (!node.isText) {
      return;
    }

    for (const mark of node.marks) {
      if (mark.type === markType && mark.attrs.origin === "scanner") {
        tr.removeMark(position, position + node.nodeSize, mark);
      }
    }
  });

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
}

function removeAllReviewMarks(editor: Editor) {
  const tr = editor.state.tr;
  const markNames = ["issueMark", "commentMark", "referenceMark", "strike"];

  for (const markName of markNames) {
    const markType = editor.schema.marks[markName];
    if (markType) {
      tr.removeMark(0, editor.state.doc.content.size, markType);
    }
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
}

function removeMarkByAttribute(
  editor: Editor,
  markName: "issueMark" | "commentMark" | "referenceMark",
  attrName: string,
  attrValue: string,
) {
  const markType = editor.schema.marks[markName];
  const tr = editor.state.tr;

  editor.state.doc.descendants((node, position) => {
    if (!node.isText) {
      return;
    }

    for (const mark of node.marks) {
      if (mark.type === markType && mark.attrs[attrName] === attrValue) {
        tr.removeMark(position, position + node.nodeSize, mark);
      }
    }
  });

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
}

function findMarkSnapshotByAttribute(
  editor: Editor,
  markName: "issueMark" | "commentMark" | "referenceMark",
  attrName: string,
  attrValue: string,
) {
  const markType = editor.schema.marks[markName];
  let from: number | null = null;
  let to: number | null = null;

  editor.state.doc.descendants((node, position) => {
    if (!node.isText) {
      return;
    }

    const hasMatchingMark = node.marks.some((mark) => mark.type === markType && mark.attrs[attrName] === attrValue);
    if (!hasMatchingMark) {
      return;
    }

    from = from === null ? position : Math.min(from, position);
    to = to === null ? position + node.nodeSize : Math.max(to, position + node.nodeSize);
  });

  return from === null || to === null ? null : createSnapshot(editor, from, to);
}

function collectAncestorIssueIds(target: HTMLElement | null, boundary: HTMLElement) {
  const issueIds: string[] = [];
  let current = target?.closest<HTMLElement>("[data-issue-id]") ?? null;

  while (current && boundary.contains(current)) {
    const issueId = current.dataset.issueId;
    if (issueId && !issueIds.includes(issueId)) {
      issueIds.push(issueId);
    }

    current = current.parentElement?.closest<HTMLElement>("[data-issue-id]") ?? null;
  }

  return issueIds;
}

function applyScannerIssues(editor: Editor, issues: Issue[]) {
  removeScannerIssueMarks(editor);

  const markType = editor.schema.marks.issueMark;
  const { segments } = getTextMap(editor);
  const tr = editor.state.tr;

  for (const issue of issues) {
    const ranges = mapTextRangeToDocRanges(segments, issue.start, issue.end);
    for (const range of ranges) {
      tr.addMark(
        range.from,
        range.to,
        markType.create({
          issueId: issue.id,
          category: issue.category,
          origin: "scanner",
          severity: issue.severity,
          label: issue.label,
          source: issue.source ?? "un-AI-ing",
          reason: issue.reason,
          suggestion: issue.suggestion,
          replacements: issue.replacements?.join(" | "),
        }),
      );
    }
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
}

function applyAgentReviewPayload(editor: Editor, payload: AgentReviewPayload) {
  const textMap = getTextMap(editor);
  const issueMark = editor.schema.marks.issueMark;
  const commentMark = editor.schema.marks.commentMark;
  const tr = editor.state.tr;
  const nextIssues: Issue[] = [];
  const nextComments: CommentThread[] = [];
  const nextStyleReferences: StyleReference[] = [];
  const unmatched: string[] = [];

  for (const item of payload.issues ?? []) {
    const range = findAgentReviewTextRange(textMap, item);
    if (!range) {
      unmatched.push(getAgentReviewTargetText(item));
      continue;
    }

    const category = isIssueCategory(item.category) ? item.category : "other";
    const severity = isIssueSeverity(item.severity) ? item.severity : "medium";
    const id = item.id || createId("codex-issue");
    const label = ISSUE_CATEGORIES[category].label;
    const reason = item.reason?.trim() || "Codex marked this span for review.";
    const suggestion = item.suggestion?.trim() || "Review this span before accepting the draft.";

    for (const docRange of mapTextRangeToDocRanges(textMap.segments, range.start, range.end)) {
      tr.addMark(
        docRange.from,
        docRange.to,
        issueMark.create({
          issueId: id,
          category,
          origin: "manual",
          severity,
          label,
          source: "Codex",
          reason,
          suggestion,
        }),
      );
    }

    nextIssues.push({
      id,
      category,
      label,
      severity,
      status: "open",
      origin: "manual",
      source: "Codex",
      text: range.text,
      reason,
      suggestion,
      start: range.start,
      end: range.end,
    });
  }

  for (const item of payload.comments ?? []) {
    const range = findAgentReviewTextRange(textMap, item);
    const rawBody = item.body?.trim();
    if (!range || !rawBody) {
      unmatched.push(getAgentReviewTargetText(item));
      continue;
    }

    const body = stripRepeatedSelectedTextFromComment(rawBody, range.text);
    if (!body) {
      continue;
    }

    const id = item.id || createId("codex-comment");
    for (const docRange of mapTextRangeToDocRanges(textMap.segments, range.start, range.end)) {
      tr.addMark(docRange.from, docRange.to, commentMark.create({ commentId: id }));
    }

    nextComments.push({
      id,
      selectedText: range.text,
      selectionKey: createSelectionKey(range.start, range.end, range.text),
      body,
      createdAt: payload.createdAt ?? nowIso(),
      author: "Agent",
      resolved: false,
    });
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }

  return {
    manualIssues: nextIssues,
    comments: nextComments,
    styleReferences: nextStyleReferences,
    unmatched: unmatched.filter(Boolean),
  };
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

function countByCategory(issues: Issue[]) {
  return categoryOrder.reduce<Record<IssueCategory, number>>((counts, category) => {
    counts[category] = issues.filter(
      (issue) => getIssueDisplayCategory(issue) === category && issue.status !== "resolved",
    ).length;
    return counts;
  }, {} as Record<IssueCategory, number>);
}

function getIssueDisplayCategory(issue: Issue) {
  return issue.category === "passive_voice" && isCheckerIssue(issue) ? "passive_check" : issue.category;
}

function getIssueMarkerKind(issues: Issue[], category: IssueCategory): IssueMarkerKind {
  if (underlineOnlyCategories.has(category)) {
    return "underline";
  }

  const categoryIssues = issues.filter(
    (issue) => getIssueDisplayCategory(issue) === category && issue.status !== "resolved",
  );
  const hasUnderline = categoryIssues.some(isCheckerIssue);
  const hasHighlight = categoryIssues.some((issue) => !isCheckerIssue(issue));

  if (hasUnderline && hasHighlight) {
    return "mixed";
  }

  return hasUnderline ? "underline" : "highlight";
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function truncatePromptText(value: string, maxLength = 500) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}… [truncated]`;
}

function truncatePromptBlock(value: string, maxLength = 120000) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const omitted = normalized.length - maxLength;
  return `${normalized.slice(0, maxLength).trimEnd()}\n\n[truncated: ${omitted} source characters omitted]`;
}

function fencedPromptBlock(language: string, value: string, emptyText: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return emptyText;
  }

  return `\`\`\`${language}\n${truncatePromptBlock(trimmed).replace(/```/g, "``\\`")}\n\`\`\``;
}

function getVersionLabel(version: RewriteVersion) {
  return `${version.label}${version.source === "folder" ? " · saved" : ""}`;
}

function App() {
  const appRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const docsMenuRef = useRef<HTMLElement | null>(null);
  const versionMenuRef = useRef<HTMLElement | null>(null);
  const highlightButtonRef = useRef<HTMLButtonElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const paperSheetRef = useRef<HTMLDivElement | null>(null);
  const reviewDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const marginNoteDrag = useRef<MarginNoteDrag | null>(null);
  const toolDrag = useRef<{ pointerId: number } | null>(null);
  const eraserDrag = useRef<EraserDrag | null>(null);
  const eraserModeRef = useRef(false);
  const applyingMarks = useRef(false);
  const scanRequestId = useRef(0);
  const hydratedSession = useRef(false);
  const loadingVersion = useRef(false);
  const liveDraftHtml = useRef<string | null>(null);
  const activeVersionIdRef = useRef("current");
  const initialRouteRef = useRef<WorkspaceRoute | null>(null);
  const initialRouteAppliedRef = useRef(false);
  if (!initialRouteRef.current) {
    initialRouteRef.current = readWorkspaceRouteFromUrl();
  }
  const initialDocumentRef = useRef<SavedDocument | null>(null);
  if (!initialDocumentRef.current) {
    initialDocumentRef.current = createSavedDocument();
  }
  const [documents, setDocuments] = useState<SavedDocument[]>(() => [initialDocumentRef.current as SavedDocument]);
  const [activeDocumentId, setActiveDocumentId] = useState(() => (initialDocumentRef.current as SavedDocument).id);
  const [title, setTitle] = useState(SAMPLE_TITLE);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [manualIssues, setManualIssues] = useState<Issue[]>([]);
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [styleReferences, setStyleReferences] = useState<StyleReference[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssueGroupIds, setSelectedIssueGroupIds] = useState<string[]>([]);
  const [issueHoverHint, setIssueHoverHint] = useState<IssueHoverHint | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [referenceDraft, setReferenceDraft] = useState("");
  const [commentNotice, setCommentNotice] = useState("");
  const [referenceNotice, setReferenceNotice] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [ignoredIssueIds, setIgnoredIssueIds] = useState<string[]>([]);
  const [hiddenFolderRewriteKeys, setHiddenFolderRewriteKeys] = useState<string[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false);
  const [highlightMenuPosition, setHighlightMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [rewriteVersions, setRewriteVersions] = useState<RewriteVersion[]>([]);
  const [folderRewriteVersions, setFolderRewriteVersions] = useState<RewriteVersion[]>([]);
  const [folderAgentReviews, setFolderAgentReviews] = useState<LoadedAgentReview[]>([]);
  const [rewriteNote, setRewriteNote] = useState("");
  const [rewriteRating, setRewriteRating] = useState<RewriteRating>("unrated");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [versionsMenuOpen, setVersionsMenuOpen] = useState(false);
  const [pendingDeleteVersionId, setPendingDeleteVersionId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftVersionId, setCompareLeftVersionId] = useState("current");
  const [compareRightVersionId, setCompareRightVersionId] = useState("");
  const [sidebarTip, setSidebarTip] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState("current");
  const [, setFolderRefreshState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTool, setReviewTool] = useState<ReviewTool>(null);
  const [reviewPosition, setReviewPosition] = useState({ x: 0, y: 0 });
  const [reviewTarget, setReviewTarget] = useState<SelectionSnapshot | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [eraserMode, setEraserMode] = useState(false);
  const [toolDock, setToolDock] = useState<ToolDock>("top");
  const [toolWidgetOpen, setToolWidgetOpen] = useState(false);
  const [toolWidgetDragging, setToolWidgetDragging] = useState(false);
  const [toolDragY, setToolDragY] = useState<number | null>(null);
  const [marginNoteLayout, setMarginNoteLayout] = useState<Record<string, MarginNoteLayout>>({});
  const [draggingMarginNoteId, setDraggingMarginNoteId] = useState<string | null>(null);
  const [tableControlsPosition, setTableControlsPosition] = useState<TableControlsPosition | null>(null);
  const [codexReviewState, setCodexReviewState] = useState<"idle" | "waiting" | "loaded" | "error">("idle");
  const [codexReviewStartedAt, setCodexReviewStartedAt] = useState<string | null>(null);
  const [codexReviewNotice, setCodexReviewNotice] = useState("");

  const floatingWidgetStyle: CSSProperties | undefined =
    toolDragY === null
      ? undefined
      : {
          top: Math.max(16, Math.min(window.innerHeight - 48, toolDragY)),
          bottom: "auto",
        };

  const clampReviewPosition = useCallback((position: { x: number; y: number }) => {
    const rect = reviewRef.current?.getBoundingClientRect();
    const panelWidth = Math.min(rect?.width ?? 334, window.innerWidth - 24);
    const panelHeight = Math.min(rect?.height ?? 300, window.innerHeight - 24);

    return {
      x: clamp(position.x, 12, Math.max(12, window.innerWidth - panelWidth - 12)),
      y: clamp(position.y, 12, Math.max(12, window.innerHeight - panelHeight - 12)),
    };
  }, []);

  const getPointerDocPosition = (view: EditorView, event: PointerEvent) =>
    view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;

  const showEraserSelection = (view: EditorView, anchor: number, head: number) => {
    const docMax = view.state.doc.content.size;
    const from = Math.max(0, Math.min(anchor, head, docMax));
    const to = Math.max(0, Math.min(Math.max(anchor, head), docMax));
    const selection = TextSelection.create(view.state.doc, from, to);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  };

  const eraseAnnotationsInDragRange = (view: EditorView, drag: EraserDrag) => {
    const annotationIds = collectAnnotationIdsInRange(view, drag);

    if (
      !annotationIds.issueIds.size &&
      !annotationIds.commentIds.size &&
      !annotationIds.referenceIds.size &&
      !annotationIds.strikeRanges.length &&
      !annotationIds.underlineRanges.length
    ) {
      return;
    }

    const { from } = getDragRange(view, drag);
    applyingMarks.current = true;
    removeAnnotationMarksByIds(view, annotationIds);
    applyingMarks.current = false;
    setDocumentRevision((revision) => revision + 1);

    setIgnoredIssueIds((current) => Array.from(new Set([...current, ...annotationIds.issueIds])));
    setIssues((current) => current.filter((issue) => !annotationIds.issueIds.has(issue.id)));
    setManualIssues((current) => current.filter((issue) => !annotationIds.issueIds.has(issue.id)));
    setComments((current) => current.filter((comment) => !annotationIds.commentIds.has(comment.id)));
    setStyleReferences((current) => current.filter((reference) => !annotationIds.referenceIds.has(reference.id)));
    setMarginNoteLayout((current) => {
      const next = { ...current };
      annotationIds.commentIds.forEach((id) => {
        delete next[id];
      });
      annotationIds.referenceIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setSelectedIssueId((current) => (current && annotationIds.issueIds.has(current) ? null : current));
    setSelectedIssueGroupIds((current) => current.filter((issueId) => !annotationIds.issueIds.has(issueId)));
    setSelectedCommentId((current) => (current && annotationIds.commentIds.has(current) ? null : current));
    setSelectedReferenceId((current) => (current && annotationIds.referenceIds.has(current) ? null : current));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(from, view.state.doc.content.size))));
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
      }),
      Underline,
      TextStyle,
      FontSize,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
      }),
      TableExtension.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      IssueMark,
      CommentMark,
      ReferenceMark,
      WritingKeyboardShortcuts,
    ],
    content: SAMPLE_DOCUMENT_HTML,
    editorProps: {
      attributes: {
        class: "document-editor",
        spellcheck: "true",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Escape" && eraserModeRef.current) {
          event.preventDefault();
          eraserDrag.current = null;
          setEraserMode(false);
          return true;
        }

        return handleEditorKeyboardCommand(view, event);
      },
      handleClick: (_view, _position, event) => {
        if (eraserModeRef.current) {
          return true;
        }

        const target = event.target instanceof HTMLElement ? event.target : null;
        const issueIds = collectAncestorIssueIds(target, _view.dom as HTMLElement);
        const commentElement = target?.closest<HTMLElement>("[data-comment-id]") ?? null;
        const referenceElement = target?.closest<HTMLElement>("[data-reference-id]") ?? null;

        if (issueIds.length) {
          setSelectedIssueId(issueIds[0]);
          setSelectedIssueGroupIds(issueIds);
          setSelectedCommentId(null);
          setSelectedReferenceId(null);
          setReviewTool(null);
          setIssueHoverHint(null);
          setCommentNotice("");
          setReferenceNotice("");
          setReviewOpen(true);
          return false;
        }

        if (commentElement?.dataset.commentId) {
          setSelectedCommentId(commentElement.dataset.commentId);
          setSelectedIssueId(null);
          setSelectedIssueGroupIds([]);
          setSelectedReferenceId(null);
          setReviewTool("comment");
          setIssueHoverHint(null);
          setCommentNotice("");
          setReferenceNotice("");
          setReviewOpen(true);
          return false;
        }

        if (referenceElement?.dataset.referenceId) {
          setSelectedReferenceId(referenceElement.dataset.referenceId);
          setSelectedIssueId(null);
          setSelectedIssueGroupIds([]);
          setSelectedCommentId(null);
          setReviewTool("reference");
          setIssueHoverHint(null);
          setCommentNotice("");
          setReferenceNotice("");
          setReviewOpen(true);
          return false;
        }

        return false;
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (!loadingVersion.current && !applyingMarks.current && activeVersionIdRef.current !== "current") {
        activeVersionIdRef.current = "current";
        setActiveVersionId("current");
      }

      if (!applyingMarks.current) {
        setDocumentRevision((revision) => revision + 1);
        window.clearTimeout((activeEditor.storage as { scanTimer?: number }).scanTimer);
        (activeEditor.storage as { scanTimer?: number }).scanTimer = window.setTimeout(() => {
          void runScan(activeEditor);
        }, 1200);
      }
    },
  });

  const updateTableControlsPosition = useCallback(() => {
    if (!editor || !editor.isActive("table")) {
      setTableControlsPosition(null);
      return;
    }

    const { from } = editor.state.selection;
    const domAtSelection = editor.view.domAtPos(from);
    const selectedElement =
      domAtSelection.node instanceof Element ? domAtSelection.node : domAtSelection.node.parentElement;
    const selectedCell = selectedElement?.closest<HTMLElement>("td, th") ?? null;

    if (!selectedCell) {
      setTableControlsPosition(null);
      return;
    }

    const cellRect = selectedCell.getBoundingClientRect();
    const toolbarWidth = 292;
    const toolbarHeight = 84;
    const rawTop = cellRect.top - toolbarHeight - 8;
    const top = Math.max(
      12,
      Math.min(window.innerHeight - toolbarHeight - 12, rawTop < 12 ? cellRect.bottom + 8 : rawTop),
    );
    const left = Math.max(
      12,
      Math.min(window.innerWidth - toolbarWidth - 12, cellRect.left + cellRect.width / 2 - toolbarWidth / 2),
    );

    setTableControlsPosition((current) =>
      current && Math.abs(current.left - left) < 1 && Math.abs(current.top - top) < 1 ? current : { left, top },
    );
  }, [editor]);

  const runTableCommand = (command: () => boolean) => {
    command();
    window.requestAnimationFrame(updateTableControlsPosition);
  };

  useEffect(() => {
    if (!editor) {
      return;
    }

    let frame = 0;
    const scheduleTableControls = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateTableControlsPosition);
    };

    scheduleTableControls();
    window.addEventListener("resize", scheduleTableControls);
    document.addEventListener("scroll", scheduleTableControls, true);
    editor.on("update", scheduleTableControls);
    editor.on("selectionUpdate", scheduleTableControls);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleTableControls);
      document.removeEventListener("scroll", scheduleTableControls, true);
      editor.off("update", scheduleTableControls);
      editor.off("selectionUpdate", scheduleTableControls);
    };
  }, [editor, updateTableControlsPosition]);

  const activeIssues = useMemo(
    () =>
      [...issues, ...manualIssues]
        .filter((issue) => issue.status !== "resolved")
        .sort((a, b) => issueSeverityRank[a.severity] - issueSeverityRank[b.severity] || a.start - b.start),
    [issues, manualIssues],
  );
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null,
    [activeDocumentId, documents],
  );
  const documentOptions = useMemo(
    () =>
      documents.map((document) => {
        const displayTitle = document.id === activeDocumentId ? title || "Untitled draft" : document.title || "Untitled draft";
        const hiddenKeys = new Set(
          document.id === activeDocumentId ? hiddenFolderRewriteKeys : document.hiddenFolderRewriteKeys ?? [],
        );
        const folderCount = folderRewriteVersions.filter((version) =>
          rewriteBelongsToDocument(version, { id: document.id, title: displayTitle }) &&
          !hiddenKeys.has(getRewriteVersionKey(version)),
        ).length;
        const reviewCount = folderAgentReviews.filter((review) =>
          agentReviewBelongsToDocument(review, { id: document.id, title: displayTitle }),
        ).length;

        return {
          id: document.id,
          title: displayTitle,
          versionCount:
            document.id === activeDocumentId
              ? rewriteVersions.length
              : (document.rewriteVersions ?? []).filter((version) => version.source !== "folder").length + folderCount,
          reviewCount,
        };
      }),
    [activeDocumentId, documents, folderAgentReviews, folderRewriteVersions, hiddenFolderRewriteKeys, rewriteVersions.length, title],
  );

  const selectedIssue = selectedIssueId ? activeIssues.find((issue) => issue.id === selectedIssueId) ?? null : null;
  const selectedIssueGroup = useMemo(() => {
    if (!selectedIssueId) {
      return [];
    }

    const orderedIds = Array.from(
      new Set(selectedIssueGroupIds.includes(selectedIssueId) ? selectedIssueGroupIds : [selectedIssueId, ...selectedIssueGroupIds]),
    );

    return orderedIds
      .map((issueId) => activeIssues.find((issue) => issue.id === issueId) ?? null)
      .filter((issue): issue is Issue => Boolean(issue));
  }, [activeIssues, selectedIssueGroupIds, selectedIssueId]);
  const selectedComment = comments.find((comment) => comment.id === selectedCommentId) ?? null;
  const selectedReference = styleReferences.find((reference) => reference.id === selectedReferenceId) ?? null;
  const reviewTargetText = selectedComment?.selectedText ?? selectedReference?.selectedText ?? selectedIssue?.text ?? reviewTarget?.text ?? "";
  const reviewTargetKey =
    reviewTarget && normalizeSelectionText(reviewTarget.text) === normalizeSelectionText(reviewTargetText) ? reviewTarget.key : "";
  const targetComment = reviewTargetText ? (selectedComment ?? findMatchingAnnotation(comments, reviewTargetText, reviewTargetKey) ?? null) : null;
  const targetReference = reviewTargetText
    ? (selectedReference ?? findMatchingAnnotation(styleReferences, reviewTargetText, reviewTargetKey) ?? null)
    : null;
  const showCommentSection = reviewTool === "comment" || Boolean(selectedComment);
  const showReferenceSection = reviewTool === "reference" || Boolean(selectedReference);
  const counts = useMemo(() => countByCategory(activeIssues), [activeIssues]);
  const plainText = editor ? getTextMap(editor).text : "";
  const currentDraftCompareText = useMemo(() => {
    if (!editor) {
      return "";
    }

    if (activeVersionId === "current") {
      return getTextMap(editor).text;
    }

    return htmlToText(liveDraftHtml.current ?? editor.getHTML());
  }, [activeVersionId, editor, plainText]);
  const compareOptions = useMemo<CompareVersion[]>(
    () => [
      {
        id: "current",
        label: "Current draft",
        text: currentDraftCompareText,
      },
      ...rewriteVersions.map((version) => ({
        id: version.id,
        label: getVersionLabel(version),
        text: version.text,
      })),
    ],
    [currentDraftCompareText, rewriteVersions],
  );
  const activeVersionLabel = compareOptions.find((version) => version.id === activeVersionId)?.label ?? "Current draft";
  const compareLeftVersion =
    compareOptions.find((version) => version.id === compareLeftVersionId) ?? compareOptions[0] ?? null;
  const compareRightVersion =
    compareOptions.find((version) => version.id === compareRightVersionId) ??
    compareOptions.find((version) => version.id !== compareLeftVersion?.id) ??
    compareOptions[0] ??
    null;
  const compareDiff = useMemo(
    () => buildSideBySideDiff(compareLeftVersion?.text ?? "", compareRightVersion?.text ?? ""),
    [compareLeftVersion?.text, compareRightVersion?.text],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom as HTMLElement;

    const hideHoverHint = () => setIssueHoverHint(null);
    const handlePointerMove = (event: PointerEvent) => {
      if (reviewOpen || eraserModeRef.current) {
        hideHoverHint();
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const issueElement = target?.closest<HTMLElement>("[data-issue-id]") ?? null;
      const issueIds = collectAncestorIssueIds(target, dom);

      if (!issueElement || !issueIds.length) {
        hideHoverHint();
        return;
      }

      const hoveredIssues = issueIds
        .map((issueId) => activeIssues.find((issue) => issue.id === issueId) ?? null)
        .filter((issue): issue is Issue => Boolean(issue));

      if (!hoveredIssues.length) {
        hideHoverHint();
        return;
      }

      const rect = issueElement.getBoundingClientRect();
      const x = Math.max(12, Math.min(window.innerWidth - 260, rect.left));
      const y = Math.max(12, rect.top - 48);
      const issueLabels = Array.from(new Set(hoveredIssues.map((issue) => issue.label)));
      const label = issueLabels.join(" + ");
      const detail = "";

      setIssueHoverHint((current) =>
        current?.issueIds.join(",") === issueIds.join(",") && Math.abs(current.x - x) < 1 && Math.abs(current.y - y) < 1
          ? current
          : { issueIds, label, detail, x, y },
      );
    };

    dom.addEventListener("pointermove", handlePointerMove);
    dom.addEventListener("pointerleave", hideHoverHint);

    return () => {
      dom.removeEventListener("pointermove", handlePointerMove);
      dom.removeEventListener("pointerleave", hideHoverHint);
    };
  }, [activeIssues, editor, reviewOpen]);

  const measureMarginNotes = useCallback(() => {
    const sheet = paperSheetRef.current;
    if (!sheet) {
      return;
    }

    const editorBody = sheet.querySelector<HTMLElement>(".editor-paper-body");
    if (!editorBody) {
      return;
    }

    const sheetRect = sheet.getBoundingClientRect();
    const editorRect = editorBody.getBoundingClientRect();
    const sheetWidth = sheetRect.width;
    const sheetHeight = Math.max(sheet.scrollHeight, sheetRect.height);
    const maxTop = Math.max(marginNoteInset, sheetHeight - marginNoteBaseHeight - marginNoteInset);
    const nextLayout: Record<string, MarginNoteLayout> = {};

    const getMarkedElements = (selector: string, id: string, dataKey: "commentId" | "referenceId") =>
      Array.from(sheet.querySelectorAll<HTMLElement>(selector)).filter((element) => element.dataset[dataKey] === id);

    const getMarkClientRects = (markElements: HTMLElement[]) =>
      markElements.flatMap((element) =>
        Array.from(element.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0),
      );

    const getMergedMarkLineRects = (markElements: HTMLElement[]) => {
      const rects = getMarkClientRects(markElements)
        .map((rect) => ({
          left: rect.left - sheetRect.left,
          right: rect.right - sheetRect.left,
          top: rect.top - sheetRect.top,
          bottom: rect.bottom - sheetRect.top,
        }))
        .sort((a, b) => a.top - b.top || a.left - b.left);

      const lineRects: Array<{ left: number; right: number; top: number; bottom: number }> = [];

      for (const rect of rects) {
        const rectCenterY = (rect.top + rect.bottom) / 2;
        const existingLine = lineRects.find((line) => {
          const lineCenterY = (line.top + line.bottom) / 2;
          const lineHeight = Math.max(line.bottom - line.top, rect.bottom - rect.top);

          return Math.abs(rectCenterY - lineCenterY) <= Math.max(6, lineHeight * 0.45);
        });

        if (existingLine) {
          existingLine.left = Math.min(existingLine.left, rect.left);
          existingLine.right = Math.max(existingLine.right, rect.right);
          existingLine.top = Math.min(existingLine.top, rect.top);
          existingLine.bottom = Math.max(existingLine.bottom, rect.bottom);
        } else {
          lineRects.push({ ...rect });
        }
      }

      return lineRects;
    };

    const getMarkRect = (markElements: HTMLElement[]) => {
      const rects = getMarkClientRects(markElements);

      if (!rects.length) {
        return null;
      }

      return {
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    };

    const setLayoutFromMark = (id: string, markElements: HTMLElement[]) => {
      const markRect = getMarkRect(markElements);
      const markLineRects = getMergedMarkLineRects(markElements);
      if (!markRect) {
        return;
      }

      const targetLeft = markRect.left - sheetRect.left;
      const targetRight = markRect.right - sheetRect.left;
      const targetTop = markRect.top - sheetRect.top;
      const targetBottom = markRect.bottom - sheetRect.top;
      const targetCenterX = (targetLeft + targetRight) / 2;
      const targetCenterY = (targetTop + targetBottom) / 2;
      const roomRight = sheetWidth - targetRight;
      const roomLeft = targetLeft;
      const placeRight = roomRight >= marginNoteBaseWidth + 94 || roomRight >= roomLeft;
      const noteLeft = placeRight
        ? targetRight + 108
        : targetLeft - marginNoteBaseWidth - 108;
      const noteTop = targetCenterY - marginNoteBaseHeight / 2;

      nextLayout[id] = {
        side: targetCenterX <= editorRect.left - sheetRect.left + editorRect.width / 2 ? "right" : "left",
        top: clamp(noteTop, marginNoteInset, maxTop),
        left: clamp(noteLeft, marginNoteInset, Math.max(marginNoteInset, sheetWidth - marginNoteBaseWidth - marginNoteInset)),
        anchorX: targetCenterX,
        anchorY: targetCenterY,
        targetLeft,
        targetRight,
        targetTop,
        targetBottom,
        targetRects: markLineRects,
      };
    };

    for (const comment of comments) {
      setLayoutFromMark(comment.id, getMarkedElements("[data-comment-id]", comment.id, "commentId"));
    }

    for (const reference of styleReferences) {
      setLayoutFromMark(reference.id, getMarkedElements("[data-reference-id]", reference.id, "referenceId"));
    }

    setMarginNoteLayout((current) => {
      const activeNoteIds = new Set([...comments.map((comment) => comment.id), ...styleReferences.map((reference) => reference.id)]);
      const mergedLayout: Record<string, MarginNoteLayout> = {};

      for (const id of activeNoteIds) {
        const existing = current[id];
        const measured = nextLayout[id];

        if (existing?.userMoved) {
          mergedLayout[id] = measured
            ? {
                ...existing,
                side: existing.side ?? measured.side,
                top: existing.top,
                left: existing.left ?? measured.left,
                anchorX: measured.anchorX,
                anchorY: measured.anchorY,
                targetLeft: measured.targetLeft,
                targetRight: measured.targetRight,
                targetTop: measured.targetTop,
                targetBottom: measured.targetBottom,
                targetRects: measured.targetRects,
              }
            : existing;
          continue;
        }

        if (measured) {
          mergedLayout[id] = {
            ...measured,
            size: existing?.size,
            userMoved: existing?.userMoved,
          };
          continue;
        }

        if (existing) {
          mergedLayout[id] = existing;
        }
      }

      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(mergedLayout);

      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every(
          (key) =>
            current[key]?.side === mergedLayout[key].side &&
            Math.abs((current[key]?.top ?? 0) - mergedLayout[key].top) < 0.5 &&
            Math.abs((current[key]?.left ?? 0) - (mergedLayout[key].left ?? 0)) < 0.5 &&
            Math.abs((current[key]?.anchorX ?? 0) - (mergedLayout[key].anchorX ?? 0)) < 0.5 &&
            Math.abs((current[key]?.anchorY ?? 0) - (mergedLayout[key].anchorY ?? 0)) < 0.5 &&
            (current[key]?.size ?? defaultMarginNoteSize) ===
              (mergedLayout[key].size ?? defaultMarginNoteSize) &&
            Boolean(current[key]?.userMoved) === Boolean(mergedLayout[key].userMoved),
        )
      ) {
        return current;
      }

      return mergedLayout;
    });
  }, [comments, styleReferences]);

  const getFolderVersionsForDocument = useCallback(
    (document: Pick<SavedDocument, "id" | "title" | "hiddenFolderRewriteKeys"> | null) => {
      if (!document) {
        return [];
      }

      const hiddenKeys = new Set(document.hiddenFolderRewriteKeys ?? []);

      return folderRewriteVersions.filter(
        (version) => rewriteBelongsToDocument(version, document) && !hiddenKeys.has(getRewriteVersionKey(version)),
      );
    },
    [folderRewriteVersions],
  );

  const getDocumentVersionList = useCallback(
    (document: SavedDocument) =>
      mergeRewriteVersions(
        (document.rewriteVersions ?? []).filter((version) => version.source !== "folder"),
        getFolderVersionsForDocument(document),
      ),
    [getFolderVersionsForDocument],
  );

  const getLatestFolderReviewForDocument = useCallback(
    (document: Pick<SavedDocument, "id" | "title"> | null) => {
      if (!document) {
        return null;
      }

      return (
        folderAgentReviews
          .filter((review) => agentReviewBelongsToDocument(review, document))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
      );
    },
    [folderAgentReviews],
  );

  const loadFolderRewrites = useCallback(async () => {
    setFolderRefreshState("loading");

    try {
      const manifestResponse = await fetch(`${rewriteManifestPath}?t=${Date.now()}`, { cache: "no-store" });

      if (!manifestResponse.ok) {
        throw new Error("Could not load rewrite manifest");
      }

      const manifest = (await manifestResponse.json()) as RewriteManifest;
      const manifestEntries = Array.isArray(manifest.rewrites) ? manifest.rewrites : [];
      const loadedRewrites = await Promise.all(
        manifestEntries
          .filter((entry) => entry.file.endsWith(".json"))
          .map(async (entry) => {
            const response = await fetch(`/rewrites/${entry.file}?t=${Date.now()}`, { cache: "no-store" });
            if (!response.ok) {
              return null;
            }

            const payload = (await response.json()) as FolderRewritePayload;
            return normaliseFolderRewrite(entry, payload);
          }),
      );

      setFolderRewriteVersions(loadedRewrites.filter((version): version is RewriteVersion => Boolean(version)));
      setFolderRefreshState("loaded");
    } catch {
      setFolderRefreshState("error");
    }
  }, []);

  const loadFolderAgentReviews = useCallback(async () => {
    try {
      const manifestResponse = await fetch(`${agentReviewManifestPath}?t=${Date.now()}`, { cache: "no-store" });

      if (!manifestResponse.ok) {
        return;
      }

      const manifest = (await manifestResponse.json()) as AgentReviewManifest;
      const manifestEntries = Array.isArray(manifest.reviews) ? manifest.reviews : [];
      const loadedReviews = await Promise.all(
        manifestEntries
          .filter((entry) => entry.file.endsWith(".json"))
          .map(async (entry) => {
            const response = await fetch(`/agent-reviews/${entry.file}?t=${Date.now()}`, { cache: "no-store" });
            if (!response.ok) {
              return null;
            }

            const payload = (await response.json()) as AgentReviewPayload;
            const review: LoadedAgentReview = {
              ...payload,
              id: payload.id ?? entry.id,
              label: payload.label ?? entry.label,
              createdAt: payload.createdAt ?? entry.createdAt ?? nowIso(),
              docId: payload.docId ?? entry.docId,
              title: payload.title ?? entry.title,
              file: entry.file,
            };

            return review;
          }),
      );

      setFolderAgentReviews(loadedReviews.filter((review): review is LoadedAgentReview => review !== null));
    } catch {
      setFolderAgentReviews([]);
    }
  }, []);

  useEffect(() => {
    activeVersionIdRef.current = activeVersionId;
  }, [activeVersionId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const view = editor.view;
    const { dom } = view;

    const handlePointerDown = (event: PointerEvent) => {
      if (!eraserModeRef.current || event.button !== 0) {
        return;
      }

      const position = getPointerDocPosition(view, event);
      if (position === null) {
        return;
      }

      event.preventDefault();
      view.focus();
      eraserDrag.current = { anchor: position, head: position };
      showEraserSelection(view, position, position);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!eraserModeRef.current || !eraserDrag.current) {
        return;
      }

      const position = getPointerDocPosition(view, event);
      if (position === null) {
        return;
      }

      event.preventDefault();
      eraserDrag.current = { ...eraserDrag.current, head: position };
      showEraserSelection(view, eraserDrag.current.anchor, position);
    };

    const finishEraserDrag = (event: PointerEvent) => {
      if (!eraserModeRef.current || !eraserDrag.current) {
        return;
      }

      event.preventDefault();
      eraseAnnotationsInDragRange(view, eraserDrag.current);
      eraserDrag.current = null;
    };

    dom.addEventListener("pointerdown", handlePointerDown);
    dom.addEventListener("pointermove", handlePointerMove);
    dom.addEventListener("pointerup", finishEraserDrag);
    dom.addEventListener("pointerleave", finishEraserDrag);

    return () => {
      dom.removeEventListener("pointerdown", handlePointerDown);
      dom.removeEventListener("pointermove", handlePointerMove);
      dom.removeEventListener("pointerup", finishEraserDrag);
      dom.removeEventListener("pointerleave", finishEraserDrag);
    };
  }, [editor]);

  useEffect(() => {
    eraserModeRef.current = eraserMode;
    editor?.view.dom.classList.toggle("eraser-mode", eraserMode);

    if (!eraserMode) {
      eraserDrag.current = null;
    }
  }, [editor, eraserMode]);

  useEffect(() => {
    if (!feedbackOpen) {
      return;
    }

    setToolWidgetOpen(true);
    setDocsMenuOpen(false);
    setVersionsMenuOpen(false);
    setHighlightMenuOpen(false);

    const closeFeedback = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (toolbarRef.current?.contains(target) ||
          (target instanceof HTMLElement && target.closest(".feedback-popover")))
      ) {
        return;
      }

      setFeedbackOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFeedbackOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeFeedback);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeFeedback);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [feedbackOpen]);

  useEffect(() => {
    if (!highlightMenuOpen) {
      return;
    }

    setToolWidgetOpen(true);

    const closeHighlightMenu = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (highlightButtonRef.current?.contains(target) ||
          (target instanceof HTMLElement && target.closest(".highlight-popover")))
      ) {
        return;
      }

      setHighlightMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHighlightMenuOpen(false);
      }
    };

    const closeOnViewportChange = () => setHighlightMenuOpen(false);

    document.addEventListener("pointerdown", closeHighlightMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", closeHighlightMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [highlightMenuOpen]);

  useEffect(() => {
    if (!docsMenuOpen) {
      return;
    }

    setToolWidgetOpen(true);
    setVersionsMenuOpen(false);
    setHighlightMenuOpen(false);

    const closeDocsMenu = (event: PointerEvent) => {
      const target = event.target as Node;
      if (toolbarRef.current?.contains(target) || docsMenuRef.current?.contains(target)) {
        return;
      }

      setDocsMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDocsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeDocsMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeDocsMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [docsMenuOpen]);

  useEffect(() => {
    if (!versionsMenuOpen) {
      setPendingDeleteVersionId(null);
      return;
    }

    setToolWidgetOpen(true);
    setDocsMenuOpen(false);
    setHighlightMenuOpen(false);

    const closeVersionsMenu = (event: PointerEvent) => {
      const target = event.target as Node;
      if (toolbarRef.current?.contains(target) || versionMenuRef.current?.contains(target)) {
        return;
      }

      setVersionsMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVersionsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeVersionsMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeVersionsMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [versionsMenuOpen]);

  useEffect(() => {
    if (!compareRightVersionId && rewriteVersions.length > 0) {
      setCompareRightVersionId(activeVersionId === "current" ? rewriteVersions[0].id : activeVersionId);
    }
  }, [activeVersionId, compareRightVersionId, rewriteVersions]);

  useEffect(() => {
    if (!compareOptions.length) {
      return;
    }

    if (!compareOptions.some((version) => version.id === compareLeftVersionId)) {
      setCompareLeftVersionId("current");
    }

    if (!compareOptions.some((version) => version.id === compareRightVersionId)) {
      setCompareRightVersionId(compareOptions.find((version) => version.id !== "current")?.id ?? "current");
    }
  }, [compareLeftVersionId, compareOptions, compareRightVersionId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const snapshot = selectedComment
      ? findMarkSnapshotByAttribute(editor, "commentMark", "commentId", selectedComment.id)
      : selectedReference
        ? findMarkSnapshotByAttribute(editor, "referenceMark", "referenceId", selectedReference.id)
        : selectedIssue
          ? findMarkSnapshotByAttribute(editor, "issueMark", "issueId", selectedIssue.id)
          : null;

    if (!snapshot) {
      return;
    }

    setReviewTarget(snapshot);
    if (selectedComment || selectedReference) {
      return;
    }

    if (editor.state.selection.from !== snapshot.from || editor.state.selection.to !== snapshot.to) {
      editor.commands.setTextSelection({ from: snapshot.from, to: snapshot.to });
    }
  }, [editor, selectedComment, selectedIssue, selectedReference]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    let frame = 0;
    const scheduleMeasurement = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureMarginNotes);
    };

    scheduleMeasurement();
    window.addEventListener("resize", scheduleMeasurement);
    editor.on("update", scheduleMeasurement);
    editor.on("selectionUpdate", scheduleMeasurement);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasurement);
      editor.off("update", scheduleMeasurement);
      editor.off("selectionUpdate", scheduleMeasurement);
    };
  }, [editor, measureMarginNotes]);

  useEffect(() => {
    void loadFolderRewrites();
  }, [loadFolderRewrites]);

  useEffect(() => {
    void loadFolderAgentReviews();
  }, [loadFolderAgentReviews]);

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    const folderDocuments = createFolderDocuments(folderRewriteVersions, folderAgentReviews);
    if (!folderDocuments.length) {
      return;
    }

    setDocuments((current) => {
      const nextDocuments = [...current];
      let changed = false;

      for (const folderDocument of folderDocuments) {
        const alreadyShown = nextDocuments.some((document) =>
          folderDocument.id.startsWith("folder-doc-")
            ? documentMatchesIdentity(document, { title: folderDocument.title })
            : document.id === folderDocument.id,
        );

        if (!alreadyShown) {
          nextDocuments.push(folderDocument);
          changed = true;
        }
      }

      return changed ? nextDocuments : current;
    });
  }, [folderAgentReviews, folderRewriteVersions, sessionHydrated]);

  useEffect(() => {
    if (!activeDocument) {
      return;
    }

    const documentForMatching = {
      ...activeDocument,
      title,
      hiddenFolderRewriteKeys,
    };

    setRewriteVersions((current) =>
      mergeRewriteVersions(
        current.filter((version) => version.source !== "folder"),
        getFolderVersionsForDocument(documentForMatching),
      ),
    );
  }, [activeDocument, folderRewriteVersions, getFolderVersionsForDocument, hiddenFolderRewriteKeys, title]);

  useEffect(() => {
    const placeReviewPanel = () => {
      setReviewPosition((current) => {
        const target =
          current.x === 0 && current.y === 0
            ? {
                x: Math.max(220, window.innerWidth - 420),
                y: 92,
              }
            : current;
        const next = clampReviewPosition(target);
        return Math.abs(current.x - next.x) < 1 && Math.abs(current.y - next.y) < 1 ? current : next;
      });
    };

    placeReviewPanel();
    window.addEventListener("resize", placeReviewPanel);
    return () => window.removeEventListener("resize", placeReviewPanel);
  }, [clampReviewPosition]);

  useEffect(() => {
    if (!appRef.current || !editor) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      return;
    }

    const context = gsap.context(() => {
      gsap.from(".document-editor", {
        autoAlpha: 0,
        y: 14,
        duration: 0.45,
        ease: "power2.out",
      });
      if (toolbarRef.current) {
        gsap.from(toolbarRef.current, {
          autoAlpha: 0,
          y: -10,
          scale: 0.98,
          duration: 0.42,
          ease: "power2.out",
          delay: 0.08,
        });
      }
    }, appRef.current);

    return () => context.revert();
  }, [editor]);

  useEffect(() => {
    if (!reviewRef.current) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      return;
    }

    gsap.fromTo(
      reviewRef.current,
      { autoAlpha: 0.75, y: 6 },
      { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out" },
    );
  }, [reviewOpen, selectedIssue?.id, selectedComment?.id, selectedReference?.id]);

  useEffect(() => {
    if (!copied || !toolbarRef.current) {
      return;
    }

    gsap.fromTo(
      ".copy-feedback",
      { scale: 0.96, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.18, ease: "power2.out" },
    );
  }, [copied]);

  useEffect(() => {
    if (!appRef.current || (!comments.length && !styleReferences.length)) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      return;
    }

    gsap.fromTo(
      ".annotation-card",
      { autoAlpha: 0, x: 18, rotation: 1.5 },
      { autoAlpha: 1, x: 0, rotation: 0, duration: 0.28, ease: "power2.out", stagger: 0.04 },
    );
  }, [comments.length, styleReferences.length]);

  const runScan = useCallback(
    async (targetEditor = editor) => {
      if (!targetEditor) {
        return;
      }

      const requestId = scanRequestId.current + 1;
      scanRequestId.current = requestId;
      const { text } = getTextMap(targetEditor);
      const { scanText } = await import("./lib/analysis");
      const nextIssues = (await scanText(text)).filter(
        (issue) => !ignoredIssueIds.includes(issue.id) && !ignoredIssueIds.includes(getIssueIgnoreKey(issue)),
      );
      if (requestId !== scanRequestId.current) {
        return;
      }

      applyingMarks.current = true;
      applyScannerIssues(targetEditor, nextIssues);
      applyingMarks.current = false;
      setIssues(nextIssues);
    },
    [editor, ignoredIssueIds],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const timer = window.setTimeout(() => void runScan(editor), 100);
    return () => window.clearTimeout(timer);
  }, [editor, runScan]);

  const resetDocumentUi = useCallback(() => {
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setSelectedCommentId(null);
    setSelectedReferenceId(null);
    setReviewTarget(null);
    setReviewTool(null);
    setCommentDraft("");
    setReferenceDraft("");
    setCommentNotice("");
    setReferenceNotice("");
    setHighlightMenuOpen(false);
    setIssueHoverHint(null);
    setEraserMode(false);
    setFeedbackOpen(false);
    setDocsMenuOpen(false);
    setVersionsMenuOpen(false);
    setCompareOpen(false);
  }, []);

  const loadDocumentIntoEditor = useCallback(
    (document: SavedDocument) => {
      if (!editor) {
        return;
      }

      let documentHtml = document.documentHtml || blankDocumentHtml;
      const structuredFolderVersion = getFolderVersionsForDocument(document).find(
        (version) => getDocumentStructureScore(version.html) > getDocumentStructureScore(documentHtml) + 4,
      );
      if (structuredFolderVersion) {
        documentHtml = structuredFolderVersion.html;
      }
      const folderReview = getLatestFolderReviewForDocument(document);
      const shouldApplyFolderReview = Boolean(
        folderReview &&
          !(document.manualIssues?.length || document.comments?.length || document.styleReferences?.length),
      );
      let folderReviewResult: ReturnType<typeof applyAgentReviewPayload> | null = null;

      scanRequestId.current += 1;
      loadingVersion.current = true;
      applyingMarks.current = true;
      editor.commands.setContent(documentHtml);
      if (folderReview && shouldApplyFolderReview) {
        removeAllReviewMarks(editor);
        folderReviewResult = applyAgentReviewPayload(editor, folderReview);
        documentHtml = editor.getHTML();
      }
      applyingMarks.current = false;
      liveDraftHtml.current = documentHtml;
      activeVersionIdRef.current = "current";

      setTitle(document.title || "Untitled draft");
      setIssues(folderReviewResult ? [] : document.issues ?? []);
      setComments(folderReviewResult?.comments ?? document.comments ?? []);
      setStyleReferences(folderReviewResult?.styleReferences ?? document.styleReferences ?? []);
      setMarginNoteLayout(document.marginNoteLayout ?? {});
      setManualIssues(folderReviewResult?.manualIssues ?? document.manualIssues ?? []);
      setIgnoredIssueIds(document.ignoredIssueIds ?? []);
      setHiddenFolderRewriteKeys(document.hiddenFolderRewriteKeys ?? []);
      setRewriteVersions(getDocumentVersionList(document));
      setRewriteNote("");
      setRewriteRating("unrated");
      setActiveVersionId("current");
      setCompareLeftVersionId("current");
      setCompareRightVersionId("");
      setLastSavedAt(document.updatedAt ?? null);
      setDocumentRevision((revision) => revision + 1);
      if (folderReviewResult) {
        setCodexReviewState("loaded");
        setCodexReviewNotice(
          `Codex review loaded: ${folderReviewResult.manualIssues.length} highlights and ${folderReviewResult.comments.length} comments.${
            folderReviewResult.unmatched.length ? ` ${folderReviewResult.unmatched.length} spans could not be matched.` : ""
          }`,
        );
        window.setTimeout(() => setCodexReviewState("idle"), 6500);
      }
      resetDocumentUi();

      window.setTimeout(() => {
        loadingVersion.current = false;
        void runScan(editor);
      }, 50);
    },
    [editor, getDocumentVersionList, getFolderVersionsForDocument, getLatestFolderReviewForDocument, resetDocumentUi, runScan],
  );

  useEffect(() => {
    if (!editor || !activeDocument || activeVersionIdRef.current !== "current") {
      return;
    }

    const currentHtml = editor.getHTML();
    const structuredFolderVersion = getFolderVersionsForDocument({
      ...activeDocument,
      title,
      hiddenFolderRewriteKeys,
    }).find((version) => getDocumentStructureScore(version.html) > getDocumentStructureScore(currentHtml) + 4);

    if (!structuredFolderVersion) {
      return;
    }

    const folderReview = getLatestFolderReviewForDocument({ ...activeDocument, title });
    scanRequestId.current += 1;
    loadingVersion.current = true;
    applyingMarks.current = true;
    editor.commands.setContent(structuredFolderVersion.html);
    const reviewResult = folderReview ? applyAgentReviewPayload(editor, folderReview) : null;
    editor.commands.setTextSelection(Math.min(1, editor.state.doc.content.size));
    applyingMarks.current = false;
    liveDraftHtml.current = editor.getHTML();
    activeVersionIdRef.current = "current";

    setManualIssues(reviewResult?.manualIssues ?? []);
    setComments(reviewResult?.comments ?? []);
    setStyleReferences(reviewResult?.styleReferences ?? []);
    setMarginNoteLayout({});
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setSelectedCommentId(null);
    setSelectedReferenceId(null);
    setReviewTarget(null);
    setReviewTool(null);
    setIssueHoverHint(null);
    setDocumentRevision((revision) => revision + 1);

    window.setTimeout(() => {
      loadingVersion.current = false;
      void runScan(editor);
    }, 50);
  }, [
    activeDocument,
    editor,
    getFolderVersionsForDocument,
    getLatestFolderReviewForDocument,
    hiddenFolderRewriteKeys,
    runScan,
    title,
  ]);

  const buildActiveDocumentSnapshot = useCallback((): SavedDocument => {
    const base = activeDocument ?? createSavedDocument({ id: activeDocumentId, title });
    const updatedAt = nowIso();
    const documentHtml = editor
      ? activeVersionId === "current"
        ? editor.getHTML()
        : liveDraftHtml.current ?? editor.getHTML()
      : base.documentHtml;
    const documentText = editor
      ? activeVersionId === "current"
        ? getTextMap(editor).text
        : htmlToText(documentHtml)
      : base.plainText;

    if (editor && activeVersionId === "current") {
      liveDraftHtml.current = documentHtml;
    }

    return {
      ...base,
      title: title.trim() || "Untitled draft",
      documentHtml,
      plainText: documentText,
      sourceContext: base.sourceContext,
      issues: activeIssues,
      comments,
      styleReferences,
      marginNoteLayout,
      manualIssues,
      ignoredIssueIds,
      hiddenFolderRewriteKeys,
      rewriteVersions: rewriteVersions.filter((version) => version.source !== "folder"),
      updatedAt,
    };
  }, [
    activeDocument,
    activeDocumentId,
    activeIssues,
    activeVersionId,
    comments,
    editor,
    hiddenFolderRewriteKeys,
    ignoredIssueIds,
    manualIssues,
    marginNoteLayout,
    rewriteVersions,
    styleReferences,
    title,
  ]);

  const getDocumentsWithActiveSnapshot = useCallback(() => {
    const snapshot = buildActiveDocumentSnapshot();
    const hasActiveDocument = documents.some((document) => document.id === snapshot.id);
    const nextDocuments = hasActiveDocument
      ? documents.map((document) => (document.id === snapshot.id ? snapshot : document))
      : [...documents, snapshot];

    return { snapshot, documents: nextDocuments };
  }, [buildActiveDocumentSnapshot, documents]);

  useEffect(() => {
    if (!editor || hydratedSession.current) {
      return;
    }

    hydratedSession.current = true;
    const rawWorkspace = window.localStorage.getItem(storageKey);
    const rawLegacySession = window.localStorage.getItem(legacyStorageKey);

    try {
      if (rawWorkspace) {
        const workspace = JSON.parse(rawWorkspace) as SavedWorkspace;
        const savedDocuments = Array.isArray(workspace.documents)
          ? workspace.documents.map((document) =>
              createSavedDocument({
                ...document,
                rewriteVersions: (document.rewriteVersions ?? []).filter((version) => version.source !== "folder"),
              }),
            )
          : [];
        const nextDocuments = savedDocuments.length ? savedDocuments : [createSavedDocument()];
        const route = initialRouteRef.current;
        const nextActiveDocument =
          (route?.docId ? nextDocuments.find((document) => document.id === route.docId) : null) ??
          nextDocuments.find((document) => document.id === workspace.activeDocumentId) ??
          nextDocuments[0];

        setDocuments(nextDocuments);
        setActiveDocumentId(nextActiveDocument.id);
        loadDocumentIntoEditor(nextActiveDocument);
        return;
      }

      if (rawLegacySession) {
        const session = JSON.parse(rawLegacySession) as SavedSession;
        if (session.documentHtml) {
          const migratedDocument = createSavedDocument({
            ...session,
            rewriteVersions: (session.rewriteVersions ?? []).filter((version) => version.source !== "folder"),
          });

          setDocuments([migratedDocument]);
          setActiveDocumentId(migratedDocument.id);
          loadDocumentIntoEditor(migratedDocument);
        }
      }
    } catch {
      setSaveState("error");
    } finally {
      setSessionHydrated(true);
    }
  }, [editor, loadDocumentIntoEditor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const timer = window.setTimeout(() => {
      const { snapshot, documents: nextDocuments } = getDocumentsWithActiveSnapshot();
      const payload: SavedWorkspace = {
        activeDocumentId: snapshot.id,
        documents: nextDocuments,
        updatedAt: snapshot.updatedAt,
      };

      setSaveState("saving");
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
        setLastSavedAt(snapshot.updatedAt ?? null);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    documentRevision,
    editor,
    getDocumentsWithActiveSnapshot,
    plainText,
  ]);

  const addComment = () => {
    setReviewOpen(true);
    setCommentNotice("");
    if (!editor || !commentDraft.trim()) {
      return;
    }

    const target = getEditorSelectionSnapshot(editor) ?? reviewTarget;
    if (!target) {
      setCommentNotice("Select the exact words first, then add the comment.");
      return;
    }

    const { from, key: selectionKey, text: selectedText, to } = target;
    if (!selectedText) {
      setCommentNotice("Select written text first, then add the comment.");
      return;
    }

    const existingComment = findMatchingAnnotation(comments, selectedText, selectionKey);
    if (existingComment) {
      setSelectedCommentId(existingComment.id);
      setSelectedIssueId(null);
      setSelectedIssueGroupIds([]);
      setSelectedReferenceId(null);
      setReviewTool("comment");
      setCommentNotice("This text already has a comment. Delete that comment before adding another one here.");
      return;
    }

    const id = createId("comment");
    editor.chain().focus().setTextSelection({ from, to }).setMark("commentMark", { commentId: id }).run();
    editor.commands.setTextSelection(to);
    setComments((current) => [
      ...current,
      {
        id,
        selectedText,
        selectionKey,
        body: commentDraft.trim(),
        createdAt: nowIso(),
        author: "Human",
        resolved: false,
      },
    ]);
    setCommentDraft("");
    setReviewTarget(target);
    setSelectedCommentId(id);
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setSelectedReferenceId(null);
    setReviewTool("comment");
  };

  const addStyleReference = () => {
    setReviewOpen(true);
    setReferenceNotice("");
    if (!editor || !referenceDraft.trim()) {
      return;
    }

    const target = getEditorSelectionSnapshot(editor) ?? reviewTarget;
    if (!target) {
      setReferenceNotice("Select the exact words first, then paste the style reference.");
      return;
    }

    const { from, key: selectionKey, text: selectedText, to } = target;
    if (!selectedText) {
      setReferenceNotice("Select written text first, then paste the style reference.");
      return;
    }

    const existingReference = findMatchingAnnotation(styleReferences, selectedText, selectionKey);
    if (existingReference) {
      setSelectedReferenceId(existingReference.id);
      setSelectedIssueId(null);
      setSelectedIssueGroupIds([]);
      setSelectedCommentId(null);
      setReviewTool("reference");
      setReferenceNotice("This text already has a style reference. Delete that reference before adding another one here.");
      return;
    }

    const id = createId("reference");
    editor.chain().focus().setTextSelection({ from, to }).setMark("referenceMark", { referenceId: id }).run();
    editor.commands.setTextSelection(to);
    setStyleReferences((current) => [
      ...current,
      {
        id,
        selectedText,
        selectionKey,
        referenceText: referenceDraft.trim(),
        createdAt: nowIso(),
      },
    ]);
    setReferenceDraft("");
    setReviewTarget(target);
    setSelectedReferenceId(id);
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setSelectedCommentId(null);
    setReviewTool("reference");
  };

  const addManualIssue = (category: IssueCategory) => {
    if (!editor) {
      return;
    }

    const { from, to } = editor.state.selection;
    if (from === to) {
      return;
    }

    const target = getEditorSelectionSnapshot(editor);
    if (!target) {
      return;
    }

    const selectedText = target.text;
    const id = createId("manual");
    const label = ISSUE_CATEGORIES[category].label;
    const reason =
      category === "other"
        ? "Custom reviewer note."
        : category === "thinking_fix"
          ? "This passage needs a thinking-rhythm rewrite, not a grammar correction."
          : category === "meaning_drift"
            ? "This edit may have changed the meaning while making the sentence sound smoother."
          : category === "brutal_cut"
            ? "This passage needs a brutally honest cut and rewrite."
          : "Manual reviewer highlight.";
    const suggestion =
      category === "other"
        ? "Add the specific fix or concern as a comment, then copy the report for the agent."
        : category === "thinking_fix"
          ? "This is not a grammar fix. It is a thinking fix. Rewrite this so the ideas move the way a real mind moves: uneven in places, punchy in others, sometimes slower. Break any pattern where the writing feels too controlled or too evenly paced."
          : category === "meaning_drift"
            ? "Check whether the revised grammar changed the claim. If the meaning is 'a difficult challenge for AI agents', keep the noun-phrase shape, such as 'a tough test for AI agents', rather than changing it to 'hard to test for AI agents'."
          : category === "brutal_cut"
            ? "Read this text I wrote: [paste here]. Be brutally honest. Tell me what's unnecessary, what's missing, what sounds generic, where you lose the reader, and what you would change if your reputation depended on this text. Rewrite it using half the words without losing the point."
          : category === "passive_voice"
            ? "Strengthen the verb. Name the actor when it matters, and prefer a strong active verb over a prepositional phrase, such as 'assess' instead of 'make an assessment of'."
        : "Revise this span according to the selected category.";
    editor
      .chain()
      .focus()
      .setMark("issueMark", {
        issueId: id,
        category,
        origin: "manual",
        severity: category === "technical_precision" || category === "meaning_drift" ? "high" : "medium",
        label,
        source: "un-AI-ing",
        reason,
        suggestion,
      })
      .run();
    setManualIssues((current) => [
      ...current,
      {
        id,
        category,
        label,
        severity: category === "technical_precision" || category === "meaning_drift" ? "high" : "medium",
        status: "open",
        origin: "manual",
        source: "un-AI-ing",
        text: selectedText,
        reason,
        suggestion,
        start: 0,
        end: 0,
      },
    ]);
    setHighlightMenuOpen(false);
    setReviewTarget(target);
    setSelectedIssueId(id);
    setSelectedIssueGroupIds([id]);
    setSelectedCommentId(null);
    setSelectedReferenceId(null);
    setReviewTool(null);
    setReviewOpen(true);
  };

  const toggleHighlightMenu = () => {
    setFeedbackOpen(false);
    setDocsMenuOpen(false);
    setVersionsMenuOpen(false);

    const rect = highlightButtonRef.current?.getBoundingClientRect();

    if (rect) {
      const menuWidth = 270;
      const estimatedHeight = Math.min(390, window.innerHeight - 24);
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - menuWidth / 2), window.innerWidth - menuWidth - 12);
      const opensBelow = rect.bottom + estimatedHeight < window.innerHeight - 12;
      const top = opensBelow ? rect.bottom + 8 : Math.max(12, rect.top - estimatedHeight - 8);
      setHighlightMenuPosition({ left, top });
    }

    setHighlightMenuOpen((open) => !open);
  };

  const removeHighlight = (issue: Issue | null) => {
    if (!editor || !issue) {
      return;
    }

    applyingMarks.current = true;
    removeMarkByAttribute(editor, "issueMark", "issueId", issue.id);
    applyingMarks.current = false;
    if (issue.origin === "scanner") {
      const ignoreKeys = [issue.id, getIssueIgnoreKey(issue)];
      setIgnoredIssueIds((current) => Array.from(new Set([...current, ...ignoreKeys])));
    }
    setIssues((current) => current.filter((item) => item.id !== issue.id));
    setManualIssues((current) => current.filter((item) => item.id !== issue.id));
    const remainingGroupIds = selectedIssueGroupIds.filter((issueId) => issueId !== issue.id);
    setSelectedIssueGroupIds(remainingGroupIds);
    setSelectedIssueId(remainingGroupIds[0] ?? null);
    if (!remainingGroupIds.length) {
      setReviewTarget(null);
      setReviewTool(null);
    }
  };

  const clearAllMarkup = () => {
    if (!editor) {
      return;
    }

    const ignoreKeys = activeIssues
      .filter((issue) => issue.origin === "scanner")
      .flatMap((issue) => [issue.id, getIssueIgnoreKey(issue)]);

    scanRequestId.current += 1;
    applyingMarks.current = true;
    removeAllReviewMarks(editor);
    editor.commands.setTextSelection(Math.min(1, editor.state.doc.content.size));
    applyingMarks.current = false;
    window.getSelection()?.removeAllRanges();
    liveDraftHtml.current = editor.getHTML();

    setIgnoredIssueIds((current) => Array.from(new Set([...current, ...ignoreKeys])));
    setIssues([]);
    setManualIssues([]);
    setComments([]);
    setStyleReferences([]);
    setMarginNoteLayout({});
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setSelectedCommentId(null);
    setSelectedReferenceId(null);
    setReviewTarget(null);
    setReviewTool(null);
    setCommentDraft("");
    setReferenceDraft("");
    setCommentNotice("");
    setReferenceNotice("");
    setHighlightMenuOpen(false);
    setIssueHoverHint(null);
    setEraserMode(false);
    setReviewOpen(false);
  };

  const applyIssueReplacement = (issue: Issue, replacement: string) => {
    if (!editor || !replacement.trim()) {
      return;
    }

    const snapshot = findMarkSnapshotByAttribute(editor, "issueMark", "issueId", issue.id);
    if (!snapshot) {
      return;
    }

    applyingMarks.current = true;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: snapshot.from, to: snapshot.to })
      .insertContent(replacement)
      .run();
    applyingMarks.current = false;

    setIssues((current) => current.filter((item) => item.id !== issue.id));
    setManualIssues((current) => current.filter((item) => item.id !== issue.id));
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setReviewTool(null);
    setReviewTarget(null);
    window.setTimeout(() => void runScan(editor), 80);
  };

  const deleteComment = (comment: CommentThread) => {
    if (!editor) {
      return;
    }

    applyingMarks.current = true;
    removeMarkByAttribute(editor, "commentMark", "commentId", comment.id);
    applyingMarks.current = false;
    setComments((current) => current.filter((item) => item.id !== comment.id));
    setMarginNoteLayout((current) => {
      const next = { ...current };
      delete next[comment.id];
      return next;
    });
    if (selectedCommentId === comment.id) {
      setSelectedCommentId(null);
      setReviewTool(null);
    }
  };

  const deleteStyleReference = (reference: StyleReference) => {
    if (!editor) {
      return;
    }

    applyingMarks.current = true;
    removeMarkByAttribute(editor, "referenceMark", "referenceId", reference.id);
    applyingMarks.current = false;
    setStyleReferences((current) => current.filter((item) => item.id !== reference.id));
    setMarginNoteLayout((current) => {
      const next = { ...current };
      delete next[reference.id];
      return next;
    });
    if (selectedReferenceId === reference.id) {
      setSelectedReferenceId(null);
      setReviewTool(null);
    }
  };

  const handleUpload = async (file: File) => {
    if (!editor) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    setUploading(true);
    setUploadNotice(`Opening ${file.name}...`);

    let html = "";

    try {
      html = await getUploadHtml(file);
    } catch (error) {
      setUploadNotice(error instanceof Error ? error.message : "un-AI-ing could not import this file.");
      setUploading(false);
      return;
    }

    const nextTitle = file.name.replace(/\.[^.]+$/, "");
    const documentHtml = html || "<p></p>";
    const { documents: nextDocuments } = getDocumentsWithActiveSnapshot();
    const nextDocument = createSavedDocument({
      title: nextTitle,
      documentHtml,
      plainText: htmlToText(documentHtml),
      sourceContext: createSourceContextFromHtml("upload", file.name, documentHtml, {
        extension,
        importedAt: nowIso(),
        mimeType: file.type || undefined,
      }),
    });

    setDocuments([...nextDocuments, nextDocument]);
    setActiveDocumentId(nextDocument.id);
    loadDocumentIntoEditor(nextDocument);
    setUploadNotice(
      extension === "doc"
        ? "Imported readable text from the older Word file. Check the formatting before review."
        : `${file.name} was added to Docs and is ready to review.`,
    );
    setUploading(false);
    window.setTimeout(() => setUploadNotice(""), 4000);
  };

  const saveRewriteVersion = (rating: RewriteRating = "unrated", note = "") => {
    if (!editor) {
      return;
    }

    const { text } = getTextMap(editor);
    const localVersionNumber = rewriteVersions.filter((version) => version.source !== "folder").length + 1;
    const nextVersion: RewriteVersion = {
      id: createId("rewrite"),
      label: `Version ${localVersionNumber}`,
      createdAt: nowIso(),
      text,
      html: editor.getHTML(),
      issueCount: activeIssues.length,
      commentCount: comments.length,
      rating,
      note: note.trim(),
      source: "local",
      documentId: activeDocumentId,
      documentTitle: title,
    };

    if (activeVersionIdRef.current === "current") {
      liveDraftHtml.current = editor.getHTML();
    }
    setRewriteVersions((current) => mergeRewriteVersions(current, [nextVersion]));
    activeVersionIdRef.current = nextVersion.id;
    setActiveVersionId(nextVersion.id);
    setCompareRightVersionId(nextVersion.id);
    return nextVersion;
  };

  const saveCurrentDraftVersion = () => {
    const nextVersion = saveRewriteVersion();
    if (!nextVersion) {
      return;
    }

    setFeedbackOpen(false);
    setDocsMenuOpen(false);
    setVersionsMenuOpen(true);
    setPendingDeleteVersionId(null);
  };

  const submitPageFeedback = () => {
    saveRewriteVersion(rewriteRating, rewriteNote);
    setRewriteNote("");
    setRewriteRating("unrated");
    setFeedbackOpen(false);
  };

  const switchDocument = (documentId: string) => {
    if (!editor || documentId === activeDocumentId) {
      return;
    }

    const { documents: nextDocuments } = getDocumentsWithActiveSnapshot();
    const nextDocument = nextDocuments.find((document) => document.id === documentId);
    if (!nextDocument) {
      return;
    }

    setDocuments(nextDocuments);
    setActiveDocumentId(nextDocument.id);
    loadDocumentIntoEditor(nextDocument);
  };

  const startNewDocument = () => {
    if (!editor) {
      return;
    }

    const { documents: nextDocuments } = getDocumentsWithActiveSnapshot();
    const nextDocument = createBlankSavedDocument();

    setDocuments([...nextDocuments, nextDocument]);
    setActiveDocumentId(nextDocument.id);
    loadDocumentIntoEditor(nextDocument);
  };

  const deleteDocument = (documentId: string) => {
    if (!editor) {
      return;
    }

    const { documents: snapshottedDocuments } = getDocumentsWithActiveSnapshot();
    const targetDocument = snapshottedDocuments.find((document) => document.id === documentId);
    if (!targetDocument) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${targetDocument.title || "Untitled draft"}" and its local versions from this browser?`,
    );
    if (!confirmed) {
      return;
    }

    const remainingDocuments = snapshottedDocuments.filter((document) => document.id !== documentId);
    const nextDocuments = remainingDocuments.length ? remainingDocuments : [createBlankSavedDocument()];
    const nextActiveDocument =
      documentId === activeDocumentId
        ? nextDocuments[0]
        : nextDocuments.find((document) => document.id === activeDocumentId) ?? nextDocuments[0];

    setDocuments(nextDocuments);
    setActiveDocumentId(nextActiveDocument.id);

    if (documentId === activeDocumentId) {
      loadDocumentIntoEditor(nextActiveDocument);
    }
  };

  const deleteVersion = (versionId: string) => {
    const version = rewriteVersions.find((item) => item.id === versionId);
    if (!version) {
      return;
    }

    if (activeVersionId === versionId) {
      switchFileVersion("current");
    }

    if (version.source === "folder") {
      const versionKey = getRewriteVersionKey(version);
      setHiddenFolderRewriteKeys((current) => Array.from(new Set([...current, versionKey])));
    }

    setRewriteVersions((current) => current.filter((item) => item.id !== versionId));
    setCompareRightVersionId((current) => (current === versionId ? "" : current));
    setCompareLeftVersionId((current) => (current === versionId ? "current" : current));
    setPendingDeleteVersionId(null);
  };

  const openComparePanel = () => {
    if (!rewriteVersions.length) {
      return;
    }

    setCompareLeftVersionId("current");
    setCompareRightVersionId(activeVersionId === "current" ? rewriteVersions[0]?.id ?? "" : activeVersionId);
    setPendingDeleteVersionId(null);
    setVersionsMenuOpen(false);
    setCompareOpen(true);
  };

  const chooseVersion = (versionId: string) => {
    switchFileVersion(versionId);
    setPendingDeleteVersionId(null);
    setVersionsMenuOpen(false);
  };

  const openMarginNote = (kind: "comment" | "reference", id: string) => {
    if (kind === "comment") {
      setSelectedCommentId(id);
      setSelectedReferenceId(null);
      setSelectedIssueId(null);
      setSelectedIssueGroupIds([]);
      setReviewTool("comment");
    }

    if (kind === "reference") {
      setSelectedReferenceId(id);
      setSelectedCommentId(null);
      setSelectedIssueId(null);
      setSelectedIssueGroupIds([]);
      setReviewTool("reference");
    }

    setReviewOpen(true);
  };

  const changeMarginNoteSize = (id: string, delta: number, fallbackLayout: MarginNoteLayout) => {
    setMarginNoteLayout((current) => {
      const existing = current[id];
      const currentSize = existing?.size ?? defaultMarginNoteSize;
      const nextSize = clampMarginNoteSize(currentSize + delta);
      const currentWidth = marginNoteBaseWidth * currentSize;
      const nextWidth = marginNoteBaseWidth * nextSize;
      const sheetWidth = paperSheetRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      const currentLeft = existing?.left ?? fallbackLayout.left ?? marginNoteInset;
      const nextLeft = clamp(
        currentLeft - (nextWidth - currentWidth) / 2,
        marginNoteInset,
        Math.max(marginNoteInset, sheetWidth - nextWidth - marginNoteInset),
      );

      return {
        ...current,
        [id]: {
          ...fallbackLayout,
          ...existing,
          left: nextLeft,
          size: nextSize,
        },
      };
    });
  };

  const beginMarginNoteDrag = (
    kind: "comment" | "reference",
    id: string,
    fallbackLayout: MarginNoteLayout,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    const currentLayout = marginNoteLayout[id] ?? fallbackLayout;
    const cardRect = event.currentTarget.getBoundingClientRect();
    marginNoteDrag.current = {
      kind,
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: currentLayout.top,
      startLeft: currentLayout.left ?? fallbackLayout.left ?? marginNoteInset,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingMarginNoteId(id);
  };

  const moveMarginNote = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = marginNoteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const sheet = paperSheetRef.current;
    const sheetRect = sheet?.getBoundingClientRect();
    const sheetWidth = sheetRect?.width ?? window.innerWidth;
    const sheetHeight = sheet ? Math.max(sheet.scrollHeight, sheetRect?.height ?? 0) : window.innerHeight;
    const maxLeft = Math.max(marginNoteInset, sheetWidth - drag.cardWidth - marginNoteInset);
    const maxTop = Math.max(marginNoteInset, sheetHeight - drag.cardHeight - marginNoteInset);
    const nextLeft = clamp(drag.startLeft + event.clientX - drag.startX, marginNoteInset, maxLeft);
    const nextTop = clamp(drag.startTop + event.clientY - drag.startY, marginNoteInset, maxTop);
    const movedDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);

    drag.moved = drag.moved || movedDistance > 4;
    event.preventDefault();

    setMarginNoteLayout((current) => {
      const existing = current[drag.id];
      return {
        ...current,
        [drag.id]: {
          ...existing,
          side:
            typeof existing?.anchorX === "number" && nextLeft + drag.cardWidth / 2 < existing.anchorX ? "left" : "right",
          left: nextLeft,
          top: nextTop,
          size: existing?.size,
          userMoved: true,
        },
      };
    });
  };

  const endMarginNoteDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = marginNoteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    marginNoteDrag.current = null;
    setDraggingMarginNoteId(null);

    if (!drag.moved) {
      openMarginNote(drag.kind, drag.id);
    }
  };

  const cancelMarginNoteDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = marginNoteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    marginNoteDrag.current = null;
    setDraggingMarginNoteId(null);
  };

  const beginToolDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    toolDrag.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setToolWidgetOpen(true);
    setToolWidgetDragging(true);
    setToolDragY(event.clientY);
  };

  const moveToolDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!toolDrag.current || toolDrag.current.pointerId !== event.pointerId) {
      return;
    }

    setToolDragY(event.clientY);
  };

  const endToolDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!toolDrag.current || toolDrag.current.pointerId !== event.pointerId) {
      return;
    }

    const nextDock: ToolDock = event.clientY < window.innerHeight / 2 ? "top" : "bottom";
    toolDrag.current = null;
    setToolDock(nextDock);
    setToolWidgetDragging(false);
    setToolDragY(null);
    setToolWidgetOpen(true);
  };

  const openReviewPanel = (tool: ReviewTool = null) => {
    const target = editor ? getEditorSelectionSnapshot(editor) : null;
    setReviewTarget(target);
    setSelectedIssueId(null);
    setSelectedIssueGroupIds([]);
    setSelectedCommentId(null);
    setSelectedReferenceId(null);
    setReviewTool(tool);
    setCommentNotice(tool === "comment" && !target ? "Select words on the page first, then add a comment." : "");
    setReferenceNotice(tool === "reference" && !target ? "Select words on the page first, then add a style reference." : "");
    setReviewOpen(true);
  };

  const beginReviewDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select")) {
      return;
    }

    reviewDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: reviewPosition.x,
      originY: reviewPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveReviewPanel = (event: ReactPointerEvent<HTMLElement>) => {
    if (!reviewDrag.current || reviewDrag.current.pointerId !== event.pointerId) {
      return;
    }

    const nextX = reviewDrag.current.originX + event.clientX - reviewDrag.current.startX;
    const nextY = reviewDrag.current.originY + event.clientY - reviewDrag.current.startY;
    setReviewPosition(clampReviewPosition({ x: nextX, y: nextY }));
  };

  const endReviewDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (reviewDrag.current?.pointerId === event.pointerId) {
      reviewDrag.current = null;
    }
  };

  const switchFileVersion = (versionId: string) => {
    if (!editor) {
      return;
    }

    if (activeVersionIdRef.current === "current") {
      liveDraftHtml.current = editor.getHTML();
    }

    const html =
      versionId === "current"
        ? liveDraftHtml.current ?? editor.getHTML()
        : rewriteVersions.find((version) => version.id === versionId)?.html;

    if (!html) {
      return;
    }

    loadingVersion.current = true;
    applyingMarks.current = true;
    editor.commands.setContent(html);
    applyingMarks.current = false;
    activeVersionIdRef.current = versionId;
    setActiveVersionId(versionId);
    setSelectedIssueId(null);
    setSelectedCommentId(null);
    setSelectedReferenceId(null);
    window.setTimeout(() => {
      loadingVersion.current = false;
      void runScan(editor);
    }, 50);
  };

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    const route = initialRouteRef.current;
    const routeDocId = route?.docId ?? "";
    const routeVersionId = route?.versionId || currentVersionId;

    if (!initialRouteAppliedRef.current) {
      if (routeDocId && activeDocumentId !== routeDocId) {
        const targetDocument = documents.find((document) => document.id === routeDocId);
        if (!targetDocument || !editor) {
          return;
        }

        const { documents: nextDocuments } = getDocumentsWithActiveSnapshot();
        const nextDocument = nextDocuments.find((document) => document.id === routeDocId) ?? targetDocument;
        setDocuments(nextDocuments);
        setActiveDocumentId(nextDocument.id);
        loadDocumentIntoEditor(nextDocument);
        return;
      }

      if (routeVersionId !== currentVersionId && activeVersionId !== routeVersionId) {
        if (!editor) {
          return;
        }

        if (rewriteVersions.some((version) => version.id === routeVersionId)) {
          switchFileVersion(routeVersionId);
        }
        initialRouteAppliedRef.current = true;
        return;
      }

      initialRouteAppliedRef.current = true;
    }

    writeWorkspaceRouteToUrl(activeDocumentId, activeVersionId);
  }, [
    activeDocumentId,
    activeVersionId,
    documents,
    editor,
    getDocumentsWithActiveSnapshot,
    loadDocumentIntoEditor,
    rewriteVersions,
    sessionHydrated,
    switchFileVersion,
  ]);

  const buildCodexReviewPrompt = () => {
    if (!editor) {
      return "";
    }

    const plainDraft = getTextMap(editor).text;
    const documentHtml = editor.getHTML();
    const currentIssueSummary = activeIssues.length
      ? activeIssues
          .map(
            (issue, index) =>
              `${index + 1}. ${issue.label}${issue.source ? ` (${issue.source})` : ""}\nText: "${issue.text}"\nWhy: ${issue.reason}`,
          )
          .join("\n\n")
      : "No current issues. Review from scratch.";

    return `You are Codex reviewing a un-AI-ing draft.

Your job is NOT to rewrite the draft. Your job is to annotate writing-style issues only so a human can review your judgement.

Create an agent review file that un-AI-ing can load back into the app. This review will override existing human review annotations when loaded, so make your own independent pass.

Style-only scope:
- Focus on prose-level fixes: wording, sentence rhythm, tone, clarity, concision, grammar, precision, and AI-sounding patterns.
- Do not mark structural or formatting issues: headings, section order, paragraph breaks, page layout, numbering, bullet/list formatting, table layout, citation formatting, title hierarchy, Word/PDF import artifacts, or missing/reordered sections.
- If a problem is only about document structure or visual formatting, leave it unmarked.
- If an issue mixes style with structure, comment only on the local writing-style problem and ignore the structure or formatting concern.

What to mark:
1. Highlight writing-style issues that matter: AI-sounding wording, weak sentence shapes, passive voice, vague technical language, over-complex sentences, over-explaining, under-explaining, style-guide problems, and sentences where the point needs clearer wording.
2. Add comments where a human reviewer should understand your reasoning. The app already displays selectedText above the comment, so do not quote, paste, or restate the selected text inside the comment body. Start with the reason or recommendation.
3. Do not add style references. Style references are only for user-provided comparison samples from other writing. Codex review must leave styleReferences empty.
4. Keep the document text, document structure, and document formatting unchanged.
5. Do not invent facts, legal thresholds, source claims, or obligations not present in the draft.
6. Keep documentHtml and plainText exactly as provided so un-AI-ing can restore this document from the project folder later.

Use only these highlight categories:
${manualIssueCategoryOrder.map((category) => `- ${category}: ${ISSUE_CATEGORIES[category].label}`).join("\n")}

Apply those categories only to writing-style problems. Do not use them to request changes to headings, sections, layout, spacing, list structure, tables, citations, or imported document formatting.

Use severities: high, medium, low.

Very important span rule:
- Every selectedText must be an exact substring from DRAFT TEXT.
- If the same selectedText appears more than once, add occurrence as a 1-based number.
- Prefer concise spans over whole paragraphs.

SAVE THE REVIEW INTO PAPER FIXER
Use your file-writing tool to save one JSON file into:
public/agent-reviews/

Use a filename like:
codex-review-YYYY-MM-DD-HHMMSS-short-title.json

Then read public/agent-reviews/manifest.json, keep every existing entry, and append the new review entry. Do not replace the manifest with only the latest review.

Review JSON shape:
{
  "docId": "${activeDocumentId}",
  "id": "codex-review-YYYY-MM-DD-HHMMSS-short-title",
  "label": "Codex review",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
  "title": "${title.replace(/"/g, "'")}",
  "note": "Short summary of your review judgement",
  "documentHtml": ${JSON.stringify(documentHtml)},
  "plainText": ${JSON.stringify(plainDraft)},
  "issues": [
    {
      "category": "ai_jargon",
      "severity": "medium",
      "selectedText": "exact text from the draft",
      "occurrence": 1,
      "reason": "Why this span is a problem",
      "suggestion": "What the human should consider changing"
    }
  ],
  "comments": [
    {
      "selectedText": "exact text from the draft",
      "occurrence": 1,
      "body": "A reviewer-facing comment that does not repeat selectedText"
    }
  ],
  "styleReferences": []
}

Manifest shape:
{
  "reviews": [
    {
      "id": "codex-review-YYYY-MM-DD-HHMMSS-short-title",
      "label": "Codex review",
      "file": "codex-review-YYYY-MM-DD-HHMMSS-short-title.json",
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
      "docId": "${activeDocumentId}",
      "title": "${title.replace(/"/g, "'")}"
    }
  ]
}

After saving the review file and manifest, reply briefly with the saved filename and counts of issues and comments.

DOCUMENT ID
${activeDocumentId}

TITLE
${title}

CURRENT TOOL/HUMAN MARKUP TO IGNORE OR IMPROVE ON
${currentIssueSummary}

DRAFT TEXT
${plainDraft}
`;
  };

  const applyCodexReview = useCallback(
    (payload: AgentReviewPayload) => {
      if (!editor) {
        return false;
      }

      scanRequestId.current += 1;
      applyingMarks.current = true;
      removeAllReviewMarks(editor);
      const result = applyAgentReviewPayload(editor, payload);
      editor.commands.setTextSelection(Math.min(1, editor.state.doc.content.size));
      applyingMarks.current = false;
      window.getSelection()?.removeAllRanges();
      liveDraftHtml.current = editor.getHTML();

      setIgnoredIssueIds([]);
      setIssues([]);
      setManualIssues(result.manualIssues);
      setComments(result.comments);
      setStyleReferences(result.styleReferences);
      setMarginNoteLayout({});
      setSelectedIssueId(null);
      setSelectedIssueGroupIds([]);
      setSelectedCommentId(null);
      setSelectedReferenceId(null);
      setReviewTarget(null);
      setReviewTool(null);
      setReviewOpen(false);
      setCommentDraft("");
      setReferenceDraft("");
      setCommentNotice("");
      setReferenceNotice("");
      setIssueHoverHint(null);
      setCodexReviewState("loaded");
      setCodexReviewStartedAt(null);
      setCodexReviewNotice(
        `Codex review loaded: ${result.manualIssues.length} highlights and ${result.comments.length} comments.${
          result.unmatched.length ? ` ${result.unmatched.length} spans could not be matched.` : ""
        }`,
      );
      setDocumentRevision((revision) => revision + 1);

      window.setTimeout(() => void runScan(editor), 80);
      window.setTimeout(() => setCodexReviewState("idle"), 6500);
      return true;
    },
    [editor, runScan],
  );

  const loadLatestCodexReview = useCallback(
    async (quiet = false) => {
      if (!editor) {
        return false;
      }

      try {
        const manifestResponse = await fetch(`${agentReviewManifestPath}?t=${Date.now()}`, { cache: "no-store" });
        if (!manifestResponse.ok) {
          return false;
        }

        const manifest = (await manifestResponse.json()) as AgentReviewManifest;
        const since = codexReviewStartedAt ? Date.parse(codexReviewStartedAt) : 0;
        const candidates = (Array.isArray(manifest.reviews) ? manifest.reviews : [])
          .filter((entry) => entry.file.endsWith(".json"))
          .filter(
            (entry) =>
              !entry.docId ||
              entry.docId === activeDocumentId ||
              (entry.title && normalizeDocumentTitle(entry.title) === normalizeDocumentTitle(title)),
          )
          .filter((entry) => (since ? Date.parse(entry.createdAt ?? "") >= since - 2000 : true))
          .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));

        for (const entry of candidates) {
          const response = await fetch(`/agent-reviews/${entry.file}?t=${Date.now()}`, { cache: "no-store" });
          if (!response.ok) {
            continue;
          }

          const payload = (await response.json()) as AgentReviewPayload;
          if (
            payload.docId &&
            payload.docId !== activeDocumentId &&
            normalizeDocumentTitle(payload.title ?? "") !== normalizeDocumentTitle(title)
          ) {
            continue;
          }

          return applyCodexReview(payload);
        }
      } catch {
        if (!quiet) {
          setCodexReviewState("error");
          setCodexReviewNotice("Codex review could not be loaded. Check the review file and manifest.");
        }
      }

      return false;
    },
    [activeDocumentId, applyCodexReview, codexReviewStartedAt, editor, title],
  );

  const requestCodexReview = async () => {
    const prompt = buildCodexReviewPrompt();
    if (!prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    const startedAt = nowIso();
    setCodexReviewStartedAt(startedAt);
    setCodexReviewState("waiting");
    setCodexReviewNotice("Codex review copied. Waiting for the saved review...");
  };

  useEffect(() => {
    if (codexReviewState !== "waiting") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadLatestCodexReview(true);
    }, 2200);

    void loadLatestCodexReview(true);

    return () => window.clearInterval(timer);
  }, [codexReviewState, loadLatestCodexReview]);

  const buildAgentReport = () => {
    if (!editor) {
      return "";
    }

    const plainDraft = getTextMap(editor).text;
    const fleschKincaidGrade = calculateFleschKincaidGrade(plainDraft);
    const fleschKincaidTarget =
      fleschKincaidGrade === null
        ? "not enough text to check"
        : fleschKincaidGrade <= 10
          ? "at or below target; preserve authority and technical precision"
          : "above target; revise unclear or overloaded sentences during rewrite";
    const issueById = new Map(activeIssues.map((issue) => [issue.id, issue]));
    const draftMarkup = getDraftWithInlineMarkup(editor, issueById);

    const issueLines = activeIssues.length
      ? [
          "Every highlighted issue is embedded directly in the draft as [FIX] markup. Use this section as a summary only, not as a second set of instructions.",
          "",
          "Summary by type:",
          ...categoryOrder
            .map((category) => {
              const count = activeIssues.filter((issue) => getIssueDisplayCategory(issue) === category).length;
              return count ? `- ${ISSUE_CATEGORIES[category].shortLabel}: ${count}` : "";
            })
            .filter(Boolean),
          ...(() => {
            const manualHighlights = activeIssues.filter((issue) => issue.origin === "manual");
            return manualHighlights.length
              ? [
                  "",
                  "Manual reviewer highlights:",
                  ...manualHighlights.map(
                    (issue, index) =>
                      `${index + 1}. ${issue.label}: "${issue.text}" — ${issue.suggestion}${
                        issue.replacements?.length ? ` Recommended edits: ${issue.replacements.join(", ")}` : ""
                      }`,
                  ),
                ]
              : [];
          })(),
        ].join("\n")
      : "No open highlighted issues.";

    const commentLines = comments.length
      ? comments
          .map((comment, index) => `${index + 1}. "${comment.selectedText}"\nComment: ${comment.body}`)
          .join("\n\n")
      : "No comments.";

    const referenceLines = styleReferences.length
      ? styleReferences
          .map(
            (reference, index) =>
              `${index + 1}. Draft span: "${reference.selectedText}"\nStyle sample: ${reference.referenceText}\nInstruction: Match rhythm, sentence shape, specificity, and formality only. Preserve the draft's meaning and do not copy the sample's facts or distinctive wording.`,
          )
          .join("\n\n---\n\n")
      : "No style references.";

    const deleteLines = draftMarkup.deletes.length
      ? draftMarkup.deletes
          .map((deleteText, index) => `${index + 1}. Delete this scribbled-out text: "${deleteText}"`)
          .join("\n")
      : "No scribbled delete marks.";

    const versionLines = rewriteVersions.length
      ? rewriteVersions
          .slice(0, 2)
          .map(
            (version, index) =>
              `${index + 1}. ${version.label} (${new Date(version.createdAt).toLocaleString()})\nOverall judgement: ${version.rating}\nOpen issue count at capture: ${version.issueCount}\nReviewer note: ${version.note || "No note"}\nText excerpt:\n${truncatePromptText(version.text)}`,
          )
          .join("\n\n---\n\n")
      : "No rewrite versions captured yet.";

    const currentDocumentHtml = editor.getHTML();
    const sourceContext = activeDocument?.sourceContext;
    const sourceHtml = sourceContext?.originalHtml?.trim() || currentDocumentHtml;
    const sourceCss = sourceContext?.originalCss?.trim() || extractOriginalCssFromHtml(sourceHtml);
    const documentUrl = createWorkspaceRouteUrl(activeDocumentId, activeVersionId).toString();
    const sourceContextLines = [
      `Document URL: ${documentUrl}`,
      `Source kind: ${sourceContext?.kind ?? "unknown"}`,
      `Source name: ${sourceContext?.name ?? title}`,
      `Source URL: ${sourceContext?.sourceUrl ?? "not provided"}`,
      `MIME type: ${sourceContext?.mimeType ?? "not provided"}`,
      `Extension: ${sourceContext?.extension ?? "not provided"}`,
      `Imported at: ${sourceContext?.importedAt ?? "not provided"}`,
      "",
      "Use the HTML/CSS below as the document scaffold. Preserve headings, lists, tables, code blocks, classes, inline styles, and stylesheet references unless a reviewer mark requires a structural change. Rewrite the text inside the scaffold; do not rebuild a simpler document from the plain-text draft when this scaffold is available.",
      "",
      "Original source CSS / stylesheet references:",
      fencedPromptBlock("css", sourceCss, "No original CSS or stylesheet references were captured."),
      "",
      "Original source HTML scaffold:",
      fencedPromptBlock("html", sourceHtml, "No original source HTML was captured."),
      "",
      "Current editor HTML scaffold:",
      fencedPromptBlock("html", currentDocumentHtml, "No current editor HTML was captured."),
    ].join("\n");

    const replacements: Record<string, string> = {
      TITLE: title,
      DOC_ID: activeDocumentId,
      WORD_COUNT: String(countWords(plainDraft)),
      FK_GRADE: formatFleschKincaidGrade(fleschKincaidGrade),
      FK_TARGET: fleschKincaidTarget,
      ISSUE_COUNT: String(activeIssues.length),
      COMMENT_COUNT: String(comments.length),
      REFERENCE_COUNT: String(styleReferences.length),
      DELETE_COUNT: String(draftMarkup.deletes.length),
      VERSION_COUNT: String(rewriteVersions.length),
      DRAFT_MARKUP: draftMarkup.text,
      DELETE_LINES: deleteLines,
      ISSUE_LINES: issueLines,
      COMMENT_LINES: commentLines,
      REFERENCE_LINES: referenceLines,
      VERSION_LINES: versionLines,
      SOURCE_CONTEXT: sourceContextLines,
    };

    return Object.entries(replacements).reduce(
      (prompt, [token, value]) => prompt.split(`{{${token}}}`).join(value),
      rewritePromptTemplate,
    );
  };

  const copyAgentReport = async () => {
    const report = buildAgentReport();
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 4000);
  };

  if (!editor) {
    return <div className="boot">Loading un-AI-ing...</div>;
  }

  const currentFontSize = editor.getAttributes("textStyle").fontSize ?? "";
  const currentBlockStyle = editor.isActive("codeBlock")
    ? "codeBlock"
    : editor.isActive("blockquote")
      ? "blockquote"
    : editor.isActive("heading", { level: 1 })
      ? "heading-1"
      : editor.isActive("heading", { level: 2 })
        ? "heading-2"
        : editor.isActive("heading", { level: 3 })
          ? "heading-3"
          : "paragraph";
  const activeAlignment = editor.isActive({ textAlign: "center" })
    ? "center"
    : editor.isActive({ textAlign: "right" })
      ? "right"
      : "left";
  const isInTable = editor.isActive("table");
  const reviewPanelTitle =
    reviewTool === "comment" ? "Comment" : reviewTool === "reference" ? "Style reference" : "Review";
  const renderIssueMarker = (category: IssueCategory) => {
    if (category === "other") {
      return <MessageSquare size={16} strokeWidth={2.2} />;
    }

    const markerKind = getIssueMarkerKind(activeIssues, category);
    const markerStyle = {
      "--marker-color": ISSUE_CATEGORIES[category].border,
    } as CSSProperties;

    if (markerKind === "underline") {
      return <span className="issue-marker underline-marker" style={markerStyle} aria-hidden="true" />;
    }

    if (markerKind === "mixed") {
      return <span className="issue-marker mixed-marker" style={markerStyle} aria-hidden="true" />;
    }

    return (
      <span
        className="issue-marker swatch"
        style={{ ...markerStyle, background: ISSUE_CATEGORIES[category].border }}
        aria-hidden="true"
      />
    );
  };

  const getMarginNoteRenderLayout = (
    note: CommentThread | StyleReference,
    fallbackSide: MarginNoteSide,
    fallbackTop: number,
  ) => {
    const currentSize = marginNoteLayout[note.id]?.size ?? defaultMarginNoteSize;
    const noteWidth = marginNoteBaseWidth * currentSize;
    const sheetWidth = paperSheetRef.current?.getBoundingClientRect().width ?? noteWidth + marginNoteInset * 2;
    const fallbackLeft =
      fallbackSide === "left"
        ? marginNoteInset
        : Math.max(marginNoteInset, sheetWidth - noteWidth - marginNoteInset);

    return {
      side: marginNoteLayout[note.id]?.side ?? fallbackSide,
      top: marginNoteLayout[note.id]?.top ?? fallbackTop,
      left: marginNoteLayout[note.id]?.left ?? fallbackLeft,
      size: currentSize,
      userMoved: marginNoteLayout[note.id]?.userMoved,
      anchorX: marginNoteLayout[note.id]?.anchorX,
      anchorY: marginNoteLayout[note.id]?.anchorY,
      targetLeft: marginNoteLayout[note.id]?.targetLeft,
      targetRight: marginNoteLayout[note.id]?.targetRight,
      targetTop: marginNoteLayout[note.id]?.targetTop,
      targetBottom: marginNoteLayout[note.id]?.targetBottom,
      targetRects: marginNoteLayout[note.id]?.targetRects,
    } satisfies MarginNoteLayout;
  };

  const getMarginNoteArrowPath = (layout: MarginNoteLayout, size: number) => {
    if (
      typeof layout.left !== "number" ||
      typeof layout.anchorX !== "number" ||
      typeof layout.anchorY !== "number"
    ) {
      return "";
    }

    const noteWidth = marginNoteBaseWidth * size;
    const noteHeight = marginNoteBaseHeight * size;
    const noteLeft = layout.left;
    const noteRight = noteLeft + noteWidth;
    const noteTop = layout.top;
    const noteBottom = noteTop + noteHeight;
    const noteCenterX = noteLeft + noteWidth / 2;
    const noteCenterY = noteTop + noteHeight / 2;
    const targetLeft = layout.targetLeft ?? layout.anchorX;
    const targetRight = layout.targetRight ?? layout.anchorX;
    const targetTop = layout.targetTop ?? layout.anchorY;
    const targetBottom = layout.targetBottom ?? layout.anchorY;
    const targetCenterX = (targetLeft + targetRight) / 2;
    const targetCenterY = (targetTop + targetBottom) / 2;
    const horizontalGap = Math.abs(noteCenterX - targetCenterX);
    const verticalGap = Math.abs(noteCenterY - targetCenterY);

    let startX = targetCenterX;
    let startY = targetCenterY;
    let endX = noteCenterX;
    let endY = noteCenterY;

    if (horizontalGap >= verticalGap * 0.55) {
      const noteIsRight = noteCenterX >= targetCenterX;
      startX = noteIsRight ? targetRight + 8 : targetLeft - 8;
      startY = clamp(noteCenterY, targetTop - 10, targetBottom + 10);
      endX = noteIsRight ? noteLeft - 8 : noteRight + 8;
      endY = clamp(startY + (noteCenterY - startY) * 0.52, noteTop + 18, noteBottom - 14);
    } else {
      const noteIsLower = noteCenterY >= targetCenterY;
      startX = clamp(noteCenterX, targetLeft - 10, targetRight + 10);
      startY = noteIsLower ? targetBottom + 8 : targetTop - 8;
      endX = clamp(startX + (noteCenterX - startX) * 0.5, noteLeft + 16, noteRight - 16);
      endY = noteIsLower ? noteTop - 8 : noteBottom + 8;
    }

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const wobble = Math.min(marginNoteBaseArrowWidth, Math.max(16, distance * 0.18));
    const c1X = startX + dx * 0.35;
    const c1Y = startY + dy * 0.08 + (dy >= 0 ? -wobble : wobble) * 0.2;
    const c2X = startX + dx * 0.68;
    const c2Y = startY + dy * 0.92 + (dx >= 0 ? wobble : -wobble) * 0.16;

    return `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${c1X.toFixed(1)} ${c1Y.toFixed(1)} ${c2X.toFixed(1)} ${c2Y.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  };

  const getReferenceRingPath = (
    rect: { left: number; right: number; top: number; bottom: number },
    index: number,
  ) => {
    const padX = 7;
    const padY = 4;
    const left = rect.left - padX;
    const right = rect.right + padX;
    const top = rect.top - padY;
    const bottom = rect.bottom + padY;
    const width = right - left;
    const height = bottom - top;
    const wobble = index % 2 === 0 ? 0.08 : -0.08;

    return [
      `M ${(left + width * 0.08).toFixed(1)} ${(top + height * (0.48 + wobble)).toFixed(1)}`,
      `C ${(left + width * 0.06).toFixed(1)} ${(top + height * 0.12).toFixed(1)} ${(left + width * 0.36).toFixed(1)} ${(top - height * 0.07).toFixed(1)} ${(left + width * 0.58).toFixed(1)} ${(top + height * 0.06).toFixed(1)}`,
      `C ${(right + width * 0.06).toFixed(1)} ${(top + height * 0.16).toFixed(1)} ${(right + width * 0.04).toFixed(1)} ${(top + height * 0.84).toFixed(1)} ${(left + width * 0.74).toFixed(1)} ${(bottom - height * 0.02).toFixed(1)}`,
      `C ${(left + width * 0.42).toFixed(1)} ${(bottom + height * 0.08).toFixed(1)} ${(left - width * 0.05).toFixed(1)} ${(bottom - height * 0.08).toFixed(1)} ${(left + width * 0.08).toFixed(1)} ${(top + height * (0.48 + wobble)).toFixed(1)}`,
    ].join(" ");
  };

  const renderReferenceRings = (reference: StyleReference) => {
    const rects = marginNoteLayout[reference.id]?.targetRects ?? [];

    return rects.map((rect, index) => (
      <path
        key={`${reference.id}-ring-${index}`}
        className="reference-ring-path"
        d={getReferenceRingPath(rect, index)}
      />
    ));
  };

  const renderMarginNoteArrow = (
    kind: "comment" | "reference",
    note: CommentThread | StyleReference,
    fallbackSide: MarginNoteSide,
    fallbackTop: number,
  ) => {
    const currentSize = marginNoteLayout[note.id]?.size ?? defaultMarginNoteSize;
    const layout = getMarginNoteRenderLayout(note, fallbackSide, fallbackTop);
    const path = getMarginNoteArrowPath(layout, currentSize);

    if (!path) {
      return null;
    }

    return (
      <path
        key={`${note.id}-arrow`}
        className="annotation-arrow-path"
        d={path}
        markerEnd={kind === "comment" ? "url(#annotation-arrow-red)" : "url(#annotation-arrow-purple)"}
        stroke={kind === "comment" ? "var(--pen-red)" : "var(--pen-purple)"}
      />
    );
  };

  const renderMarginNote = (
    kind: "comment" | "reference",
    note: CommentThread | StyleReference,
    fallbackSide: MarginNoteSide,
    fallbackTop: number,
    rotation: string,
  ) => {
    const isCommentNote = kind === "comment";
    const currentSize = marginNoteLayout[note.id]?.size ?? defaultMarginNoteSize;
    const fallbackLayout = getMarginNoteRenderLayout(note, fallbackSide, fallbackTop);
    const noteStyle = {
      top: fallbackLayout.top,
      left: fallbackLayout.left,
      transform: `rotate(${rotation})`,
      "--note-card-width": `${marginNoteBaseWidth * currentSize}px`,
      "--note-gap": `${4 * currentSize}px`,
      "--note-pad-top": `${20 * currentSize}px`,
      "--note-pad-x": `${6 * currentSize}px`,
      "--note-pad-bottom": `${5 * currentSize}px`,
      "--note-body-size": `${21 * currentSize}px`,
      "--note-small-size": `${11 * currentSize}px`,
      "--note-tag-size": `${7 * currentSize}px`,
    } as CSSProperties;
    const noteLabel = isCommentNote ? "comment" : "style";
    const fullLabel = isCommentNote ? "comment" : "style reference";
    const noteBody = isCommentNote ? (note as CommentThread).body : (note as StyleReference).referenceText;
    const deleteNote = () =>
      isCommentNote ? deleteComment(note as CommentThread) : deleteStyleReference(note as StyleReference);

    return (
      <article
        key={note.id}
        className={[
          "annotation-card",
          isCommentNote ? "comment-note" : "reference-note",
          draggingMarginNoteId === note.id ? "dragging" : "",
        ].join(" ")}
        style={noteStyle}
        role="button"
        tabIndex={0}
        aria-label={`Open ${fullLabel}: ${note.selectedText}`}
        onPointerDown={(event) => beginMarginNoteDrag(kind, note.id, fallbackLayout, event)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openMarginNote(kind, note.id);
          }
        }}
      >
        <span className="annotation-drag-handle" aria-hidden="true">
          <GripHorizontal size={15} />
        </span>
        <div className="annotation-controls" aria-label={`${fullLabel} controls`}>
          <button
            type="button"
            className="annotation-control"
            title={`Make ${fullLabel} smaller`}
            aria-label={`Make ${fullLabel} smaller`}
            disabled={currentSize <= minMarginNoteSize}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              changeMarginNoteSize(note.id, -marginNoteSizeStep, fallbackLayout);
            }}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="annotation-control"
            title={`Make ${fullLabel} bigger`}
            aria-label={`Make ${fullLabel} bigger`}
            disabled={currentSize >= maxMarginNoteSize}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              changeMarginNoteSize(note.id, marginNoteSizeStep, fallbackLayout);
            }}
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            className="annotation-control danger"
            title={`Delete ${fullLabel}`}
            aria-label={`Delete ${fullLabel}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              deleteNote();
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
        <span className="note-tag">{noteLabel}</span>
        <p>{noteBody}</p>
        <small>{note.selectedText}</small>
      </article>
    );
  };

  const marginNoteItems = [
    ...comments.map((comment, index) => ({
      kind: "comment" as const,
      note: comment,
      fallbackSide: (marginNoteLayout[comment.id]?.side ?? "right") as MarginNoteSide,
      fallbackTop: marginNoteLayout[comment.id]?.top ?? 24 + index * 132,
      rotation: index % 2 === 0 ? "-1.2deg" : "1deg",
    })),
    ...styleReferences.map((reference, index) => ({
      kind: "reference" as const,
      note: reference,
      fallbackSide: (marginNoteLayout[reference.id]?.side ?? "right") as MarginNoteSide,
      fallbackTop: marginNoteLayout[reference.id]?.top ?? 24 + (comments.length + index) * 132,
      rotation: index % 2 === 0 ? "1.4deg" : "-0.8deg",
    })),
  ];

  return (
    <main
      className={[
        "app-shell",
        sidebarCollapsed ? "sidebar-collapsed" : "",
        `toolbar-dock-${toolDock}`,
      ].join(" ")}
      ref={appRef}
      onPointerMove={moveMarginNote}
      onPointerUp={endMarginNoteDrag}
      onPointerCancel={cancelMarginNoteDrag}
    >
      {codexReviewState !== "idle" && codexReviewNotice ? (
        <div className={`codex-review-status ${codexReviewState} dock-${toolDock}`} role="status" aria-live="polite">
          {codexReviewState === "waiting" ? <span className="codex-review-bar" aria-hidden="true" /> : null}
          <span className="codex-logo-mark" aria-hidden="true">C</span>
          <span>{codexReviewNotice}</span>
        </div>
      ) : null}
      <button
        type="button"
        className="sidebar-popout-tab"
        onClick={() => setSidebarCollapsed(false)}
        title="Open issue list"
        aria-label={`Open issue list, ${activeIssues.length} issues`}
      >
        <ChevronRight size={15} />
        <FileText size={15} />
        <span>{activeIssues.length}</span>
      </button>
      <aside
        className="left-panel"
      >
        <div className="brand-row">
          <img className="brand-logo" src="/un-ai-ing-logo.png" alt="un-AI-ing handwritten logo" />
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? "Expand issue list" : "Collapse issue list"}
            aria-label={sidebarCollapsed ? "Expand issue list" : "Collapse issue list"}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="issue-nav" aria-label="Issue categories">
          <button
            className={!selectedIssueId ? "nav-item active" : "nav-item"}
            title={`All issues: ${activeIssues.length}`}
            aria-label={`All issues, ${activeIssues.length}`}
            onMouseEnter={() => setSidebarTip(allIssuesTip)}
            onMouseLeave={() => setSidebarTip(null)}
            onFocus={() => setSidebarTip(allIssuesTip)}
            onBlur={() => setSidebarTip(null)}
            onClick={() => {
              setSelectedIssueId(null);
              setSelectedIssueGroupIds([]);
              setSelectedCommentId(null);
              setSelectedReferenceId(null);
              setReviewTool(null);
              setReviewOpen(true);
            }}
          >
            <FileText size={16} />
            <span>All issues</span>
            <strong>{activeIssues.length}</strong>
          </button>
          {categoryOrder.map((category) => (
            <button
              key={category}
              className="nav-item"
              title={`${ISSUE_CATEGORIES[category].shortLabel}: ${counts[category]}. ${ISSUE_CATEGORIES[category].description}`}
              aria-label={`${ISSUE_CATEGORIES[category].shortLabel}, ${counts[category]}`}
              onMouseEnter={() => setSidebarTip(ISSUE_CATEGORIES[category].description)}
              onMouseLeave={() => setSidebarTip(null)}
              onFocus={() => setSidebarTip(ISSUE_CATEGORIES[category].description)}
              onBlur={() => setSidebarTip(null)}
              onClick={() => {
                const first = activeIssues.find((issue) => getIssueDisplayCategory(issue) === category);
                setSelectedIssueId(first?.id ?? null);
                setSelectedIssueGroupIds(first ? [first.id] : []);
                setSelectedCommentId(null);
                setSelectedReferenceId(null);
                setReviewTool(null);
                setReviewOpen(true);
              }}
            >
              {renderIssueMarker(category)}
              <span>{ISSUE_CATEGORIES[category].shortLabel}</span>
              <strong>{counts[category]}</strong>
            </button>
          ))}
        </nav>

        <p className={sidebarTip ? "nav-help visible" : "nav-help"}>{sidebarTip}</p>
      </aside>

      <section className="workspace">

        {compareOpen && compareLeftVersion && compareRightVersion ? (
          <section className="compare-overlay" aria-label="Version text comparison" role="dialog" aria-modal="true">
            <div className="compare-panel">
              <header className="compare-header">
                <div>
                  <strong>Compare text</strong>
                  <span>Choose any two versions to compare</span>
                </div>
                <div className="compare-selects">
                  <label className="compare-version-select">
                    <span>Left</span>
                    <select value={compareLeftVersion.id} onChange={(event) => setCompareLeftVersionId(event.target.value)}>
                      {compareOptions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="compare-version-select">
                    <span>Right</span>
                    <select value={compareRightVersion.id} onChange={(event) => setCompareRightVersionId(event.target.value)}>
                      {compareOptions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.label}
                      </option>
                    ))}
                    </select>
                  </label>
                </div>
                <button className="mini-button" onClick={() => setCompareOpen(false)} title="Close compare">
                  <X size={15} />
                </button>
              </header>

              <div className="compare-summary">
                <span>{countWords(compareLeftVersion.text)} left words</span>
                <span>{countWords(compareRightVersion.text)} right words</span>
                <span>{compareDiff.removed} removed</span>
                <span>{compareDiff.added} added</span>
              </div>

              <div className="compare-columns">
                <article className="compare-pane">
                  <header>
                    <strong>{compareLeftVersion.label}</strong>
                    <span>Removed text is marked</span>
                  </header>
                  <div className="diff-text">
                    {compareDiff.before.map((token, index) => (
                      <span key={`${token.type}-${index}`} className={`diff-token ${token.type}`}>
                        {token.text}
                      </span>
                    ))}
                  </div>
                </article>
                <article className="compare-pane">
                  <header>
                    <strong>{compareRightVersion.label}</strong>
                    <span>Added text is marked</span>
                  </header>
                  <div className="diff-text">
                    {compareDiff.after.map((token, index) => (
                      <span key={`${token.type}-${index}`} className={`diff-token ${token.type}`}>
                        {token.text}
                      </span>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </section>
        ) : null}

        <div className="floating-edge-zone top" onMouseEnter={() => setToolWidgetOpen(true)} />
        <div className="floating-edge-zone bottom" onMouseEnter={() => setToolWidgetOpen(true)} />
        <section
          className={[
            "floating-widget-shell",
            `dock-${toolDock}`,
            toolWidgetOpen || feedbackOpen || docsMenuOpen || versionsMenuOpen ? "open" : "",
            toolWidgetDragging ? "dragging" : "",
          ].join(" ")}
          style={floatingWidgetStyle}
          onMouseEnter={() => setToolWidgetOpen(true)}
          onMouseLeave={() => {
            if (!feedbackOpen && !docsMenuOpen && !versionsMenuOpen && !toolWidgetDragging) {
              setToolWidgetOpen(false);
            }
          }}
          onFocus={() => setToolWidgetOpen(true)}
          aria-label="Floating writing tools"
        >
          {feedbackOpen ? (
            <section className="feedback-popover" aria-label="AI change feedback">
              <div className="feedback-popover-header">
                <div>
                  <strong>AI change feedback</strong>
                  <p>Write what changed and whether the rewrite helped.</p>
                </div>
                <button className="mini-button" onClick={() => setFeedbackOpen(false)} title="Close feedback">
                  <X size={14} />
                </button>
              </div>
              <div className="page-rating-row feedback-rating" aria-label="Page feedback rating">
                {(["better", "same", "worse"] as const).map((rating) => (
                  <button
                    key={rating}
                    className={rewriteRating === rating ? "rating-button active" : "rating-button"}
                    onClick={() => setRewriteRating(rating)}
                  >
                    {rating}
                  </button>
                ))}
              </div>
              <textarea
                value={rewriteNote}
                onChange={(event) => setRewriteNote(event.target.value)}
                placeholder="What did the AI change? What should the agent keep or avoid next time?"
                aria-label="Feedback on AI changes"
              />
              <div className="button-row">
                <button
                  className="text-button strong"
                  disabled={!rewriteNote.trim() && rewriteRating === "unrated"}
                  onClick={submitPageFeedback}
                >
                  Submit feedback
                </button>
                <button className="text-button" onClick={() => setFeedbackOpen(false)}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {docsMenuOpen ? (
            <section className="doc-menu compact-doc-menu" ref={docsMenuRef} role="menu" aria-label="Documents">
              <div className="doc-menu-header">
                <div>
                  <strong>Docs</strong>
                  <small>{documentOptions.length} document{documentOptions.length === 1 ? "" : "s"}</small>
                </div>
                <button type="button" className="text-button strong" onClick={startNewDocument}>
                  <Plus size={14} />
                  New
                </button>
              </div>
              <div className="doc-menu-list" role="group" aria-label="Switch document">
                {documentOptions.map((document) => (
                  <div key={document.id} className={document.id === activeDocumentId ? "doc-menu-row active" : "doc-menu-row"}>
                    <button
                      type="button"
                      className="doc-menu-item"
                      role="menuitemradio"
                      aria-checked={document.id === activeDocumentId}
                      onClick={() => switchDocument(document.id)}
                    >
                      <span>
                        <strong>{document.title}</strong>
                        <small>
                          {document.versionCount + 1} version{document.versionCount === 0 ? "" : "s"}
                          {document.reviewCount
                            ? ` · ${document.reviewCount} review${document.reviewCount === 1 ? "" : "s"}`
                            : ""}
                        </small>
                      </span>
                      {document.id === activeDocumentId ? <Check size={14} /> : null}
                    </button>
                    <button
                      type="button"
                      className="mini-button danger"
                      title={`Delete ${document.title}`}
                      aria-label={`Delete ${document.title}`}
                      onClick={() => deleteDocument(document.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {versionsMenuOpen ? (
            <section className="version-menu compact-version-menu" ref={versionMenuRef} role="menu" aria-label="Versions">
              <div className="version-menu-header">
                <div>
                  <strong>Versions</strong>
                  <small>{rewriteVersions.length + 1} version{rewriteVersions.length === 0 ? "" : "s"}</small>
                </div>
                <button
                  type="button"
                  className="text-button strong version-save-button"
                  role="menuitem"
                  onClick={saveCurrentDraftVersion}
                >
                  <Save size={14} />
                  Save current
                </button>
              </div>
              <div className="version-menu-list" role="group" aria-label="Switch document version">
                {compareOptions.map((version) => (
                  <div key={version.id} className={version.id === activeVersionId ? "version-menu-row active" : "version-menu-row"}>
                    <button
                      type="button"
                      className={version.id === activeVersionId ? "version-menu-item active" : "version-menu-item"}
                      role="menuitemradio"
                      aria-checked={version.id === activeVersionId}
                      onClick={() => chooseVersion(version.id)}
                    >
                      <span>
                        <strong>{version.label}</strong>
                        <small>{countWords(version.text)} words</small>
                      </span>
                      {version.id === activeVersionId ? <Check size={14} /> : null}
                    </button>
                    {version.id !== "current" ? (
                      pendingDeleteVersionId === version.id ? (
                        <span className="version-delete-actions" aria-label={`Confirm delete ${version.label}`}>
                          <button
                            type="button"
                            className="mini-button danger"
                            title={`Confirm delete ${version.label}`}
                            aria-label={`Confirm delete ${version.label}`}
                            onClick={() => deleteVersion(version.id)}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            className="mini-button"
                            title={`Cancel delete ${version.label}`}
                            aria-label={`Cancel delete ${version.label}`}
                            onClick={() => setPendingDeleteVersionId(null)}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="mini-button danger"
                          title={`Delete ${version.label}`}
                          aria-label={`Delete ${version.label}`}
                          onClick={() => setPendingDeleteVersionId(version.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )
                    ) : null}
                  </div>
                ))}
              </div>
              <span className="version-menu-divider" />
              <button
                type="button"
                className="version-menu-item version-compare-item"
                role="menuitem"
                disabled={!rewriteVersions.length}
                onClick={openComparePanel}
              >
                <span>
                  <strong>Compare</strong>
                </span>
                <Columns2 size={15} />
              </button>
            </section>
          ) : null}

          <div className="floating-toolbar" aria-label="Editor toolbar" ref={toolbarRef}>
            <button
              className="tool drag-tool"
              onPointerDown={beginToolDrag}
              onPointerMove={moveToolDrag}
              onPointerUp={endToolDrag}
              onPointerCancel={endToolDrag}
              title={`Drag to snap tools to the ${toolDock === "top" ? "bottom" : "top"}`}
              aria-label="Drag floating tools"
            >
              <GripHorizontal size={18} />
            </button>
            <button
              className={docsMenuOpen ? "text-button doc-trigger active" : "text-button doc-trigger"}
              onClick={() => {
                setFeedbackOpen(false);
                setVersionsMenuOpen(false);
                setDocsMenuOpen((open) => !open);
              }}
              aria-haspopup="menu"
              aria-expanded={docsMenuOpen}
              aria-label={`Open documents, ${documentOptions.length} document${documentOptions.length === 1 ? "" : "s"}`}
              title="Docs"
            >
              <FileText size={15} />
              <span className="toolbar-text-label">Docs</span>
              <span className="version-count">{documentOptions.length}</span>
              <ChevronDown size={13} />
            </button>
            <input
              className="toolbar-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Document title"
            />
            <label
              className={uploading ? "tool toolbar-file-button uploading" : "tool toolbar-file-button"}
              title={uploadNotice || (uploading ? "Importing file..." : "Upload a Word document, PDF, or text file")}
              aria-label={uploadNotice || (uploading ? "Importing file" : "Upload a Word document, PDF, or text file")}
            >
              <Upload size={16} />
              <input
                type="file"
                accept={uploadAccept}
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUpload(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
            <button
              className="tool"
              onClick={() => downloadFile(`${title}.html`, editor.getHTML(), "text/html")}
              title="Download document as HTML"
              aria-label="Download document as HTML"
            >
              <Download size={16} />
            </button>
            <span className="divider" />
            <button
              className={feedbackOpen ? "text-button feedback-trigger active" : "text-button feedback-trigger"}
              onClick={() => setFeedbackOpen((open) => !open)}
              aria-expanded={feedbackOpen}
              title="Page feedback"
            >
              <FilePenLine size={15} />
              <span className="toolbar-text-label">Page feedback</span>
            </button>
            <span className="divider" />
            <button
              type="button"
              className={editor.isActive("bold") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Bold (Cmd/Ctrl+B)"
              aria-label="Bold"
              aria-keyshortcuts="Meta+B Control+B"
            >
              <Bold size={16} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className={editor.isActive("italic") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Italic (Cmd/Ctrl+I)"
              aria-label="Italic"
              aria-keyshortcuts="Meta+I Control+I"
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              className={editor.isActive("underline") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="Underline (Cmd/Ctrl+U)"
              aria-label="Underline"
              aria-keyshortcuts="Meta+U Control+U"
            >
              U
            </button>
            <button
              className={editor.isActive("strike") ? "tool scribble-tool active" : "tool scribble-tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Scribble out selection (Cmd/Ctrl+Shift+X)"
              aria-label="Scribble out selection"
              aria-keyshortcuts="Meta+Shift+X Control+Shift+X"
            >
              <svg className="scribble-icon" viewBox="0 0 28 28" aria-hidden="true">
                <path d="M7 14.5c1.8-7 13.5-8.1 14.2-1.7.5 4.6-6.8 7.8-11.6 4.5-3.7-2.6-.3-8.2 5.8-8.5 7.1-.3 8.2 7.7 2.4 10.4-5.5 2.6-13.5-.3-12-5.3" />
                <path d="M9.1 10.2c5.2 3.3 10.2 3.2 12.9 1.1" />
                <path d="M7.8 18.4c4.6-1 9.4-.9 13.6 1.3" />
                <path d="M12.3 6.6c-1.2 4.1 1.1 9.6 5.7 14.4" />
              </svg>
            </button>
            <button
              className={eraserMode ? "tool eraser-tool active" : "tool eraser-tool"}
              onClick={() => setEraserMode((mode) => !mode)}
              title={
                eraserMode
                  ? "Eraser on: drag over annotation, scribble, or underline ink to remove it"
                  : "Eraser: remove highlight/comment/reference/scribble/underline ink"
              }
              aria-label={
                eraserMode
                  ? "Turn off eraser"
                  : "Turn on eraser to remove highlights, comments, references, scribbles, and underlines"
              }
              aria-pressed={eraserMode}
            >
              <Eraser size={17} strokeWidth={2.3} />
            </button>
            <span className="divider" />
            <label className="format-select-label" title="Change paragraph, heading, or code block style">
              <span className="visually-hidden">Block style</span>
              <select
                className="format-select block-format-select"
                value={currentBlockStyle}
                onChange={(event) => {
                  const nextStyle = event.target.value;
                  const chain = editor.chain().focus();
                  const shouldLeaveQuote = editor.isActive("blockquote") && nextStyle !== "blockquote";

                  if (nextStyle === "paragraph") {
                    if (shouldLeaveQuote) {
                      chain.toggleBlockquote();
                    }
                    chain.setParagraph().run();
                    return;
                  }

                  if (nextStyle === "codeBlock") {
                    if (shouldLeaveQuote) {
                      chain.toggleBlockquote();
                    }
                    chain.setCodeBlock().run();
                    return;
                  }

                  if (nextStyle === "blockquote") {
                    chain.toggleBlockquote().run();
                    return;
                  }

                  const headingLevel = Number(nextStyle.replace("heading-", ""));
                  if (headingLevel === 1 || headingLevel === 2 || headingLevel === 3) {
                    if (shouldLeaveQuote) {
                      chain.toggleBlockquote();
                    }
                    chain.setHeading({ level: headingLevel }).run();
                  }
                }}
                aria-label="Block style"
              >
                {blockStyleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={currentBlockStyle === "paragraph" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const chain = editor.chain().focus();
                if (editor.isActive("blockquote")) {
                  chain.toggleBlockquote();
                }
                chain.setParagraph().run();
              }}
              title="Paragraph"
              aria-label="Paragraph"
              aria-pressed={currentBlockStyle === "paragraph"}
            >
              <Pilcrow size={16} />
            </button>
            <button
              type="button"
              className={currentBlockStyle === "heading-1" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const chain = editor.chain().focus();
                if (editor.isActive("blockquote")) {
                  chain.toggleBlockquote();
                }
                chain.setHeading({ level: 1 }).run();
              }}
              title="Heading 1"
              aria-label="Heading 1"
              aria-pressed={currentBlockStyle === "heading-1"}
            >
              <Heading1 size={16} />
            </button>
            <button
              type="button"
              className={currentBlockStyle === "heading-2" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const chain = editor.chain().focus();
                if (editor.isActive("blockquote")) {
                  chain.toggleBlockquote();
                }
                chain.setHeading({ level: 2 }).run();
              }}
              title="Heading 2"
              aria-label="Heading 2"
              aria-pressed={currentBlockStyle === "heading-2"}
            >
              <Heading2 size={16} />
            </button>
            <button
              type="button"
              className={currentBlockStyle === "heading-3" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const chain = editor.chain().focus();
                if (editor.isActive("blockquote")) {
                  chain.toggleBlockquote();
                }
                chain.setHeading({ level: 3 }).run();
              }}
              title="Heading 3"
              aria-label="Heading 3"
              aria-pressed={currentBlockStyle === "heading-3"}
            >
              <Heading3 size={16} />
            </button>
            <button
              type="button"
              className={currentBlockStyle === "codeBlock" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const chain = editor.chain().focus();
                if (editor.isActive("blockquote")) {
                  chain.toggleBlockquote();
                }
                chain.setCodeBlock().run();
              }}
              title="Code block"
              aria-label="Code block"
              aria-pressed={currentBlockStyle === "codeBlock"}
            >
              <Code2 size={16} />
            </button>
            <button
              type="button"
              className={editor.isActive("code") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="Inline code"
              aria-label="Inline code"
              aria-pressed={editor.isActive("code")}
            >
              <Code size={16} />
            </button>
            <button
              type="button"
              className={editor.isActive("blockquote") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Block quote"
              aria-label="Block quote"
              aria-pressed={editor.isActive("blockquote")}
            >
              <Quote size={16} />
            </button>
            <button
              type="button"
              className="tool"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Horizontal line"
              aria-label="Horizontal line"
            >
              <Minus size={16} />
            </button>
            <span className="divider" />
            <label className="format-select-label" title="Change font size">
              <span className="visually-hidden">Font size</span>
              <select
                className="format-select"
                value={currentFontSize}
                onChange={(event) => {
                  const nextSize = event.target.value;
                  const chain = editor.chain().focus();
                  if (nextSize) {
                    chain.setFontSize(nextSize).run();
                  } else {
                    chain.unsetFontSize().run();
                  }
                }}
                aria-label="Font size"
              >
                {fontSizeOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={editor.isActive("bulletList") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet list"
              aria-label="Bullet list"
              aria-pressed={editor.isActive("bulletList")}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              className={editor.isActive("orderedList") ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Numbered list"
              aria-label="Numbered list"
              aria-pressed={editor.isActive("orderedList")}
            >
              <ListOrdered size={16} />
            </button>
            <span className="divider" />
            <button
              type="button"
              className={activeAlignment === "left" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              title="Align left"
              aria-label="Align left"
              aria-pressed={activeAlignment === "left"}
            >
              <AlignLeft size={16} />
            </button>
            <button
              type="button"
              className={activeAlignment === "center" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
              title="Align centre"
              aria-label="Align centre"
              aria-pressed={activeAlignment === "center"}
            >
              <AlignCenter size={16} />
            </button>
            <button
              type="button"
              className={activeAlignment === "right" ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              title="Align right"
              aria-label="Align right"
              aria-pressed={activeAlignment === "right"}
            >
              <AlignRight size={16} />
            </button>
            <span className="divider" />
            <button
              type="button"
              className={isInTable ? "tool active" : "tool"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
              title="Insert table"
              aria-label="Insert table"
            >
              <TableIcon size={16} />
            </button>
            <span className="divider" />
            <button className="tool" onClick={clearAllMarkup} title="Clear all markup" aria-label="Clear all markup">
              <Trash2 size={16} />
            </button>
            <button
              className="tool"
              onClick={() => openReviewPanel("comment")}
              title="Comment on selection"
              aria-label="Comment on selection"
            >
              <MessageSquare size={16} />
            </button>
            <button
              className="tool"
              onClick={() => openReviewPanel("reference")}
              title="Add style reference to selection"
              aria-label="Add style reference to selection"
            >
              <Quote size={16} />
            </button>
            <div className={highlightMenuOpen ? "highlight-menu open" : "highlight-menu"}>
              <button
                ref={highlightButtonRef}
                className="tool"
                title="Highlight selected text"
                aria-label="Highlight selected text"
                aria-expanded={highlightMenuOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={toggleHighlightMenu}
              >
                <Highlighter size={16} />
                <ChevronDown size={13} />
              </button>
            </div>
            <button
              className={copied ? "tool copy-feedback copied" : "tool copy-feedback"}
              onClick={() => void copyAgentReport()}
              title="Copy prompt to agent"
              aria-label="Copy prompt to agent"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              className={codexReviewState === "waiting" ? "tool codex-review-trigger active" : "tool codex-review-trigger"}
              onClick={() => void requestCodexReview()}
              title="Ask Codex to review and mark up this document"
              aria-label="Ask Codex to review and mark up this document"
              aria-pressed={codexReviewState === "waiting"}
            >
              <span className="codex-logo-mark" aria-hidden="true">C</span>
            </button>
            <span className="divider" />
            <button
              className={versionsMenuOpen ? "text-button version-trigger active" : "text-button version-trigger"}
              onClick={() => {
                setFeedbackOpen(false);
                setDocsMenuOpen(false);
                setVersionsMenuOpen((open) => !open);
              }}
              aria-haspopup="menu"
              aria-expanded={versionsMenuOpen}
              aria-label={`Open versions, ${rewriteVersions.length + 1} version${rewriteVersions.length === 0 ? "" : "s"}`}
              title={`Versions: ${activeVersionLabel}`}
            >
              <FileText size={15} />
              <span className="toolbar-text-label">Versions</span>
              <span className="version-count">{rewriteVersions.length + 1}</span>
              <ChevronDown size={13} />
            </button>
            <span
              className={`save-pill ${saveState}`}
              title={lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : "Autosaves locally"}
            >
              {saveState === "saved" ? <Check size={14} /> : <Save size={14} />}
              <span className="toolbar-text-label">{saveState}</span>
            </span>
            {uploadNotice ? (
              <span className="upload-status" aria-live="polite">
                {uploadNotice}
              </span>
            ) : null}
            {copied ? <span className="copy-status" aria-live="polite">Copied</span> : null}
          </div>
        </section>

        {highlightMenuOpen ? (
          <div
            className="highlight-popover floating-highlight-popover"
            style={highlightMenuPosition ?? undefined}
            role="menu"
            aria-label="Highlight issue types"
          >
            {manualIssueCategoryOrder.map((category) => (
              <button
                key={category}
                type="button"
                role="menuitem"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addManualIssue(category)}
              >
                {category === "other" ? (
                  <MessageSquare size={16} strokeWidth={2.2} />
                ) : (
                  <span className="swatch" style={{ background: ISSUE_CATEGORIES[category].border }} />
                )}
                {ISSUE_CATEGORIES[category].label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="editor-stage">
          <div className={marginNoteItems.length ? "paper-layout has-notes" : "paper-layout"}>
            <div
              className={marginNoteItems.length ? "paper-sheet has-margin-notes" : "paper-sheet"}
              ref={paperSheetRef}
            >
              <div className="editor-paper-body">
                <EditorContent editor={editor} />
              </div>
              {marginNoteItems.length ? (
                <div className="margin-notes-layer" aria-label="Handwritten annotations">
                  <svg className="annotation-arrow-layer" aria-hidden="true">
                    <defs>
                      <marker id="annotation-arrow-red" markerWidth="9" markerHeight="9" refX="7.2" refY="4.5" orient="auto">
                        <path d="M 1 1.2 L 7.2 4.5 L 1 7.8" fill="none" stroke="var(--pen-red)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </marker>
                      <marker id="annotation-arrow-purple" markerWidth="9" markerHeight="9" refX="7.2" refY="4.5" orient="auto">
                        <path d="M 1 1.2 L 7.2 4.5 L 1 7.8" fill="none" stroke="var(--pen-purple)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </marker>
                    </defs>
                    {styleReferences.flatMap((reference) => renderReferenceRings(reference))}
                    {marginNoteItems.map((item) =>
                      renderMarginNoteArrow(item.kind, item.note, item.fallbackSide, item.fallbackTop),
                    )}
                  </svg>
                  {marginNoteItems.map((item) =>
                    renderMarginNote(item.kind, item.note, item.fallbackSide, item.fallbackTop, item.rotation),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {tableControlsPosition ? (
        <div
          className="table-context-toolbar"
          style={{ left: tableControlsPosition.left, top: tableControlsPosition.top }}
          aria-label="Table row and column tools"
        >
          <div className="table-control-group" aria-label="Column tools">
            <span className="table-control-label">
              <Columns2 size={14} />
              Column
            </span>
            <button
              type="button"
              className="table-control-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().addColumnAfter().run())}
              title="Add column after the selected column"
              aria-label="Add table column"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="table-control-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().deleteColumn().run())}
              title="Remove selected table column"
              aria-label="Remove table column"
            >
              <Minus size={15} />
            </button>
          </div>
          <span className="table-control-divider" />
          <div className="table-control-group" aria-label="Row tools">
            <span className="table-control-label">
              <Rows3 size={14} />
              Row
            </span>
            <button
              type="button"
              className="table-control-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().addRowAfter().run())}
              title="Add row after the selected row"
              aria-label="Add table row"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="table-control-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableCommand(() => editor.chain().focus().deleteRow().run())}
              title="Remove selected table row"
              aria-label="Remove table row"
            >
              <Minus size={15} />
            </button>
          </div>
        </div>
      ) : null}

      {issueHoverHint && !reviewOpen ? (
        <div
          className="issue-hover-card"
          style={{ left: issueHoverHint.x, top: issueHoverHint.y }}
          aria-hidden="true"
        >
          <strong>{issueHoverHint.label}</strong>
          {issueHoverHint.detail ? <span>{issueHoverHint.detail}</span> : null}
        </div>
      ) : null}

      {reviewOpen ? (
      <section
        className="review-popup"
        ref={reviewRef}
        style={{ left: reviewPosition.x, top: reviewPosition.y }}
        role="dialog"
        aria-modal="false"
        aria-label={`${reviewPanelTitle} panel`}
      >
        <div
          className="panel-header drag-handle"
          onPointerDown={beginReviewDrag}
          onPointerMove={moveReviewPanel}
          onPointerUp={endReviewDrag}
          onPointerCancel={endReviewDrag}
        >
          <strong>{reviewPanelTitle}</strong>
          <button className="mini-button" onClick={() => setReviewOpen(false)} title="Close review">
            <X size={14} />
          </button>
        </div>

        {selectedIssue ? (
          <section className="inspector-section">
            <div
              className="issue-chip"
              style={{
                background: ISSUE_CATEGORIES[selectedIssue.category].background,
                color: ISSUE_CATEGORIES[selectedIssue.category].color,
              }}
            >
              <Paintbrush size={14} />
              {selectedIssue.label}
              {selectedIssue.source ? ` · ${selectedIssue.source}` : ""}
            </div>
            {selectedIssueGroup.length > 1 ? (
              <div className="stacked-issue-list" aria-label="Checks on this text">
                <strong>{selectedIssueGroup.length} checks on this text</strong>
                {selectedIssueGroup.map((issue) => (
                  <button
                    key={issue.id}
                    className={issue.id === selectedIssue.id ? "stacked-issue-button active" : "stacked-issue-button"}
                    onClick={() => setSelectedIssueId(issue.id)}
                  >
                    <span className="issue-source-dot" data-source={issue.source ?? "un-AI-ing"} />
                    <span>
                      {issue.source ?? "un-AI-ing"} · {issue.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="selected-text">{selectedIssue.text}</div>
            <div className="issue-detail">
              <strong>Why</strong>
              <p>{selectedIssue.reason}</p>
              <strong>Fix</strong>
              <p>{selectedIssue.suggestion}</p>
            </div>
            {isCheckerIssue(selectedIssue) && selectedIssue.replacements?.length ? (
              <div className="replacement-list" aria-label="Recommended edits">
                <strong>Recommended edit</strong>
                {selectedIssue.replacements.slice(0, 4).map((replacement) => (
                  <button
                    key={replacement}
                    className="replacement-button"
                    onClick={() => applyIssueReplacement(selectedIssue, replacement)}
                  >
                    Replace with "{replacement}"
                  </button>
                ))}
                <p className="field-note">Apply fix replaces only this underline, then scans the draft again.</p>
              </div>
            ) : isCheckerIssue(selectedIssue) ? (
              <p className="field-note">
                No one-click fix. Leave it for the agent, or Ignore.
              </p>
            ) : null}
            <div className="button-row">
              <button className="text-button" onClick={() => removeHighlight(selectedIssue)}>
                <Eraser size={15} />
                {isCheckerIssue(selectedIssue) ? "Ignore" : "Remove highlight"}
              </button>
            </div>
          </section>
        ) : reviewTargetText ? (
          <section className="inspector-section">
            <div className="issue-chip neutral-chip">
              <Paintbrush size={14} />
              Selected text
            </div>
            <div className="selected-text">{reviewTargetText}</div>
          </section>
        ) : (
          <section className="empty-state">
            <AlertTriangle size={18} />
            <span>Select or highlight text first.</span>
          </section>
        )}

        {showCommentSection ? (
          <section className="inspector-section comment-box">
            <h3>Comment</h3>
            {targetComment ? (
              <div className="comment-thread">
                <strong>{targetComment.selectedText}</strong>
                <p>{targetComment.body}</p>
              </div>
            ) : reviewTargetText ? (
              <>
                <textarea
                  value={commentDraft}
                  onChange={(event) => {
                    setCommentDraft(event.target.value);
                    setCommentNotice("");
                  }}
                  placeholder="Comment on this text"
                />
                {commentNotice ? <p className="field-note">{commentNotice}</p> : null}
                <button className="primary-button" onClick={addComment}>
                  <MessageSquare size={16} />
                  Add comment
                </button>
              </>
            ) : (
              <p className="field-note">Select text on the page to attach one comment.</p>
            )}
            {targetComment ? (
              <button className="text-button" onClick={() => deleteComment(targetComment)}>
                <Trash2 size={15} />
                Delete comment
              </button>
            ) : null}
          </section>
        ) : null}

        {showReferenceSection ? (
          <section className="inspector-section reference-box">
            <h3>Style reference</h3>
            {targetReference ? (
              <div className="reference-thread">
                <strong>{targetReference.selectedText}</strong>
                <p>{targetReference.referenceText}</p>
              </div>
            ) : reviewTargetText ? (
              <>
                <textarea
                  value={referenceDraft}
                  onChange={(event) => {
                    setReferenceDraft(event.target.value);
                    setReferenceNotice("");
                  }}
                  placeholder="Paste a reference paragraph for style only"
                />
                {referenceNotice ? <p className="field-note">{referenceNotice}</p> : null}
                <button className="primary-button" onClick={addStyleReference}>
                  <Quote size={16} />
                  Add reference
                </button>
              </>
            ) : (
              <p className="field-note">Select text on the page to attach one style reference.</p>
            )}
            {targetReference ? (
              <button className="text-button" onClick={() => deleteStyleReference(targetReference)}>
                <Trash2 size={15} />
                Delete reference
              </button>
            ) : null}
          </section>
        ) : null}
      </section>
      ) : null}
    </main>
  );
}

export default App;
