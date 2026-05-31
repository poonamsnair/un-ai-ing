export type IssueCategory =
  | "grammar"
  | "style_guide"
  | "ai_jargon"
  | "em_dash"
  | "ai_sentence"
  | "thinking_fix"
  | "meaning_drift"
  | "brutal_cut"
  | "passive_voice"
  | "passive_check"
  | "overcomplex"
  | "over_explaining"
  | "under_explaining"
  | "technical_precision"
  | "other";

export type IssueSeverity = "high" | "medium" | "low";
export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssueOrigin = "scanner" | "manual";
export type IssueSource = "un-AI-ing" | "LanguageTool" | "retext-passive" | "Vale" | "Codex";

export interface Issue {
  id: string;
  category: IssueCategory;
  label: string;
  severity: IssueSeverity;
  status: IssueStatus;
  origin: IssueOrigin;
  source?: IssueSource;
  ruleId?: string;
  replacements?: string[];
  text: string;
  reason: string;
  suggestion: string;
  start: number;
  end: number;
}

export interface CommentThread {
  id: string;
  selectedText: string;
  selectionKey?: string;
  body: string;
  createdAt: string;
  author: "Human" | "Agent";
  resolved: boolean;
}

export interface StyleReference {
  id: string;
  selectedText: string;
  selectionKey?: string;
  referenceText: string;
  createdAt: string;
}

export type SourceDocumentKind = "sample" | "blank" | "upload" | "folder" | "unknown";

export interface SourceDocumentContext {
  kind: SourceDocumentKind;
  name?: string;
  mimeType?: string;
  extension?: string;
  sourceUrl?: string;
  importedAt?: string;
  originalHtml?: string;
  originalCss?: string;
}

export interface SessionPayload {
  title: string;
  documentHtml: string;
  plainText: string;
  sourceContext?: SourceDocumentContext;
  issues: Issue[];
  comments: CommentThread[];
  styleReferences: StyleReference[];
  updatedAt: string;
}
