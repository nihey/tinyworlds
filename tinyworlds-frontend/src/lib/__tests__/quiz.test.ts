import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/map/quiz";
import {
  choicesFor,
  areasOf,
  chipCounts,
  countFor,
  DEFAULT_CHOICE,
  fixChoice,
  gameOrder,
  inChoice,
  isLastRound,
  liveLine,
  peopleNote,
  questionsToPlay,
  loadChoice,
  loadPlayed,
  saveChoice,
  scopeOf,
  setFor,
  playedKey,
  questionKind,
  quizKey,
  quizReducer,
  quizScore,
  roundView,
  savePlayed,
  sightBox,
  tallyShares,
  type QuizChoice,
  type QuizState,
} from "../quiz";

const q = (id: string, decoys: [string, string, string] = ["x1", "x2", "x3"]): QuizQuestion => ({
  id,
  decoys,
  sets: {},
  level: 1,
  group: "buildings",
  parts: ["", "The name", " is a building."],
  lang: "en",
});
/** A random source that gives these numbers in turn. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

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

describe("quizScore", () => {
  const words = {
    one: "ronda {round} · {right} acierto",
    other: "ronda {round} · {right} aciertos",
  };

  it("says one right answer in the singular, and none or several in the plural", () => {
    expect(quizScore(words, 1, 1)).toBe("ronda 1 · 1 acierto");
    expect(quizScore(words, 1, 0)).toBe("ronda 1 · 0 aciertos");
    expect(quizScore(words, 3, 2)).toBe("ronda 3 · 2 aciertos");
  });
});

// ---- choices and games ----------------------------------------------------------------------

/** A question with its level, kind and borough, and one set per difficulty it is in. */
function cq(
  id: string,
  level: 1 | 2 | 3,
  group: QuizQuestion["group"],
  area?: string,
): QuizQuestion {
  const set = (tag: string): [string, string, string] => [`${tag}1`, `${tag}2`, `${tag}3`];
  const sets: QuizQuestion["sets"] = { hard: { all: set("h"), area: set("ha") } };
  if (level <= 2) sets.medium = { all: set("m") };
  if (level <= 1) sets.easy = { all: set("e"), group: set("eg"), both: set("eb") };
  return {
    id,
    decoys: set("h"),
    sets,
    level,
    group,
    ...(area ? { area } : {}),
    parts: ["x"],
    lang: "en",
  };
}
const city = [
  cq("a", 1, "buildings", "Manhattan"),
  cq("b", 1, "museums", "Manhattan"),
  cq("c", 2, "buildings", "Bronx"),
  cq("d", 3, "stations", "Bronx"),
  cq("e", 3, "landmarks"),
  cq("f", 1, "buildings", "Staten Island"),
];
const choose = (c: Partial<QuizChoice>): QuizChoice => ({ ...DEFAULT_CHOICE, ...c });

describe("which questions a choice plays", () => {
  it("takes easy's in easy, easy's and medium's in medium, everything in hard", () => {
    expect(city.filter((q) => inChoice(q, choose({ level: "easy" }))).map((q) => q.id)).toEqual([
      "a",
      "b",
      "f",
    ]);
    expect(countFor(city, choose({ level: "medium" }))).toBe(4);
    expect(countFor(city, choose({ level: "hard" }))).toBe(6);
  });

  it("narrows by borough and by kind", () => {
    expect(countFor(city, choose({ level: "hard", area: "Bronx" }))).toBe(2);
    expect(countFor(city, choose({ level: "hard", group: "buildings" }))).toBe(3);
    expect(countFor(city, choose({ level: "hard", area: "Bronx", group: "stations" }))).toBe(1);
  });

  it("plays only questions whose building and wrong names are on the map", () => {
    const has = (id: string) => id !== "b" && id !== "e1";
    expect(
      city.filter((q) => inChoice(q, choose({ level: "easy" }), has)).map((q) => q.id),
    ).toEqual([]);
    expect(
      city.filter((q) => inChoice(q, choose({ level: "hard" }), has)).map((q) => q.id),
    ).toEqual(["a", "c", "d", "e", "f"]);
  });

  it("plays an older file, with no levels or sets, at every difficulty with its decoys", () => {
    const old: QuizQuestion = {
      id: "z",
      decoys: ["y1", "y2", "y3"],
      sets: {},
      level: 1,
      group: "buildings",
      parts: ["x"],
      lang: "en",
    };
    expect(inChoice(old, choose({ level: "easy" }))).toBe(true);
    expect(setFor(old, choose({ level: "easy", area: "Bronx" }))).toEqual(["y1", "y2", "y3"]);
  });

  it("counts each chip with the other two rows as they are, so an empty one can be struck out", () => {
    const counts = chipCounts(city, choose({ level: "easy", area: "Staten Island" }));
    expect(counts.levels).toEqual({ easy: 1, medium: 1, hard: 1 });
    expect(counts.groups.get("buildings")).toBe(1);
    expect(counts.groups.get("museums") ?? 0).toBe(0);
    expect(counts.areas.get("Manhattan")).toBe(2);
    expect(counts.areas.get("Bronx") ?? 0).toBe(0);
  });

  it("lists the boroughs most questions first", () => {
    expect(areasOf([...city, cq("g", 3, "buildings", "Manhattan")])).toEqual([
      "Manhattan",
      "Bronx",
      "Staten Island",
    ]);
    // a tie goes by name
    expect(areasOf(city)).toEqual(["Bronx", "Manhattan", "Staten Island"]);
  });

  it("lets go of the kind, then the borough, when a change leaves nothing to play", () => {
    expect(fixChoice(city, choose({ level: "easy", area: "Bronx", group: "stations" }))).toEqual(
      choose({ level: "easy", area: null, group: null }),
    );
    expect(
      fixChoice(city, choose({ level: "easy", area: "Manhattan", group: "stations" })),
    ).toEqual(choose({ level: "easy", area: "Manhattan", group: null }));
    const fine = choose({ level: "hard", area: "Bronx", group: "stations" });
    expect(fixChoice(city, fine)).toBe(fine);
  });
});

