import retextEnglish from "retext-english";
import retextPassive from "retext-passive";
import retextStringify from "retext-stringify";
import { unified } from "unified";
import { ISSUE_CATEGORIES } from "./issueCategories";
import type { Issue, IssueCategory, IssueSeverity, IssueSource } from "../types";

interface AddIssueOptions {
  source?: IssueSource;
  ruleId?: string;
  replacements?: string[];
}

interface LanguageToolReplacement {
  value: string;
}

interface LanguageToolMatch {
  message?: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements?: LanguageToolReplacement[];
  rule?: {
    id?: string;
    category?: {
      name?: string;
    };
  };
}

interface LanguageToolResponse {
  matches?: LanguageToolMatch[];
}

const languageToolEndpoint = "https://api.languagetoolplus.com/v2/check";

const compressedTechnicalReferencePattern =
  /\b(?:[A-Z]{2,}(?:[-\s]?[A-Z0-9]{2,})*|[A-Z][a-z]+(?:\s+\d{2,4})|(?:Section|Clause|Rule|Article|Standard|Principle|Protocol)\s+\d+[A-Za-z.-]*)\b/;
const nominalToInfinitiveDriftPattern =
  /\b(?:is|are|was|were|be|been|being)\s+(?:hard|tough|difficult|tricky|useful|good|strong|poor|weak)\s+to\s+test\s+for\s+(?:AI agents|agents|models|systems|LLMs|evaluators)\b/i;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);

const matchAll = (value: string, pattern: RegExp) => Array.from(value.matchAll(pattern));

const splitSentences = (value: string) =>
  Array.from(value.matchAll(/[^.!?\n]+[.!?]?/g))
    .map((match) => ({
      text: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }))
    .filter((sentence) => sentence.text.trim().length > 0);

const addIssue = (
  issues: Issue[],
  category: IssueCategory,
  severity: IssueSeverity,
  text: string,
  start: number,
  reason: string,
  suggestion: string,
  options: AddIssueOptions = {},
) => {
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText || issues.length > 140) {
    return;
  }

  const end = start + text.length;
  const source = options.source ?? "un-AI-ing";
  const isDuplicate = issues.some(
    (issue) =>
      issue.category === category &&
      issue.source === source &&
      Math.abs(issue.start - start) < 4 &&
      issue.text === cleanText,
  );

  if (isDuplicate) {
    return;
  }

  issues.push({
    id: `${slugify(source)}-${category}-${options.ruleId ? `${slugify(options.ruleId)}-` : ""}${start}-${end}-${slugify(cleanText)}`,
    category,
    label: ISSUE_CATEGORIES[category].label,
    severity,
    status: "open",
    origin: "scanner",
    source,
    ruleId: options.ruleId,
    replacements: options.replacements,
    text: cleanText,
    reason,
    suggestion,
    start,
    end,
  });
};

