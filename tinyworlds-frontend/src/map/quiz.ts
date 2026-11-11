/**
 * Guess the building's questions, as the pipeline writes them (quiz.<locale>.json; the root
 * CLAUDE.md has the contract): the building asked about, the three wrong names to offer beside
 * it, and its Wikipedia opening cut into pieces, the odd ones being the name blanked out.
 */

export type QuizLevelName = "easy" | "medium" | "hard";
/** How a player's choice narrows a round's wrong answers: from the answer's borough, kind, both. */
export type QuizScope = "all" | "area" | "group" | "both";
export type QuizGroup = "buildings" | "museums" | "landmarks" | "stations";
export type Three = [string, string, string];

export const QUIZ_LEVELS: QuizLevelName[] = ["easy", "medium", "hard"];
export const QUIZ_GROUPS: QuizGroup[] = ["buildings", "museums", "landmarks", "stations"];
const SCOPES: QuizScope[] = ["all", "area", "group", "both"];

export interface QuizQuestion {
  /** the sight asked about (sights.json) */
  id: string;
  /** hard's three wrong names for any borough and kind: what older files have */
  decoys: Three;
  /** per difficulty it is in, per scope; a scope left out is the same as `all` */
  sets: Partial<Record<QuizLevelName, Partial<Record<QuizScope, Three>>>>;
  /** the easiest difficulty it is in: 1 easy, 2 medium, 3 hard (1 in an older file) */
  level: 1 | 2 | 3;
  group: QuizGroup;
  /** its borough, as the data names it */
  area?: string;
  /** the text in pieces; the odd ones (1, 3, …) are blanked */
  parts: string[];
  /** the text's own language */
  lang: string;
}

const isText = (v: unknown): v is string => typeof v === "string";

/** Three names, none the answer, none twice. */
const isThree = (v: unknown, id: string): v is Three =>
  Array.isArray(v) && v.length === 3 && v.every(isText) && new Set([id, ...v]).size === 4;

/** The sets that can be used; a broken one is left out (the round then falls back to `all`, or `decoys`). */
function parseSets(value: unknown, id: string): QuizQuestion["sets"] {
  const sets: QuizQuestion["sets"] = {};
  if (!value || typeof value !== "object") return sets;
  for (const level of QUIZ_LEVELS) {
    const byScope = (value as Record<string, unknown>)[level];
    if (!byScope || typeof byScope !== "object") continue;
    const kept: Partial<Record<QuizScope, Three>> = {};
    for (const scope of SCOPES) {
      const three = (byScope as Record<string, unknown>)[scope];
      if (isThree(three, id)) kept[scope] = three;
    }
    if (kept.all) sets[level] = kept;
  }
  return sets;
}

/** The questions that can be asked; anything malformed is left out, and no file is none. */
export function parseQuiz(value: unknown): QuizQuestion[] {
  const list = (value as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  const out: QuizQuestion[] = [];
  for (const item of list as Partial<Record<keyof QuizQuestion, unknown>>[]) {
    if (!item || !isText(item.id)) continue;
    const { id, decoys, parts } = item;
    if (!isThree(decoys, id)) continue;
    if (!Array.isArray(parts) || parts.length === 0 || !parts.every(isText)) continue;
    out.push({
      id,
      decoys,
      sets: parseSets(item.sets, id),
      level: item.level === 2 || item.level === 3 ? item.level : 1,
      group: QUIZ_GROUPS.includes(item.group as QuizGroup)
        ? (item.group as QuizGroup)
        : "buildings",
      ...(isText(item.area) && item.area ? { area: item.area } : {}),
      parts,
      lang: isText(item.lang) && item.lang ? item.lang : "en",
    });
  }
  return out;
}
