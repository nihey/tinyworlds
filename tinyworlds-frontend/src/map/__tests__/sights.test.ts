import { describe, expect, it } from "vitest";
import {
  buildSightShapes,
  parseSights,
  parseSightTexts,
  picturesToDrop,
  sightAt,
  sightInView,
  type Sight,
} from "../sights";

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

describe("sightInView", () => {
  const view = { left: 0, top: 0, right: 100, bottom: 100 };
  const at = (x: number, y: number, size: number) =>
    sightInView(buildSightShapes([sight("a", [square(x, y, size)], 0)])[0], view);

  it("is in view while any of it is on screen", () => {
    expect(at(40, 40, 10)).toBe(true); // wholly inside
    expect(at(95, -5, 10)).toBe(true); // across a corner
    expect(at(-50, -50, 300)).toBe(true); // bigger than the screen
  });

  it("is out of view once all of it is off screen, on any side", () => {
    expect(at(101, 40, 10)).toBe(false);
    expect(at(-11, 40, 10)).toBe(false);
    expect(at(40, 101, 10)).toBe(false);
    expect(at(40, -11, 10)).toBe(false);
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

  it("keeps a sight's picture, and a sight whose picture is not one it can use without it", () => {
    const good = sight("ok", [square(0, 0, 10)], 10);
    const sprite = { src: "sights/1t8jb05.webp", x: -2, y: -2, w: 14, h: 14 };
    const parsed = parseSights({
      sights: [
        { ...good, id: "pictured", sprite },
        { ...good, id: "elsewhere", sprite: { ...sprite, src: "https://example.com/x.webp" } },
        { ...good, id: "upwards", sprite: { ...sprite, src: "sights/../manifest.json" } },
        { ...good, id: "empty", sprite: { ...sprite, w: 0 } },
        { ...good, id: "plain" },
      ],
    });
    expect(parsed.map((s) => [s.id, s.sprite])).toEqual([
      ["pictured", sprite],
      ["elsewhere", undefined],
      ["upwards", undefined],
      ["empty", undefined],
      ["plain", undefined],
    ]);
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

describe("picturesToDrop", () => {
  const pics = [
    { id: "old", px: 400, usedAt: 1 },
    { id: "lit", px: 500, usedAt: 2 },
    { id: "loading", px: 0, usedAt: 0 },
    { id: "new", px: 300, usedAt: 3 },
  ];

  it("keeps everything that fits", () => {
    expect(picturesToDrop(pics, null, 1200)).toEqual([]);
  });

  it("lets the least recently used go first, until the rest fit", () => {
    expect(picturesToDrop(pics, null, 900)).toEqual(["old"]);
    expect(picturesToDrop(pics, null, 300)).toEqual(["old", "lit"]);
  });

  it("never lets the picture in use go, even over budget", () => {
    expect(picturesToDrop(pics, "lit", 100)).toEqual(["old", "new"]);
  });
});
