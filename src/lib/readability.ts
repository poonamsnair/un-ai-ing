import { fleschKincaid } from "flesch-kincaid";
import { syllable } from "syllable";

const wordPattern = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;
const sentencePattern = /[^.!?\n]+(?:[.!?]+|(?=\n|$))/g;

export function calculateFleschKincaidGrade(value: string) {
  const words = value.match(wordPattern) ?? [];
  if (!words.length) {
    return null;
  }

  const sentences = value.match(sentencePattern)?.filter((sentence) => /\w/.test(sentence)) ?? [];
  const sentenceCount = Math.max(1, sentences.length);
  const syllableCount = words.reduce((total, word) => total + Math.max(1, syllable(word)), 0);

  return fleschKincaid({
    sentence: sentenceCount,
    word: words.length,
    syllable: syllableCount,
  });
}

export function formatFleschKincaidGrade(grade: number | null) {
  return grade === null ? "not enough text" : grade.toFixed(1);
}
