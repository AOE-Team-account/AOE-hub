// Rough, free checks that decide whether a text even needs the AI: Chinese in
// either script, English by common words, or something else. They only ever
// choose between "skip the AI" and "ask the AI"; when unsure they ask.

const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;

export type ScriptGuess = "han" | "japanese" | "korean" | "latin" | "other";

export function guessScript(text: string): ScriptGuess {
  let han = 0;
  let latin = 0;
  let letters = 0;
  for (const ch of text) {
    if (HAN.test(ch)) { han++; letters++; }
    else if (KANA.test(ch)) return "japanese";
    else if (HANGUL.test(ch)) return "korean";
    else if (/\p{L}/u.test(ch)) { letters++; if (/\p{Script=Latin}/u.test(ch)) latin++; }
  }
  if (letters === 0) return "other";
  if (han / letters >= 0.3) return "han";
  if (latin / letters >= 0.7) return "latin";
  return "other";
}

const ENGLISH_WORDS = new Set([
  "the", "and", "is", "are", "was", "were", "of", "to", "in", "that", "it", "for", "with", "as", "on", "this", "but",
  "have", "has", "not", "you", "we", "my", "our", "your", "they", "be", "an", "or", "at", "by", "from", "what", "how",
  "can", "do", "did", "so", "if", "about", "i", "me", "he", "she", "his", "her", "them", "just", "would", "will",
]);

/** True when the Latin-script text looks like English (enough common English words). */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return false;
  if (words.length < 3) return words.every((w) => ENGLISH_WORDS.has(w)) && words.length > 0;
  const hits = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return hits / words.length >= 0.2;
}

/** "zh-CN" -> "zh", "pt-BR" -> "pt" */
export function primaryLanguage(code: string): string {
  return code.toLowerCase().split("-")[0];
}