describe("a round's wrong answers", () => {
  it("come from the set for the game's difficulty and how the choice narrows it", () => {
    expect(scopeOf(choose({}))).toBe("all");
    expect(scopeOf(choose({ area: "Bronx" }))).toBe("area");
    expect(scopeOf(choose({ group: "museums" }))).toBe("group");
    expect(scopeOf(choose({ area: "Bronx", group: "museums" }))).toBe("both");
    const a = city[0];
    expect(setFor(a, choose({ level: "easy" }))).toEqual(["e1", "e2", "e3"]);
    expect(setFor(a, choose({ level: "easy", area: "Manhattan", group: "buildings" }))).toEqual([
      "eb1",
      "eb2",
      "eb3",
    ]);
    // a scope left out of the file is the same as all's
    expect(setFor(a, choose({ level: "easy", area: "Manhattan" }))).toEqual(["e1", "e2", "e3"]);
    expect(setFor(a, choose({ level: "hard", area: "Manhattan" }))).toEqual(["ha1", "ha2", "ha3"]);
  });
});

describe("gameOrder", () => {
  it("asks each of the choice's buildings once, those played before last", () => {
    const order = gameOrder(
      city,
      choose({ level: "hard" }),
      new Set(["a", "b"]),
      () => true,
      () => 0.5,
    );
    expect([...order].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(order.slice(-2).sort()).toEqual(["a", "b"]);
  });

  it("leaves out what the map does not have", () => {
    expect(
      gameOrder(
        city,
        choose({ level: "easy" }),
        new Set(),
        (id) => id !== "a",
        () => 0,
      ),
    ).not.toContain("a");
  });
});

describe("the remembered choice", () => {
  const store = () => {
    const kept = new Map<string, string>();
    return {
      kept,
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
    };
  };

  it("comes back as it was kept, and is easy, all and all the first time", () => {
    const s = store();
    expect(loadChoice(s, "tinynyc")).toEqual(DEFAULT_CHOICE);
    expect(DEFAULT_CHOICE).toEqual({ level: "easy", area: null, group: null });
    const mine = choose({ level: "hard", area: "Bronx", group: "museums" });
    saveChoice(s, "tinynyc", mine);
    expect(loadChoice(s, "tinynyc")).toEqual(mine);
  });

  it("is the default when what is kept is not a choice, or storage is blocked", () => {
    const s = store();
    s.setItem("tinynyc.quiz.choice", JSON.stringify({ level: "insane", area: 3, group: "pizza" }));
    expect(loadChoice(s, "tinynyc")).toEqual(DEFAULT_CHOICE);
    const blocked = {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
    };
    expect(loadChoice(blocked, "tinynyc")).toEqual(DEFAULT_CHOICE);
    expect(() => saveChoice(blocked, "tinynyc", DEFAULT_CHOICE)).not.toThrow();
  });
});

describe("quizReducer", () => {
  const off: QuizState = { phase: "off" };
  const question = city[0];
  const choices = ["e2", "a", "e1", "e3"];
  const tally = { answers: 3, picks: [{ choice: "a", count: 3 }] };
  const game = (s: QuizState) => (s as Extract<QuizState, { game: unknown }>).game;

  it("plays a game of two from choosing to the end, and again", () => {
    const choosing = quizReducer(off, { type: "open" });
    expect(choosing).toEqual({ phase: "choosing" });
    const loading = quizReducer(choosing, {
      type: "start",
      choice: DEFAULT_CHOICE,
      queue: ["a", "b"],
    });
    expect(loading).toMatchObject({
      phase: "loading",
      game: { queue: ["a", "b"], index: 0, right: 0 },
    });
    const asking = quizReducer(loading, { type: "ask", question, choices });
    const answered = quizReducer(asking, { type: "pick", choice: "a" });
    expect(game(answered).right).toBe(1);
    expect(quizReducer(answered, { type: "tally", sightId: "a", tally })).toMatchObject({ tally });
    const second = quizReducer(answered, { type: "next" });
    expect(second).toMatchObject({ phase: "loading", game: { index: 1, right: 1 } });
    const last = quizReducer(
      quizReducer(second, { type: "ask", question: city[1], choices: ["b", "x", "y", "z"] }),
      { type: "pick", choice: "x" },
    );
    const finished = quizReducer(last, { type: "next" });
    expect(finished).toMatchObject({
      phase: "finished",
      game: { index: 1, right: 1, queue: ["a", "b"] },
    });
    const again = quizReducer(finished, { type: "again", queue: ["b", "a"] });
    expect(again).toMatchObject({
      phase: "loading",
      game: { queue: ["b", "a"], index: 0, right: 0, choice: DEFAULT_CHOICE },
    });
  });

  it("takes one pick per round, only of the names on offer, and drops a late tally", () => {
    const asking = quizReducer(
      quizReducer(quizReducer(off, { type: "open" }), {
        type: "start",
        choice: DEFAULT_CHOICE,
        queue: ["a"],
      }),
      { type: "ask", question, choices },
    );
    expect(quizReducer(asking, { type: "pick", choice: "zz" })).toBe(asking);
    const answered = quizReducer(asking, { type: "pick", choice: "e1" });
    expect(quizReducer(answered, { type: "pick", choice: "a" })).toBe(answered);
    expect(quizReducer(answered, { type: "tally", sightId: "zz", tally })).toBe(answered);
  });

  it("goes back to choosing from a game, stops from anywhere, and has nothing to play after a failure", () => {
    const loading = quizReducer(quizReducer(off, { type: "open" }), {
      type: "start",
      choice: DEFAULT_CHOICE,
      queue: ["a"],
    });
    expect(quizReducer(loading, { type: "change" })).toEqual({ phase: "choosing" });
    expect(quizReducer(loading, { type: "stop" })).toEqual(off);
    expect(quizReducer(loading, { type: "fail" })).toEqual({ phase: "empty" });
    expect(
      quizReducer(quizReducer(off, { type: "open" }), {
        type: "start",
        choice: DEFAULT_CHOICE,
        queue: [],
      }),
    ).toEqual({ phase: "empty" });
    expect(quizReducer(off, { type: "next" })).toBe(off);
  });
});

describe("quizKey in the new places", () => {
  const key = (k: string, onControl = false) => ({ key: k, repeat: false, onControl });

  it("starts from choosing and plays again at the end with Enter, unless a control has it", () => {
    expect(quizKey("choosing", key("Enter"))).toBe("start");
    expect(quizKey("choosing", key("Enter", true))).toBeNull();
    expect(quizKey("finished", key("Enter"))).toBe("again");
    expect(quizKey("choosing", key("Escape"))).toBe("stop");
  });
});

describe("polish (follow-up)", () => {
  const game = { choice: DEFAULT_CHOICE, queue: ["a", "b"], index: 0, right: 0 };

  it("plays again from the questions the game started with while a new language loads", () => {
    const started = [city[0], city[1]];
    expect(questionsToPlay(null, started)).toBe(started);
    expect(questionsToPlay([], started)).toBe(started);
    const fresh = [city[2]];
    expect(questionsToPlay(fresh, started)).toBe(fresh);
  });

  it("knows the last round, whose button leads to the score", () => {
    expect(isLastRound(game)).toBe(false);
    expect(isLastRound({ ...game, index: 1 })).toBe(true);
  });

  it("says first only of the visitor's own counted answer", () => {
    expect(peopleNote(1, true)).toBe("first");
    expect(peopleNote(1, false)).toBe("count");
    expect(peopleNote(0, false)).toBeNull();
    expect(peopleNote(0, true)).toBeNull();
    expect(peopleNote(5, true)).toBe("count");
  });

  it("keeps whether an answer was counted with the round", () => {
    const asking = quizReducer(
      quizReducer(quizReducer({ phase: "off" }, { type: "open" }), {
        type: "start",
        choice: DEFAULT_CHOICE,
        queue: ["a"],
      }),
      { type: "ask", question: city[0], choices: ["a", "e1", "e2", "e3"] },
    );
    expect(quizReducer(asking, { type: "pick", choice: "a", recorded: false })).toMatchObject({
      recorded: false,
    });
    expect(quizReducer(asking, { type: "pick", choice: "a" })).toMatchObject({ recorded: true });
  });

  it("gives a screen reader the verdict, then the score", () => {
    const words = {
      right: "Right!",
      wrong: "Not quite. It's {name}.",
      end: "You named {right} of {total}.",
    };
    const answered = {
      phase: "answered" as const,
      game,
      question: city[0],
      choices: ["a", "e1", "e2", "e3"],
      pick: "e1",
      tally: "waiting" as const,
      recorded: true,
    };
    const name = (id: string) => (id === "a" ? "Alpha Tower" : id);
    expect(liveLine(answered, name, words)).toBe("Not quite. It's Alpha Tower.");
    expect(liveLine({ ...answered, pick: "a" }, name, words)).toBe("Right!");
    expect(liveLine({ phase: "finished", game: { ...game, right: 1 } }, name, words)).toBe(
      "You named 1 of 2.",
    );
    expect(liveLine({ phase: "choosing" }, name, words)).toBe("");
  });
});
