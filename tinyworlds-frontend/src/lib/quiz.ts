import type { QuizQuestion } from "@/map/quiz";
import type { SightType } from "@/map/sights";

/**
 * Guess the building, without React: which building comes next, the order of the four names,
 * the shares of everyone's answers, the view a round flies to, and the round's states.
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

/**
 * The next building, at random among those this browser has not played; once all have been,
 * the list starts over. A question whose building or any wrong name is not on the map (`has`)
 * is never asked. Null when there is nothing to ask. `played` comes back with the pick in it.
 */
export function nextQuestion(
  questions: QuizQuestion[],
  played: ReadonlySet<string>,
  has: (id: string) => boolean,
  random: () => number,
): { question: QuizQuestion; played: Set<string> } | null {
  const usable = questions.filter((q) => has(q.id) && q.decoys.every(has));
  if (usable.length === 0) return null;
  let fresh = usable.filter((q) => !played.has(q.id));
  let kept = new Set(played);
  if (fresh.length === 0) {
    fresh = usable;
    kept = new Set();
  }
  const question = fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
  kept.add(question.id);
  return { question, played: kept };
}

/** The building and its three wrong names, shuffled. */
export function choicesFor(question: QuizQuestion, random: () => number): string[] {
  const out = [question.id, ...question.decoys];
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

export type QuizState =
  | { phase: "off" }
  | { phase: "empty" }
  | { phase: "loading"; round: number; right: number }
  | { phase: "asking"; round: number; right: number; question: QuizQuestion; choices: string[] }
  | {
      phase: "answered";
      round: number;
      right: number;
      question: QuizQuestion;
      choices: string[];
      pick: string;
      /** "waiting" while the API is asked; null when it did not answer */
      tally: QuizTally | null | "waiting";
    };

export type QuizAction =
  | { type: "start" }
  | { type: "ask"; question: QuizQuestion; choices: string[] }
  | { type: "pick"; choice: string }
  | { type: "tally"; sightId: string; tally: QuizTally | null }
  | { type: "next" }
  | { type: "fail" }
  | { type: "stop" };

/** The game's states; an action that does not apply where the game is changes nothing. */
export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "start":
      return state.phase === "off" || state.phase === "empty"
        ? { phase: "loading", round: 0, right: 0 }
        : state;
    case "ask":
      return state.phase === "loading"
        ? {
            phase: "asking",
            round: state.round + 1,
            right: state.right,
            question: action.question,
            choices: action.choices,
          }
        : state;
    case "pick":
      if (state.phase !== "asking" || !state.choices.includes(action.choice)) return state;
      return {
        ...state,
        phase: "answered",
        pick: action.choice,
        right: state.right + (action.choice === state.question.id ? 1 : 0),
        tally: "waiting",
      };
    case "tally":
      return state.phase === "answered" && state.question.id === action.sightId
        ? { ...state, tally: action.tally }
        : state;
    case "next":
      return state.phase === "answered"
        ? { phase: "loading", round: state.round, right: state.right }
        : state;
    case "fail":
      return { phase: "empty" };
    case "stop":
      return state.phase === "off" ? state : { phase: "off" };
  }
}

/** What a key does to a game: a pick (0–3), going on, stopping, or nothing. */
export type QuizKey = { pick: number } | "next" | "stop" | null;

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
  return null;
}

/** The running score, "round 3 · 2 right", in the singular for one right answer. */
export function quizScore(
  words: { one: string; other: string },
  round: number,
  right: number,
): string {
  return (right === 1 ? words.one : words.other)
    .replace("{round}", String(round))
    .replace("{right}", String(right));
}
