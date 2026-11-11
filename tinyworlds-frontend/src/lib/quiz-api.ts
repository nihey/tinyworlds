import type { Locale } from "@/i18n/locale";
import { API_URL } from "./donate";
import { currentVisit } from "./funnel";
import type { QuizLevelName } from "@/map/quiz";
import type { QuizTally } from "./quiz";

/**
 * Guess the building's one call to the API: the answer goes out, everyone's tally for that
 * building comes back. Plain `fetch` like the funnel's steps (a map does not download Apollo
 * for it), and never in the way: anything but a tally in time is no tally, and the round ends
 * without the shares.
 */

export const ANSWER =
  "mutation AnswerQuiz($input: AnswerQuizInput!) { answerQuiz(input: $input) { answers picks { choice count } } }";

export interface AnswerInput {
  world: string;
  sightId: string;
  choice: string;
  /** the four names offered: the API counts only these, so what comes back stays small */
  choices: string[];
  /** the game's difficulty: answers are tallied per difficulty */
  level: QuizLevelName;
  locale: Locale;
}

/** The GraphQL request; a visit that is not counted (null) is left out, so nothing is kept. */
export function answerRequest(input: AnswerInput & { visitId: string | null }): {
  query: string;
  variables: { input: Record<string, string | string[]> };
} {
  const { visitId, level, ...rest } = input;
  const sent = { ...rest, level: level.toUpperCase() };
  return { query: ANSWER, variables: { input: visitId ? { ...sent, visitId } : sent } };
}

/** The tally in an answer, or null for errors or anything shaped otherwise. */
export function parseTally(body: unknown): QuizTally | null {
  const b = body as { data?: { answerQuiz?: unknown }; errors?: unknown } | null;
  if (!b || b.errors) return null;
  const t = b.data?.answerQuiz as Partial<QuizTally> | undefined;
  if (!t || typeof t.answers !== "number" || !Array.isArray(t.picks)) return null;
  const picks = t.picks as unknown[];
  const ok = picks.every(
    (p) =>
      typeof (p as { choice?: unknown })?.choice === "string" &&
      typeof (p as { count?: unknown })?.count === "number",
  );
  return ok ? { answers: t.answers, picks: picks as QuizTally["picks"] } : null;
}

/** Sends an answer; resolves to the building's tally, or null (no API, a failure, too slow). Never throws. */
export async function sendAnswer(
  input: AnswerInput,
  opts: { fetch?: typeof fetch; apiUrl?: string; visitId?: string | null; timeoutMs?: number } = {},
): Promise<QuizTally | null> {
  const apiUrl = opts.apiUrl ?? API_URL;
  if (!apiUrl) return null;
  const visitId = "visitId" in opts ? (opts.visitId ?? null) : currentVisit();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await (opts.fetch ?? fetch)(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answerRequest({ ...input, visitId })),
      signal: abort.signal,
    });
    if (!res.ok) return null;
    return parseTally(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
