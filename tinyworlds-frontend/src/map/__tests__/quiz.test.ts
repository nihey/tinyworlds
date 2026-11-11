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
    expect(parseQuiz({ questions: [good] })).toEqual([good]);
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
