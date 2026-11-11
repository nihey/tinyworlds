import { describe, expect, it } from "vitest";
import { parseQuiz } from "../quiz";

const good = {
  id: "b1",
  decoys: ["b2", "b3", "b4"],
  parts: ["", "The Flatiron", " is old."],
  lang: "en",
};

describe("parseQuiz", () => {
  it("keeps a question with three other names and a text", () => {
    expect(parseQuiz({ questions: [good] })).toEqual([
      { ...good, sets: {}, level: 1, group: "buildings" },
    ]);
  });

  it("takes English when a question does not say its language", () => {
    const bare: Partial<typeof good> = { ...good };
    delete bare.lang;
    expect(parseQuiz({ questions: [bare] })[0].lang).toBe("en");
  });

  it("drops a question it could not ask", () => {
    const questions = [
      { ...good, decoys: ["b2", "b3"] },
      { ...good, decoys: ["b2", "b1", "b4"] },
      { ...good, decoys: ["b2", "b2", "b4"] },
      { ...good, parts: [] },
      { ...good, parts: ["a", 3, "b"] },
      { ...good, id: 7 },
      null,
    ];
    expect(parseQuiz({ questions })).toEqual([]);
  });

  it("reads nothing out of something that is not a quiz", () => {
    expect(parseQuiz(null)).toEqual([]);
    expect(parseQuiz({ questions: "no" })).toEqual([]);
  });
});

describe("parseQuiz, with choices", () => {
  const full = {
    ...good,
    level: 2,
    group: "museums",
    area: "Bronx",
    sets: {
      hard: { all: ["b2", "b3", "b4"], area: ["b5", "b6", "b7"] },
      medium: { all: ["b8", "b9", "b10"] },
    },
  };

  it("keeps the level, kind, borough and wrong-answer sets", () => {
    expect(parseQuiz({ questions: [full] })[0]).toMatchObject({
      level: 2,
      group: "museums",
      area: "Bronx",
      sets: full.sets,
    });
  });

  it("drops a broken set rather than the question, and reads an older file as easy for everyone", () => {
    const broken = { ...full, sets: { hard: { all: ["b2", "b1", "b4"] }, easy: "no" } };
    expect(parseQuiz({ questions: [broken] })[0].sets).toEqual({});
    expect(parseQuiz({ questions: [good] })[0]).toMatchObject({
      level: 1,
      group: "buildings",
      sets: {},
    });
  });
});