function scanUnAiIngRules(value: string): Issue[] {
  const issues: Issue[] = [];

  for (const pattern of [/\s{2,}/g, /\s+[,.!?;:]/g]) {
    for (const match of matchAll(value, pattern)) {
      addIssue(
        issues,
        "grammar",
        "low",
        match[0],
        match.index ?? 0,
        "This looks like a small spacing or punctuation slip.",
        "Tighten the spacing or punctuation before final review.",
      );
    }
  }

  for (const pattern of [
    /\b(robust|comprehensive|seamless|leverage|delve|pivotal|nuanced|holistic|actionable|transformative|elevate|foster|underscore|landscape|paradigm|tailored|meaningful)\b/gi,
    /\b(it is important to note|it is worth noting|in today's evolving|at scale|unlock|critical role)\b/gi,
  ]) {
    for (const match of matchAll(value, pattern)) {
      addIssue(
        issues,
        "ai_jargon",
        "medium",
        match[0],
        match.index ?? 0,
        "This phrase can make the draft sound inflated or generic.",
        "Replace it with a plainer word, or keep it only if it has a precise technical job.",
      );
    }
  }

  for (const match of matchAll(value, /—/g)) {
    addIssue(
      issues,
      "em_dash",
      "low",
      match[0],
      match.index ?? 0,
      "A single em dash is fine; repeated use can become a visible model habit.",
      "Use a comma, colon, full stop, or rewrite the sentence if the dash is doing too much work.",
    );
  }

  for (const match of matchAll(value, /\b(things|stuff|various|etc\.?|kind of|sort of|in a broad way|paperwork)\b/gi)) {
    addIssue(
      issues,
      "technical_precision",
      "high",
      match[0],
      match.index ?? 0,
      "This sounds vague in a technical document.",
      "Name the specific concept, evidence type, requirement, mechanism, or uncertainty.",
    );
  }

  for (const match of matchAll(
    value,
    /\b(is|are|was|were|be|been|being)\s+(organised|organized|designed|evaluated|assessed|presented|provided|checked|grounded|run|given)\b/gi,
  )) {
    addIssue(
      issues,
      "passive_voice",
      "medium",
      match[0],
      match.index ?? 0,
      "The sentence hides who is doing the work.",
      "Name the actor when it matters. Prefer a strong active verb over a prepositional phrase, such as 'assess' instead of 'make an assessment of'.",
    );
  }

  for (const pattern of [
    /\b(utilize|utilise)\b/gi,
    /\bprior to\b/gi,
    /\bin order to\b/gi,
  ]) {
    for (const match of matchAll(value, pattern)) {
      addIssue(
        issues,
        "style_guide",
        "low",
        match[0],
        match.index ?? 0,
        "This wording is more formal than the app's plain-English style.",
        "Use the simpler house-style equivalent if the meaning stays the same.",
      );
    }
  }

  for (const pattern of [
    /\bnot merely\b[^.?!]{0,160}\babout\b/gi,
    /\bnot only\b[^.?!]{0,160}\bbut also\b/gi,
    /\bAs [^,.]{2,80}, we need\b/g,
    /\bWe expect this benchmark to help\b/g,
  ]) {
    for (const match of matchAll(value, pattern)) {
      addIssue(
        issues,
        "ai_sentence",
        "medium",
        match[0],
        match.index ?? 0,
        "This sentence shape is common in assistant-generated prose.",
        "Rewrite it with the concrete claim first, then add the qualifier only if needed.",
      );
    }
  }

  for (const sentence of splitSentences(value)) {
    const cleanSentence = sentence.text.replace(/\s+/g, " ").trim();
    const words = cleanSentence.split(/\s+/).filter(Boolean);
    const commaCount = cleanSentence.match(/,/g)?.length ?? 0;
    const firstTextOffset = sentence.text.search(/\S/);
    const cleanSentenceStart = sentence.start + (firstTextOffset < 0 ? 0 : firstTextOffset);
    const sentenceExcerpt = sentence.text.slice(firstTextOffset < 0 ? 0 : firstTextOffset).slice(0, 180);

    if (nominalToInfinitiveDriftPattern.test(cleanSentence)) {
      addIssue(
        issues,
        "meaning_drift",
        "high",
        sentenceExcerpt,
        cleanSentenceStart,
        "This may have turned a noun phrase such as 'a hard test for AI agents' into 'hard to test for AI agents', which changes the claim.",
        "If the intended meaning is challenge or benchmark, use a noun phrase such as 'a tough test for AI agents' instead of 'hard to test for AI agents'.",
        { ruleId: "NominalToInfinitiveDrift" },
      );
    }

    if (words.length > 44 || (words.length > 34 && commaCount >= 4)) {
      const excerpt = cleanSentence.slice(0, 180);
      const excerptStart = sentence.start + Math.max(0, sentence.text.indexOf(excerpt.slice(0, 20)));
      addIssue(
        issues,
        "overcomplex",
        "high",
        excerpt,
        excerptStart,
        "This sentence asks the reader to hold too many ideas at once.",
        "Split it into two sentences and make the main claim arrive earlier.",
      );
    }

    if (/\b(in other words|this means that|essentially|basically|to put it simply)\b/i.test(cleanSentence)) {
      addIssue(
        issues,
        "over_explaining",
        "low",
        cleanSentence.slice(0, 160),
        sentence.start,
        "The explanation may be restating what the previous sentence already handled.",
        "Keep the sentence only if it adds a new distinction, example, or constraint.",
      );
    }

    if (words.length <= 5 && compressedTechnicalReferencePattern.test(cleanSentence)) {
      addIssue(
        issues,
        "under_explaining",
        "medium",
        cleanSentence,
        sentence.start,
        "The technical reference is too compressed for a reader to trust the point.",
        "Add the missing condition, consequence, or example in one short follow-up sentence.",
      );
    }
  }

  return issues.sort((a, b) => a.start - b.start);
}

const buildTextChunks = (value: string, maxChunkLength = 12000) => {
  const chunks: Array<{ text: string; offset: number }> = [];
  let offset = 0;

  while (offset < value.length && chunks.length < 4) {
    const hardEnd = Math.min(offset + maxChunkLength, value.length);
    let end = hardEnd;

    if (hardEnd < value.length) {
      const sentenceBreak = value.lastIndexOf(".", hardEnd);
      const paragraphBreak = value.lastIndexOf("\n\n", hardEnd);
      const softEnd = Math.max(sentenceBreak, paragraphBreak);
      if (softEnd > offset + maxChunkLength * 0.6) {
        end = softEnd + 1;
      }
    }

    chunks.push({ text: value.slice(offset, end), offset });
    offset = end;
  }

  return chunks;
};

async function fetchLanguageTool(body: URLSearchParams) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);

  try {
    return await fetch(languageToolEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function scanLanguageTool(value: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  if (!value.trim() || typeof fetch !== "function") {
    return issues;
  }

  try {
    for (const chunk of buildTextChunks(value)) {
      const response = await fetchLanguageTool(
        new URLSearchParams({
          text: chunk.text,
          language: "en-AU",
          enabledOnly: "false",
        }),
      );

      if (!response.ok) {
        return issues;
      }

      const payload = (await response.json()) as LanguageToolResponse;

      for (const match of payload.matches ?? []) {
        if (match.length <= 0) {
          continue;
        }

        const start = chunk.offset + match.offset;
        const highlightedText = value.slice(start, start + match.length);
        const replacements = (match.replacements ?? []).slice(0, 4).map((replacement) => replacement.value);
        const replacementText = replacements.length
          ? `Suggested replacement: ${replacements.join(", ")}.`
          : "Review the highlighted wording and apply the grammar or usage correction.";
        const toolCategory = match.rule?.category?.name ?? "Writing";
        const severity =
          toolCategory.toLowerCase().includes("typo") || toolCategory.toLowerCase().includes("grammar")
            ? "high"
            : "medium";

        addIssue(
          issues,
          "grammar",
          severity,
          highlightedText,
          start,
          match.message ?? match.shortMessage ?? "LanguageTool found a writing issue here.",
          replacementText,
          {
            source: "LanguageTool",
            ruleId: match.rule?.id,
            replacements,
          },
        );
      }
    }
  } catch {
    return issues;
  }

  return issues;
}

const expandPassiveRange = (value: string, start: number, end: number) => {
  const prefixStart = Math.max(0, start - 28);
  const prefix = value.slice(prefixStart, start);
  const beVerb = prefix.match(/\b(?:am|are|were|being|is|been|was|be)\s+$/i);

  return {
    start: beVerb?.index === undefined ? start : prefixStart + beVerb.index,
    end,
  };
};

async function scanRetextPassive(value: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  if (!value.trim()) {
    return issues;
  }

  try {
    const file = await unified().use(retextEnglish).use(retextPassive).use(retextStringify).process(value);

    for (const message of file.messages) {
      const place = message.place as { start?: { offset?: number }; end?: { offset?: number } } | undefined;
      const startOffset = place?.start?.offset;
      const endOffset = place?.end?.offset;

      if (typeof startOffset !== "number" || typeof endOffset !== "number" || startOffset >= endOffset) {
        continue;
      }

      const range = expandPassiveRange(value, startOffset, endOffset);
      addIssue(
        issues,
        "passive_check",
        "medium",
        value.slice(range.start, range.end),
        range.start,
        "retext-passive found passive voice here, which can hide who is doing the action.",
        "Rewrite with the actor first when the actor matters.",
        {
          source: "retext-passive",
          ruleId: message.ruleId,
        },
      );
    }
  } catch {
    return issues;
  }

  return issues;
}

const valeStyleRules: Array<{
  ruleId: string;
  category: IssueCategory;
  pattern: RegExp;
  severity: IssueSeverity;
  reason: string;
  suggestion: string;
}> = [
  {
    ruleId: "UnAiIng.WeaselWords",
    category: "style_guide",
    pattern: /\b(clearly|obviously|simply|basically|essentially|arguably|various|numerous|many|some|very|really)\b/gi,
    severity: "medium",
    reason: "This Vale-style rule found a vague intensifier or hedge.",
    suggestion: "Use a precise claim, amount, condition, or source instead.",
  },
  {
    ruleId: "UnAiIng.AcademicFiller",
    category: "style_guide",
    pattern: /\b(it is important to note|it should be noted|it is worth noting|this paper seeks to|the findings suggest that)\b/gi,
    severity: "medium",
    reason: "This Vale-style rule found stock academic filler.",
    suggestion: "State the actual finding or claim directly.",
  },
  {
    ruleId: "UnAiIng.PassivePattern",
    category: "passive_check",
    pattern: /\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/gi,
    severity: "medium",
    reason: "This Vale-style rule found a likely passive construction.",
    suggestion: "Name the actor or recast the sentence around a stronger verb.",
  },
];

function scanValeStyleRules(value: string): Issue[] {
  const issues: Issue[] = [];

  for (const rule of valeStyleRules) {
    for (const match of matchAll(value, rule.pattern)) {
      addIssue(issues, rule.category, rule.severity, match[0], match.index ?? 0, rule.reason, rule.suggestion, {
        source: "Vale",
        ruleId: rule.ruleId,
      });
    }
  }

  return issues;
}

function mergeIssueGroups(groups: Issue[][]) {
  const merged: Issue[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const issue of group) {
      const key = `${issue.source ?? "un-AI-ing"}:${issue.ruleId ?? issue.category}:${issue.start}:${issue.end}:${issue.text}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(issue);
    }
  }

  return merged.sort((a, b) => a.start - b.start || a.end - b.end);
}

export async function scanText(value: string): Promise<Issue[]> {
  const [unAiIngIssues, retextIssues, valeIssues, languageToolIssues] = await Promise.all([
    Promise.resolve(scanUnAiIngRules(value)),
    scanRetextPassive(value),
    Promise.resolve(scanValeStyleRules(value)),
    scanLanguageTool(value),
  ]);

  return mergeIssueGroups([unAiIngIssues, retextIssues, valeIssues, languageToolIssues]);
}
