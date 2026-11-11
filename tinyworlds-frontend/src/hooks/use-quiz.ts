"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Locale } from "@/i18n/locale";
import {
  choicesFor,
  DEFAULT_CHOICE,
  fixChoice,
  gameOrder,
  loadChoice,
  loadPlayed,
  questionsToPlay,
  quizReducer,
  roundView,
  saveChoice,
  savePlayed,
  setFor,
  sightBox,
  type Box,
  type QuizChoice,
  type QuizState,
} from "@/lib/quiz";
import { currentVisit } from "@/lib/funnel";
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
 * Guess the building: choosing what to play, the game's state, and what it does to the map. The
 * questions are fetched when the game opens, per language; a game is the chosen buildings in
 * order, each held lit (`engine.holdSight`) and flown to in its round; an answer goes to the
 * API and its tally comes back into the state.
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
  /** this language's questions, null while they load */
  questions: QuizQuestion[] | null;
  has: (id: string) => boolean;
  choice: QuizChoice;
  setChoice(c: QuizChoice): void;
  open(): void;
  start(): void;
  pick(choice: string): void;
  next(): void;
  again(): void;
  change(): void;
  stop(): void;
} {
  const [state, dispatch] = useReducer(quizReducer, { phase: "off" });
  const sightById = useMemo(() => new Map(sights.map((s) => [s.id, s])), [sights]);
  const has = useCallback((id: string) => sightById.has(id), [sightById]);
  const [loaded, setLoaded] = useState<{ locale: Locale; list: QuizQuestion[] } | null>(null);
  const cache = useRef(new Map<Locale, QuizQuestion[]>());
  // the questions a game was started with: a language change mid-game finds them there
  const gameQuestions = useRef<QuizQuestion[]>([]);
  const played = useRef<Set<string> | null>(null);
  const [chosen, setChosen] = useState<QuizChoice>(DEFAULT_CHOICE);
  const questions = loaded?.locale === locale ? loaded.list : null;
  // the choice as it can be played: a remembered one that plays nothing here lets go of what empties it
  const choice = questions && questions.length > 0 ? fixChoice(questions, chosen, has) : chosen;

  // this language's questions, whenever the game is open
  useEffect(() => {
    if (state.phase === "off" || !build) return;
    const kept = cache.current.get(locale);
    if (kept) {
      setLoaded({ locale, list: kept });
      return;
    }
    let gone = false;
    // a file that does not come within 10 s is none: the card says there is nothing to play
    loadQuiz(build, locale, AbortSignal.timeout(10_000))
      .catch(() => [] as QuizQuestion[])
      .then((list) => {
        if (gone) return;
        if (list.length > 0) cache.current.set(locale, list);
        setLoaded({ locale, list });
      });
    return () => {
      gone = true;
    };
  }, [state.phase, build, locale]);

  // a choosing step with nothing to choose from has nothing to play
  useEffect(() => {
    if (state.phase === "choosing" && questions && questions.length === 0)
      dispatch({ type: "fail" });
  }, [state.phase, questions]);

  const setChoice = useCallback(
    (c: QuizChoice) => {
      const fixed = questions ? fixChoice(questions, c, has) : c;
      setChosen(fixed);
      saveChoice(local, WORLD.id, fixed);
    },
    [questions, has],
  );

  const open = useCallback(() => {
    setChosen(loadChoice(local, WORLD.id));
    dispatch({ type: "open" });
  }, []);

  const queueFor = useCallback(
    (c: QuizChoice) => {
      played.current ??= loadPlayed(local, WORLD.id);
      // while a new language's questions load, Play again uses those the game started with
      const list = questionsToPlay(questions, gameQuestions.current);
      gameQuestions.current = list;
      return gameOrder(list, c, played.current, has, Math.random);
    },
    [questions, has],
  );

  const start = useCallback(() => {
    if (state.phase !== "choosing" || !questions) return;
    dispatch({ type: "start", choice, queue: queueFor(choice) });
  }, [state.phase, questions, choice, queueFor]);

  const again = useCallback(() => {
    if (state.phase !== "finished") return;
    dispatch({ type: "again", queue: queueFor(state.game.choice) });
  }, [state, queueFor]);

  // a round to start: its building, its four names, the hold and the flight
  useEffect(() => {
    if (state.phase !== "loading" || !engine) return;
    const { game } = state;
    const id = game.queue[game.index];
    const question =
      questions?.find((q) => q.id === id) ?? gameQuestions.current.find((q) => q.id === id);
    const sight = question && sightById.get(question.id);
    if (!question || !sight) {
      engine.holdSight(null);
      dispatch({ type: "fail" });
      return;
    }
    played.current ??= loadPlayed(local, WORLD.id);
    played.current.add(question.id);
    savePlayed(local, WORLD.id, played.current);
    dispatch({
      type: "ask",
      question,
      choices: choicesFor(question, Math.random, setFor(question, game.choice)),
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
  }, [state, engine, questions, sightById, compact]);

  // between games the map is the visitor's again
  useEffect(() => {
    if (state.phase === "choosing" || state.phase === "finished" || state.phase === "empty")
      engine?.holdSight(null);
  }, [state.phase, engine]);

  // the game ends with the page too
  useEffect(() => () => engine?.holdSight(null), [engine]);

  const next = useCallback(() => dispatch({ type: "next" }), []);
  const change = useCallback(() => dispatch({ type: "change" }), []);
  const stop = useCallback(() => {
    dispatch({ type: "stop" });
    engine?.holdSight(null);
  }, [engine]);
  const pick = useCallback(
    (picked: string) => {
      if (state.phase !== "asking" || !state.choices.includes(picked)) return;
      const sightId = state.question.id;
      // only an answer the API keeps (a counted visit) can be "the first"
      dispatch({ type: "pick", choice: picked, recorded: currentVisit() !== null });
      void sendAnswer({
        world: WORLD.id,
        sightId,
        choice: picked,
        choices: state.choices,
        level: state.game.choice.level,
        locale,
      }).then((tally) => dispatch({ type: "tally", sightId, tally }));
    },
    [state, locale],
  );

  const sight =
    state.phase === "asking" || state.phase === "answered"
      ? sightById.get(state.question.id)
      : undefined;
  return {
    state,
    sight,
    questions,
    has,
    choice,
    setChoice,
    open,
    start,
    pick,
    next,
    again,
    change,
    stop,
  };
}
