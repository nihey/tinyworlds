import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QuizQuestion } from "./quiz.js";
import { writeQuiz } from "./write-quiz.js";

let out: string;
const put = (file: string, body: unknown): void =>
  fs.writeFileSync(path.join(out, file), typeof body === "string" ? body : JSON.stringify(body));
const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(out, file), "utf8"));
const quiet = () => {};

const names = ["Alpha Tower", "Bravo Tower", "Charlie Tower", "Delta Tower", "Echo Tower"];
const sights = names.map((n, i) => ({
  id: `b${i}`,
  n,
  t: "landmark",
  b: "Manhattan",
  lon: -73.98 + i * 0.001,
  lat: 40.75,
  rings: [],
  front: 0,
  anchor: [0, 0],
}));
const textOf = (n: string) =>
  `The ${n} is a tall office building in Manhattan, finished long ago by its builders.`;
const texts = (lang: string) =>
  Object.fromEntries(
    sights.map((s) => [s.id, { title: s.n, url: `https://example.com/${s.id}`, text: textOf(s.n), lang }]),
  );

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "quiz-"));
  put("manifest.json", { name: "tinyx", build: "b1", indexes: "old" });
});
afterEach(() => fs.rmSync(out, { recursive: true, force: true }));

describe("writeQuiz", () => {
  it("writes a question file per language and stamps the indexes", async () => {
    put("sights.json", { sights });
    put("sights.en-US.json", texts("en"));
    put("sights.pt-BR.json", texts("pt"));
    put("sights.es-ES.json", texts("es"));
    await writeQuiz({ out, placeWords: [], views: {}, log: quiet });

    for (const locale of ["en-US", "pt-BR", "es-ES"]) {
      const { questions } = read(`quiz.${locale}.json`) as { questions: QuizQuestion[] };
      expect(questions).toHaveLength(5);
      for (const q of questions) {
        expect(q.decoys).toHaveLength(3);
        expect(q.parts.join("")).toBe(textOf(sights.find((s) => s.id === q.id)!.n));
      }
    }
    expect((read("manifest.json") as { indexes: string }).indexes).not.toBe("old");
  });

  it("writes nothing for a world without sights", async () => {
    await expect(writeQuiz({ out, placeWords: [], views: {}, log: quiet })).resolves.toBeUndefined();
    expect(fs.existsSync(path.join(out, "quiz.en-US.json"))).toBe(false);
  });

  it("lists every blanked text when asked", async () => {
    put("sights.json", { sights });
    put("sights.en-US.json", texts("en"));
    const lines: string[] = [];
    await writeQuiz({ out, placeWords: [], views: {}, list: true, log: (m) => lines.push(m) });
    expect(lines).toContain(
      "en-US  Alpha Tower [1 buildings, 0 views] → ▇ is a tall office building in Manhattan, finished long ago by its builders.",
    );
  });
});
