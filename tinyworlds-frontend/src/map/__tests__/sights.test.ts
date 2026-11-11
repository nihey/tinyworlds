import { describe, expect, it } from "vitest";
import { buildSightShapes, parseSights, parseSightTexts, sightAt, type Sight } from "../sights";

const square = (x: number, y: number, s: number): number[] => [
  x,
  y,
  x + s,
  y,
  x + s,
  y + s,
  x,
  y + s,
];
const sight = (id: string, rings: number[][], front: number): Sight => ({
  id,
  n: id,
  t: "landmark",
  lon: -74,
  lat: 40.7,
  rings,
  front,
  anchor: [rings[0][0], rings[0][1]],
});

describe("sightAt", () => {
  it("finds the sight whose outline holds the point", () => {
    const shapes = buildSightShapes([sight("a", [square(0, 0, 10)], 10)]);
    expect(sightAt(shapes, 5, 5)).toBe(0);
    expect(sightAt(shapes, 15, 5)).toBe(-1);
  });

  it("misses a point in a hole of the outline", () => {
    const shapes = buildSightShapes([sight("ring", [square(0, 0, 100), square(30, 30, 40)], 100)]);
    expect(sightAt(shapes, 50, 50)).toBe(-1);
    expect(sightAt(shapes, 10, 10)).toBe(0);
  });

  it("gives the one standing nearer the viewer where two overlap", () => {
    const shapes = buildSightShapes([
      sight("behind", [square(0, -100, 20)], 10),
      sight("in front", [square(0, 0, 20)], 20),
    ]);
    expect(shapes[sightAt(shapes, 10, 5)].id).toBe("in front");
  });
});

describe("parseSights", () => {
  it("keeps well-formed sights and drops the rest", () => {
    const good = sight("ok", [square(0, 0, 10)], 10);
    const parsed = parseSights({
      sights: [
        good,
        { ...good, id: "no rings", rings: undefined },
        { ...good, id: "bad front", front: NaN },
        null,
      ],
    });
    expect(parsed.map((s) => s.id)).toEqual(["ok"]);
  });

  it("reads a file with no list as no sights", () => {
    expect(parseSights({})).toEqual([]);
    expect(parseSights(null)).toEqual([]);
  });
});

describe("parseSightTexts", () => {
  it("keeps the texts with a title, a link and words, by id", () => {
    const texts = parseSightTexts({
      b1: {
        title: "Empire State Building",
        url: "https://en.wikipedia.org/wiki/Empire_State_Building",
        text: "A skyscraper.",
        lang: "en",
      },
      b2: { title: "No link", text: "x", lang: "en" },
      b3: "nonsense",
    });
    expect(Object.keys(texts)).toEqual(["b1"]);
    expect(texts.b1.lang).toBe("en");
  });

  it("refuses a link that is not to a web page", () => {
    const texts = parseSightTexts({
      b1: { title: "x", url: "javascript:alert(1)", text: "x", lang: "en" },
    });
    expect(texts).toEqual({});
  });
});
