/**
 * Guess the building's questions, as the pipeline writes them (quiz.<locale>.json; the root
 * CLAUDE.md has the contract): the building asked about, the three wrong names to offer beside
 * it, and its Wikipedia opening cut into pieces, the odd ones being the name blanked out.
 */

export interface QuizQuestion {
  /** the sight asked about (sights.json) */
  id: string;
  /** three other sights' ids: the wrong names */
  decoys: [string, string, string];
  /** the text in pieces; the odd ones (1, 3, …) are blanked */
  parts: string[];
  /** the text's own language */
  lang: string;
}

const isText = (v: unknown): v is string => typeof v === "string";

/** The questions that can be asked; anything malformed is left out, and no file is none. */
export function parseQuiz(value: unknown): QuizQuestion[] {
  const list = (value as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  const out: QuizQuestion[] = [];
  for (const item of list as Partial<Record<keyof QuizQuestion, unknown>>[]) {
    if (!item || !isText(item.id)) continue;
    const { id, decoys, parts } = item;
    if (!Array.isArray(decoys) || decoys.length !== 3 || !decoys.every(isText)) continue;
    if (new Set([id, ...decoys]).size !== 4) continue;
    if (!Array.isArray(parts) || parts.length === 0 || !parts.every(isText)) continue;
    out.push({
      id,
      decoys: decoys as [string, string, string],
      parts,
      lang: isText(item.lang) && item.lang ? item.lang : "en",
    });
  }
  return out;
}
