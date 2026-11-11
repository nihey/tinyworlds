import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/map/quiz";
import {
  choicesFor,
  loadPlayed,
  nextQuestion,
  playedKey,
  questionKind,
  quizKey,
  quizReducer,
  roundView,
  savePlayed,
  sightBox,
  tallyShares,
  type QuizState,
} from "../quiz";

const q = (id: string, decoys: [string, string, string] = ["x1", "x2", "x3"]): QuizQuestion => ({
  id,
  decoys,
  parts: ["", "The name", " is a building."],
  lang: "en",
});
const every = () => true;
/** A random source that gives these numbers in turn. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("nextQuestion", () => {
  const questions = [q("a"), q("b"), q("c")];

  it("never asks a played building while others are left", () => {
    for (const r of [0, 0.5, 0.99]) {
      const next = nextQuestion(questions, new Set(["a", "c"]), every, () => r);
      expect(next?.question.id).toBe("b");
      expect([...next!.played].sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("starts over once every building has been played", () => {
    const next = nextQuestion(questions, new Set(["a", "b", "c"]), every, () => 0);
    expect(next?.question.id).toBe("a");
    expect([...next!.played]).toEqual(["a"]);
  });

  it("skips a question whose building or any wrong name is not on the map", () => {
    const has = (id: string) => id !== "c" && id !== "x9";
    const list = [q("a", ["x1", "x9", "x3"]), q("b"), q("c")];
    for (const r of [0, 0.5, 0.99])
      expect(nextQuestion(list, new Set(), has, () => r)?.question.id).toBe("b");
  });

  it("has nothing to ask when no question can be asked", () => {
    expect(nextQuestion([], new Set(), every, () => 0)).toBeNull();
    expect(
      nextQuestion(
        questions,
        new Set(),
        () => false,
        () => 0,
      ),
    ).toBeNull();
  });
});

describe("choicesFor", () => {
  it("offers the building and its three wrong names, each once, in an order the dice decide", () => {
    const question = q("a", ["b", "c", "d"]);
    const one = choicesFor(question, seq(0.1, 0.7, 0.3));
    const two = choicesFor(question, seq(0.9, 0.2, 0.6));
    expect([...one].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...two].sort()).toEqual(["a", "b", "c", "d"]);
    expect(one).not.toEqual(two);
  });
});

describe("questionKind", () => {
  it("asks for a station, a bridge or a museum by that name, anything else as a building", () => {
    expect(questionKind("station")).toBe("station");
    expect(questionKind("bridge")).toBe("bridge");
    expect(questionKind("museum")).toBe("museum");
    expect(questionKind("landmark")).toBe("building");
    expect(questionKind("building")).toBe("building");
  });
});

describe("tallyShares", () => {
  it("counts over the four names on offer only", () => {
    const tally = {
      answers: 10,
      picks: [
        { choice: "a", count: 6 },
        { choice: "b", count: 2 },
        { choice: "gone", count: 2 },
      ],
    };
    const { people, shares } = tallyShares(tally, ["a", "b", "c", "d"]);
    expect(people).toBe(8);
    expect(shares.get("a")).toBe(0.75);
    expect(shares.get("b")).toBe(0.25);
    expect(shares.get("c")).toBe(0);
  });

  it("gives every name nothing when nobody has answered", () => {
    const { people, shares } = tallyShares({ answers: 0, picks: [] }, ["a", "b"]);
    expect(people).toBe(0);
    expect(shares.get("a")).toBe(0);
  });
});

describe("the buildings played", () => {
  const store = () => {
    const kept = new Map<string, string>();
    return {
      kept,
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    };
  };

  it("are kept per world and read back", () => {
    const s = store();
    savePlayed(s, "tinynyc", new Set(["a", "b"]));
    expect(s.kept.has(playedKey("tinynyc"))).toBe(true);
    expect(loadPlayed(s, "tinynyc")).toEqual(new Set(["a", "b"]));
    expect(loadPlayed(s, "tinylax")).toEqual(new Set());
  });

  it("are none when what is kept is not a list of ids", () => {
    const s = store();
    s.setItem(playedKey("tinynyc"), "{not json");
    expect(loadPlayed(s, "tinynyc")).toEqual(new Set());
    s.setItem(playedKey("tinynyc"), JSON.stringify([1, "a"]));
    expect(loadPlayed(s, "tinynyc")).toEqual(new Set(["a"]));
  });

  it("cost nothing when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(loadPlayed(blocked, "tinynyc")).toEqual(new Set());
    expect(() => savePlayed(blocked, "tinynyc", new Set(["a"]))).not.toThrow();
  });
});

describe("roundView", () => {
  const screen = { width: 1200, height: 800 };
  const free = { left: 16, top: 72, right: 752, bottom: 784 };
  const limits = { min: 0.01, max: 3 };
  const centreOnScreen = (
    box: ReturnType<typeof sightBox>,
    v: { x: number; y: number; scale: number },
  ) => ({
    x: ((box.left + box.right) / 2 - v.x) * v.scale + screen.width / 2,
    y: ((box.top + box.bottom) / 2 - v.y) * v.scale + screen.height / 2,
  });

  it("finds a building's box from its outline", () => {
    expect(
      sightBox([
        [10, 20, 30, 5, 25, 40],
        [0, 50, 5, 50, 5, 60],
      ]),
    ).toEqual({
      left: 0,
      top: 5,
      right: 30,
      bottom: 60,
    });
  });

  it("puts the building in the middle of the free part of the screen", () => {
    const box = { left: 1000, top: 2000, right: 1100, bottom: 2300 };
    const v = roundView(box, screen, free, limits);
    const c = centreOnScreen(box, v);
    expect(c.x).toBeCloseTo((free.left + free.right) / 2);
    expect(c.y).toBeCloseTo((free.top + free.bottom) / 2);
  });

  it("lands on the crisp native size when it is near, and never closer than 2", () => {
    expect(
      roundView({ left: 0, top: 0, right: 100, bottom: 300 }, screen, free, limits).scale,
    ).toBe(1);
    expect(roundView({ left: 0, top: 0, right: 10, bottom: 10 }, screen, free, limits).scale).toBe(
      2,
    );
    expect(
      roundView({ left: 0, top: 0, right: 10, bottom: 10 }, screen, free, { min: 0.01, max: 1.5 })
        .scale,
    ).toBe(1.5);
  });

  it("draws back for a big building, down to the map's limit", () => {
    const big = roundView({ left: 0, top: 0, right: 3000, bottom: 2000 }, screen, free, limits);
    expect(big.scale).toBeCloseTo((0.6 * 736) / 3000);
    expect(
      roundView({ left: 0, top: 0, right: 3000, bottom: 2000 }, screen, free, { min: 0.5, max: 3 })
        .scale,
    ).toBe(0.5);
  });
});

describe("quizReducer", () => {
  const off: QuizState = { phase: "off" };
  const question = q("a", ["b", "c", "d"]);
  const choices = ["c", "a", "d", "b"];
  const tally = { answers: 3, picks: [{ choice: "a", count: 3 }] };

  it("plays a round: start, ask, pick, tally, next", () => {
    const loading = quizReducer(off, { type: "start" });
    expect(loading).toEqual({ phase: "loading", round: 0, right: 0 });
    const asking = quizReducer(loading, { type: "ask", question, choices });
    expect(asking).toEqual({ phase: "asking", round: 1, right: 0, question, choices });
    const answered = quizReducer(asking, { type: "pick", choice: "a" });
    expect(answered).toMatchObject({ phase: "answered", right: 1, pick: "a", tally: "waiting" });
    const tallied = quizReducer(answered, { type: "tally", sightId: "a", tally });
    expect(tallied).toMatchObject({ phase: "answered", tally });
    const next = quizReducer(tallied, { type: "next" });
    expect(next).toEqual({ phase: "loading", round: 1, right: 1 });
    expect(quizReducer(next, { type: "ask", question, choices })).toMatchObject({
      phase: "asking",
      round: 2,
      right: 1,
    });
  });

  it("counts a wrong pick as not right", () => {
    const asking = quizReducer(quizReducer(off, { type: "start" }), {
      type: "ask",
      question,
      choices,
    });
    expect(quizReducer(asking, { type: "pick", choice: "b" })).toMatchObject({
      right: 0,
      pick: "b",
    });
  });

  it("takes one pick per round, and only one of the names on offer", () => {
    const asking = quizReducer(quizReducer(off, { type: "start" }), {
      type: "ask",
      question,
      choices,
    });
    expect(quizReducer(asking, { type: "pick", choice: "zz" })).toBe(asking);
    const answered = quizReducer(asking, { type: "pick", choice: "b" });
    expect(quizReducer(answered, { type: "pick", choice: "a" })).toBe(answered);
  });

  it("drops a tally that comes back for another building", () => {
    const asking = quizReducer(quizReducer(off, { type: "start" }), {
      type: "ask",
      question,
      choices,
    });
    const answered = quizReducer(asking, { type: "pick", choice: "a" });
    expect(quizReducer(answered, { type: "tally", sightId: "zz", tally })).toBe(answered);
    expect(quizReducer(asking, { type: "tally", sightId: "a", tally })).toBe(asking);
  });

  it("stops from anywhere, and has nothing to ask after a failure", () => {
    const asking = quizReducer(quizReducer(off, { type: "start" }), {
      type: "ask",
      question,
      choices,
    });
    expect(quizReducer(asking, { type: "stop" })).toEqual(off);
    const empty = quizReducer({ phase: "loading", round: 0, right: 0 }, { type: "fail" });
    expect(empty).toEqual({ phase: "empty" });
    expect(quizReducer(empty, { type: "start" })).toEqual({ phase: "loading", round: 0, right: 0 });
    expect(quizReducer(off, { type: "next" })).toBe(off);
  });
});

describe("quizKey", () => {
  const key = (k: string, more: Partial<{ repeat: boolean; onControl: boolean }> = {}) => ({
    key: k,
    repeat: false,
    onControl: false,
    ...more,
  });

  it("picks with A–D and 1–4 while asking, before the map's own letters", () => {
    expect(quizKey("asking", key("a"))).toEqual({ pick: 0 });
    expect(quizKey("asking", key("D"))).toEqual({ pick: 3 });
    expect(quizKey("asking", key("2"))).toEqual({ pick: 1 });
    expect(quizKey("asking", key("e"))).toBeNull();
    expect(quizKey("answered", key("b"))).toBeNull();
  });

  it("goes on with Enter or N once answered, but leaves Enter to a focused control", () => {
    expect(quizKey("answered", key("Enter"))).toBe("next");
    expect(quizKey("answered", key("n"))).toBe("next");
    expect(quizKey("answered", key("Enter", { onControl: true }))).toBeNull();
    expect(quizKey("asking", key("Enter"))).toBeNull();
  });

  it("ignores a key held down", () => {
    expect(quizKey("answered", key("Enter", { repeat: true }))).toBeNull();
    expect(quizKey("asking", key("a", { repeat: true }))).toBeNull();
  });

  it("stops with Esc whenever a game is on, and takes nothing when none is", () => {
    expect(quizKey("loading", key("Escape"))).toBe("stop");
    expect(quizKey("answered", key("Escape", { onControl: true }))).toBe("stop");
    expect(quizKey("off", key("Escape"))).toBeNull();
    expect(quizKey("off", key("a"))).toBeNull();
  });
});
