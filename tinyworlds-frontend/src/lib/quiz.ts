import {
  QUIZ_GROUPS,
  QUIZ_LEVELS,
  type QuizGroup,
  type QuizLevelName,
  type QuizQuestion,
  type QuizScope,
  type Three,
} from "@/map/quiz";
import type { SightType } from "@/map/sights";

/**
 * Guess the building, without React: what a choice of difficulty, borough and kind plays, the
 * order of a game, the four names, the shares of everyone's answers, the view a round flies to,
 * and the game's states.
 */

/** How everyone has answered one building (the API's `answerQuiz`). */
export interface QuizTally {
  answers: number;
  picks: { choice: string; count: number }[];
}

/** What the question calls the building: "Which station is this?". */
export type QuestionKind = "building" | "station" | "bridge" | "museum";

export function questionKind(t: SightType): QuestionKind {
  return t === "station" || t === "bridge" || t === "museum" ? t : "building";
}

/** What a player chooses before a game: a difficulty, a borough or all (null), a kind or all. */
export interface QuizChoice {
  level: QuizLevelName;
  area: string | null;
  group: QuizGroup | null;
}

/** The first game's choice: easy, all boroughs, all kinds. */
export const DEFAULT_CHOICE: QuizChoice = { level: "easy", area: null, group: null };

const LEVEL_NUMBER: Record<QuizLevelName, number> = { easy: 1, medium: 2, hard: 3 };

/** How the choice narrows a round's wrong answers. */
export function scopeOf(c: QuizChoice): QuizScope {
  if (c.area !== null && c.group !== null) return "both";
  return c.area !== null ? "area" : c.group !== null ? "group" : "all";
}

/** A round's three wrong names: the set for the game's difficulty and scope, else `all`'s, else `decoys`. */
export function setFor(q: QuizQuestion, c: QuizChoice): Three {
  const sets = q.sets[c.level];
  return sets?.[scopeOf(c)] ?? sets?.all ?? q.decoys;
}

/**
 * Whether a choice plays this question: in its difficulty (levels are cumulative; an older file
 * without sets is in every one), of its borough and kind, and on the map with its wrong names.
 */
export function inChoice(
  q: QuizQuestion,
  c: QuizChoice,
  has: (id: string) => boolean = () => true,
): boolean {
  const inLevel =
    q.level <= LEVEL_NUMBER[c.level] && (Object.keys(q.sets).length === 0 || !!q.sets[c.level]);
  return (
    inLevel &&
    (c.area === null || q.area === c.area) &&
    (c.group === null || q.group === c.group) &&
    has(q.id) &&
    setFor(q, c).every(has)
  );
}

export function countFor(
  questions: QuizQuestion[],
  c: QuizChoice,
  has?: (id: string) => boolean,
): number {
  return questions.filter((q) => inChoice(q, c, has)).length;
}

/** What each chip would leave, with the other two rows as they are: an empty one is struck out. */
export function chipCounts(
  questions: QuizQuestion[],
  c: QuizChoice,
  has?: (id: string) => boolean,
): {
  levels: Record<QuizLevelName, number>;
  areas: Map<string, number>;
  groups: Map<QuizGroup, number>;
} {
  const levels = Object.fromEntries(
    QUIZ_LEVELS.map((level) => [level, countFor(questions, { ...c, level }, has)]),
  ) as Record<QuizLevelName, number>;
  const areas = new Map(
    areasOf(questions).map((area) => [area, countFor(questions, { ...c, area }, has)]),
  );
  const groups = new Map(
    QUIZ_GROUPS.map((group) => [group, countFor(questions, { ...c, group }, has)]),
  );
  return { levels, areas, groups };
}

