/**
 * Counts words the way a human would in each script.
 *
 * This mirrors `count_words` in src-tauri/src/managers/stats.rs on purpose: the
 * "Today" screen shows a per-dictation count next to the running total from
 * that counter, and two rules would put two different numbers for the same
 * text side by side on the same panel.
 *
 * Chinese and Japanese are written without spaces, so splitting on whitespace
 * would count a whole sentence as one word; those characters are counted
 * individually instead. Korean, Thai and everything alphabetic keep the
 * whitespace rule. Tokens with no letter or digit (stray punctuation left by
 * the model) are not words.
 */
export const countWords = (text: string): number => {
  if (!text) return 0;

  // Hiragana + katakana, CJK extension A, CJK unified ideographs, CJK
  // compatibility ideographs. Same four ranges as the Rust side.
  const scriptioContinua = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/gu;

  const cjk = text.match(scriptioContinua)?.length ?? 0;
  const rest = text.replace(scriptioContinua, " ");
  const spaced = rest
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

  return cjk + spaced;
};
