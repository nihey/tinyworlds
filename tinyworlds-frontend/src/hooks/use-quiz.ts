"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Locale } from "@/i18n/locale";
import {
  choicesFor,
  loadPlayed,
  nextQuestion,
  quizReducer,
  roundView,
  savePlayed,
  sightBox,
  type Box,
  type QuizState,
} from "@/lib/quiz";
import { sendAnswer } from "@/lib/quiz-api";
import { loadQuiz } from "@/map/data";
import type { MapEngine } from "@/map/engine";
import type { QuizQuestion } from "@/map/quiz";
import type { Sight } from "@/map/sights";
import { WORLD } from "@/worlds";

/** localStorage, reached only inside each call, so a browser that blocks it throws where it is caught. */
const local: Pick<Storage, "getItem" | "setItem"> = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

/** The part of the screen the card leaves free: left of it on a wide screen, above it on a phone. */
function freeArea(width: number, height: number, compact: boolean): Box {
  return compact
    ? { left: 0, top: 112, right: width, bottom: height * 0.5 }
    : { left: 16, top: 72, right: width - 448, bottom: height - 16 };
}

/**
 * Guess the building: the round's state, and what it does to the map. A round holds its
 * building lit (`engine.holdSight`) and flies to it; an answer goes to the API and its tally
 * comes back into the state. The questions are fetched the first time the game starts, per
 * language; a language change during a round takes effect on the next one.
 */
export function useQuiz({
  engine,
  sights,
  build,
  locale,
  compact,
}: {
  engine: MapEngine | null;
  sights: Sight[];
  build: string | null;
  locale: Locale;
  compact: boolean;
}): {
  state: QuizState;
  sight: Sight | undefined;
  start(): void;
  pick(choice: string): void;
  next(): void;
  stop(): void;
} {
  const [state, dispatch] = useReducer(quizReducer, { phase: "off" });
  const sightById = useMemo(() => new Map(sights.map((s) => [s.id, s])), [sights]);
  const questions = useRef(new Map<Locale, QuizQuestion[]>());
  const played = useRef<Set<string> | null>(null);

  // a round to start: the questions in this language (once), the next building, the flight
  useEffect(() => {
    if (state.phase !== "loading" || !engine || !build) return;
    let gone = false;
    (async () => {
      let list = questions.current.get(locale);
      if (!list) {
        list = await loadQuiz(build, locale).catch(() => [] as QuizQuestion[]);
        if (gone) return;
        if (list.length > 0) questions.current.set(locale, list);
      }
      played.current ??= loadPlayed(local, WORLD.id);
      const next = nextQuestion(list, played.current, (id) => sightById.has(id), Math.random);
      const sight = next && sightById.get(next.question.id);
      if (!next || !sight) {
        engine.holdSight(null);
        dispatch({ type: "fail" });
        return;
      }
      played.current = next.played;
      savePlayed(local, WORLD.id, next.played);
      dispatch({
        type: "ask",
        question: next.question,
        choices: choicesFor(next.question, Math.random),
      });
      engine.holdSight(sight.id);
      const view = engine.getView();
      engine.flyToMap(
        roundView(
          sightBox(sight.rings),
          view,
          freeArea(view.width, view.height, compact),
          engine.getScaleLimits(),
        ),
      );
    })();
    return () => {
      gone = true;
    };
  }, [state.phase, engine, build, locale, sightById, compact]);

  // the game ends with the page too
  useEffect(() => () => engine?.holdSight(null), [engine]);

  const start = useCallback(() => dispatch({ type: "start" }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const stop = useCallback(() => {
    dispatch({ type: "stop" });
    engine?.holdSight(null);
  }, [engine]);
  const pick = useCallback(
    (choice: string) => {
      if (state.phase !== "asking" || !state.choices.includes(choice)) return;
      const sightId = state.question.id;
      dispatch({ type: "pick", choice });
      void sendAnswer({ world: WORLD.id, sightId, choice, locale }).then((tally) =>
        dispatch({ type: "tally", sightId, tally }),
      );
    },
    [state, locale],
  );

  const sight =
    state.phase === "asking" || state.phase === "answered"
      ? sightById.get(state.question.id)
      : undefined;
  return { state, sight, start, pick, next, stop };
}