/** The boroughs the questions have, most questions first (ties by name). */
export function areasOf(questions: QuizQuestion[]): string[] {
  const counts = new Map<string, number>();
  for (const q of questions) if (q.area) counts.set(q.area, (counts.get(q.area) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([area]) => area);
}

/** A choice that plays something: the kind, then the borough, let go while it plays nothing. */
export function fixChoice(
  questions: QuizQuestion[],
  c: QuizChoice,
  has?: (id: string) => boolean,
): QuizChoice {
  if (countFor(questions, c, has) > 0) return c;
  const withoutGroup = { ...c, group: null };
  if (countFor(questions, withoutGroup, has) > 0) return withoutGroup;
  return { ...withoutGroup, area: null };
}

/** A game's buildings: every one the choice plays, shuffled, those this browser has played last. */
export function gameOrder(
  questions: QuizQuestion[],
  c: QuizChoice,
  played: ReadonlySet<string>,
  has: (id: string) => boolean,
  random: () => number,
): string[] {
  const shuffled = questions.filter((q) => inChoice(q, c, has)).map((q) => q.id);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [...shuffled.filter((id) => !played.has(id)), ...shuffled.filter((id) => played.has(id))];
}

/** Where a world's last choice is kept (localStorage). */
export const choiceKey = (world: string): string => `${world}.quiz.choice`;

/** The last choice this browser made in a world; the default when none, garbled or blocked. */
export function loadChoice(store: Pick<Storage, "getItem">, world: string): QuizChoice {
  try {
    const kept = JSON.parse(
      store.getItem(choiceKey(world)) ?? "null",
    ) as Partial<QuizChoice> | null;
    if (!kept || !QUIZ_LEVELS.includes(kept.level as QuizLevelName)) return DEFAULT_CHOICE;
    return {
      level: kept.level as QuizLevelName,
      area: typeof kept.area === "string" ? kept.area : null,
      group: QUIZ_GROUPS.includes(kept.group as QuizGroup) ? (kept.group as QuizGroup) : null,
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function saveChoice(store: Pick<Storage, "setItem">, world: string, c: QuizChoice): void {
  try {
    store.setItem(choiceKey(world), JSON.stringify(c));
  } catch {
    // storage blocked: the choice lasts as long as the page
  }
}

/** The building and its three wrong names (by default hard's for any borough and kind), shuffled. */
export function choicesFor(
  question: QuizQuestion,
  random: () => number,
  decoys: Three = question.decoys,
): string[] {
  const out = [question.id, ...decoys];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Everyone's answers over the names on offer only: what a name no longer offered got drops out. */
export function tallyShares(
  tally: QuizTally,
  choices: string[],
): { people: number; shares: Map<string, number> } {
  const counts = new Map(tally.picks.map((p) => [p.choice, p.count]));
  const people = choices.reduce((sum, c) => sum + (counts.get(c) ?? 0), 0);
  const shares = new Map(choices.map((c) => [c, people > 0 ? (counts.get(c) ?? 0) / people : 0]));
  return { people, shares };
}

/** Where a world's played buildings are kept (localStorage). */
export const playedKey = (world: string): string => `${world}.quiz.played`;

/** The buildings this browser has played in a world; none when storage is blocked or garbled. */
export function loadPlayed(store: Pick<Storage, "getItem">, world: string): Set<string> {
  try {
    const kept = JSON.parse(store.getItem(playedKey(world)) ?? "[]") as unknown;
    return new Set(
      Array.isArray(kept) ? kept.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function savePlayed(
  store: Pick<Storage, "setItem">,
  world: string,
  played: ReadonlySet<string>,
): void {
  try {
    store.setItem(playedKey(world), JSON.stringify([...played]));
  } catch {
    // storage blocked: the tab remembers them for as long as it plays
  }
}

/** A rectangle in map px, or on screen. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A building's box, from its outline (flat map px rings). */
export function sightBox(rings: number[][]): Box {
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const ring of rings)
    for (let i = 0; i + 1 < ring.length; i += 2) {
      box.left = Math.min(box.left, ring[i]);
      box.right = Math.max(box.right, ring[i]);
      box.top = Math.min(box.top, ring[i + 1]);
      box.bottom = Math.max(box.bottom, ring[i + 1]);
    }
  return box;
}

/**
 * The view a round flies to: the building filling 60% of the part of the screen the card leaves
 * free, no closer than 2 (nor than the map allows), landing on 1 when that is near (where the
 * pixel art is crisp), and its middle in that free part's middle.
 */
export function roundView(
  box: Box,
  screen: { width: number; height: number },
  free: Box,
  limits: { min: number; max: number },
): { x: number; y: number; scale: number } {
  const w = Math.max(1, box.right - box.left);
  const h = Math.max(1, box.bottom - box.top);
  let scale = Math.min((0.6 * (free.right - free.left)) / w, (0.6 * (free.bottom - free.top)) / h);
  if (scale > 0.55 && scale < 1.6) scale = 1;
  scale = Math.min(Math.max(scale, limits.min), Math.min(limits.max, 2));
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  return {
    x: cx + (screen.width / 2 - (free.left + free.right) / 2) / scale,
    y: cy + (screen.height / 2 - (free.top + free.bottom) / 2) / scale,
    scale,
  };
}

/** A game: what was chosen, its buildings in order, where it is, how many were right. */
export interface QuizGame {
  choice: QuizChoice;
  queue: string[];
  /** the building being asked: queue[index]; the round is index + 1 */
  index: number;
  right: number;
}

export type QuizState =
  | { phase: "off" }
  | { phase: "choosing" }
  | { phase: "empty" }
  | { phase: "loading"; game: QuizGame }
  | { phase: "asking"; game: QuizGame; question: QuizQuestion; choices: string[] }
  | {
      phase: "answered";
      game: QuizGame;
      question: QuizQuestion;
      choices: string[];
      pick: string;
      /** "waiting" while the API is asked; null when it did not answer */
      tally: QuizTally | null | "waiting";
      /** whether the API keeps this answer (a visit is counted): only then is it "the first" */
      recorded: boolean;
    }
  | { phase: "finished"; game: QuizGame };

export type QuizAction =
  | { type: "open" }
  | { type: "start"; choice: QuizChoice; queue: string[] }
  | { type: "ask"; question: QuizQuestion; choices: string[] }
  | { type: "pick"; choice: string; recorded?: boolean }
  | { type: "tally"; sightId: string; tally: QuizTally | null }
  | { type: "next" }
  | { type: "again"; queue: string[] }
  | { type: "change" }
  | { type: "fail" }
  | { type: "stop" };

const inGame = (state: QuizState): state is Extract<QuizState, { game: QuizGame }> =>
  "game" in state;

/** The game's states; an action that does not apply where the game is changes nothing. */
export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "open":
      return state.phase === "off" || state.phase === "empty" ? { phase: "choosing" } : state;
    case "start":
      if (state.phase !== "choosing") return state;
      return action.queue.length === 0
        ? { phase: "empty" }
        : {
            phase: "loading",
            game: { choice: action.choice, queue: action.queue, index: 0, right: 0 },
          };
    case "ask":
      return state.phase === "loading"
        ? { phase: "asking", game: state.game, question: action.question, choices: action.choices }
        : state;
    case "pick":
      if (state.phase !== "asking" || !state.choices.includes(action.choice)) return state;
      return {
        ...state,
        phase: "answered",
        pick: action.choice,
        game: {
          ...state.game,
          right: state.game.right + (action.choice === state.question.id ? 1 : 0),
        },
        tally: "waiting",
        recorded: action.recorded ?? true,
      };
    case "tally":
      return state.phase === "answered" && state.question.id === action.sightId
        ? { ...state, tally: action.tally }
        : state;
    case "next":
      if (state.phase !== "answered") return state;
      return state.game.index + 1 < state.game.queue.length
        ? { phase: "loading", game: { ...state.game, index: state.game.index + 1 } }
        : { phase: "finished", game: state.game };
    case "again":
      if (state.phase !== "finished") return state;
      return action.queue.length === 0
        ? { phase: "empty" }
        : {
            phase: "loading",
            game: { choice: state.game.choice, queue: action.queue, index: 0, right: 0 },
          };
    case "change":
      return inGame(state) ? { phase: "choosing" } : state;
    case "fail":
      return { phase: "empty" };
    case "stop":
      return state.phase === "off" ? state : { phase: "off" };
  }
}

/** What a key does to a game: a pick (0–3), going on, starting, playing again, stopping, or nothing. */
export type QuizKey = { pick: number } | "next" | "start" | "again" | "stop" | null;

/**
 * The game's keys, taken before the map's own: A–D or 1–4 pick while asking; Enter or N go on
 * once answered (Enter only when no control has the focus, which its own Enter belongs to);
 * Esc stops. A key held down repeats nothing.
 */
export function quizKey(
  phase: QuizState["phase"],
  e: { key: string; repeat: boolean; onControl: boolean },
): QuizKey {
  if (phase === "off" || e.repeat) return null;
  if (e.key === "Escape") return "stop";
  const key = e.key.toLowerCase();
  if (phase === "asking" && key.length === 1) {
    const i = "abcd".includes(key) ? "abcd".indexOf(key) : "1234".indexOf(key);
    return i >= 0 ? { pick: i } : null;
  }
  if (phase === "answered" && (key === "n" || (e.key === "Enter" && !e.onControl))) return "next";
  if (e.key === "Enter" && !e.onControl) {
    if (phase === "choosing") return "start";
    if (phase === "finished") return "again";
  }
  return null;
}

/** The running score, "round 3 of 96 · 2 right", in the singular for one right answer. */
export function quizScore(
  words: { one: string; other: string },
  round: number,
  right: number,
  total = 0,
): string {
  return (right === 1 ? words.one : words.other)
    .replace("{round}", String(round))
    .replace("{total}", String(total))
    .replace("{right}", String(right));
}

/** The questions a game plays from: this language's, or, while they load, those it started with. */
export function questionsToPlay(
  current: QuizQuestion[] | null,
  started: QuizQuestion[],
): QuizQuestion[] {
  return current && current.length > 0 ? current : started;
}

/** Whether the round being played is the game's last: its button leads to the score. */
export function isLastRound(game: QuizGame): boolean {
  return game.index + 1 >= game.queue.length;
}

/**
 * What the line under the verdict says: "first" when the visitor's own counted answer is the
 * only one, a count when others have answered, nothing when nobody has been counted.
 */
export function peopleNote(people: number, recorded: boolean): "first" | "count" | null {
  if (people === 0) return null;
  return recorded && people === 1 ? "first" : "count";
}

/** What a screen reader is told as the game moves on: the verdict, then the score at the end. */
export function liveLine(
  state: QuizState,
  name: (id: string) => string,
  words: { right: string; wrong: string; end: string },
): string {
  if (state.phase === "answered")
    return state.pick === state.question.id
      ? words.right
      : words.wrong.replace("{name}", name(state.question.id));
  if (state.phase === "finished")
    return words.end
      .replace("{right}", String(state.game.right))
      .replace("{total}", String(state.game.queue.length));
  return "";
}
