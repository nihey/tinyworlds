import { describe, expect, it } from "vitest";
import type { WalkCell } from "../cell";
import { fromMapPx, pickDeck, squaresNear, toMapPx, WalkData } from "../load";
import type { WalkIndex } from "../walk-index";
import { deckWay, fileStreets, makeCell, roadNode, streetEdge } from "./fixtures";

/** An index whose squares exist from (0, 0) over 4 × 4. */
function indexOf(): WalkIndex {
  const bits = new Uint8Array(2).fill(255);
  return {
    v: 1,
    cell: 200,
    i0: 0,
    j0: 0,
    cols: 4,
    rows: 4,
    cells: btoa(String.fromCharCode(...bits)),
    geo: { lon0: -74, lat0: 40.7, betaDeg: 45, k: 2, kz: 2.45 },
    gridDeg: 0,
    sunDeg: 254,
    palette: { names: [], rgb: [] },
    paintRank: [],
    tunnels: [],
  };
}

/** A street along n = 395 from e = 50 to 350: across squares (0, 1) and (1, 1), filed in both. */
function streetCells(): Map<string, WalkCell> {
  const cells = fileStreets(
    [roadNode(1, 50, 395), roadNode(2, 350, 395)],
    [
      streetEdge(1, 2, [
        [50, 395],
        [350, 395],
      ]),
    ],
  );
  return new Map(cells.map((c) => [c.key, c]));
}

describe("squaresNear", () => {
  it("lists the squares that exist within reach of a point", () => {
    const ix = indexOf();
    expect(squaresNear(ix, 100, 100, 50)).toEqual([[0, 0]]);
    expect(squaresNear(ix, 190, 190, 50).length).toBe(4);
    // off the index: nothing
    expect(squaresNear(ix, -500, -500, 50)).toEqual([]);
    expect(squaresNear(ix, Number.NaN, 0, 50)).toEqual([]);
  });
});

describe("WalkData", () => {
  it("drops onto a street in the next square, and asks for each square once", async () => {
    const filed = streetCells();
    const asked: string[] = [];
    const data = new WalkData(indexOf(), async (i, j) => {
      asked.push(`${i}_${j}`);
      return filed.get(`${i}_${j}`) ?? makeCell(i, j);
    });
    const drop = await data.drop(100, 300);
    expect(drop).not.toBeNull();
    expect(drop!.n).toBeCloseTo(395 - 6); // the kerb on the dropped point's side
    await data.drop(100, 300);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("finds nothing far from every way", async () => {
    const data = new WalkData(indexOf(), async (i, j) => makeCell(i, j));
    expect(await data.drop(400, 400)).toBeNull();
  });

  it("lights each way once, however many squares file it, and only from squares already in", async () => {
    const filed = streetCells();
    const data = new WalkData(indexOf(), async (i, j) => filed.get(`${i}_${j}`) ?? makeCell(i, j));
    expect(data.waysNear(200, 395, 100)).toEqual([]);
    await data.near(200, 395);
    expect(data.waysNear(200, 395, 100).length).toBe(1);
    expect(data.waysNear(200, 700, 100).length).toBe(0);
  });

  it("asks again for a square that failed", async () => {
    let tries = 0;
    const data = new WalkData(indexOf(), async (i, j) => {
      tries++;
      if (tries === 1) throw new Error("offline");
      return makeCell(i, j);
    });
    await expect(data.square(0, 0)).rejects.toThrow("offline");
    await expect(data.square(0, 0)).resolves.toMatchObject({ key: "0_0" });
    await data.square(0, 0);
    expect(tries).toBe(2);
  });
});

const GEO = { lon0: -74, lat0: 40.7, betaDeg: 45, k: 2, kz: 2.45 };

describe("map px and metres", () => {
  it("go there and back at any height", () => {
    const m = toMapPx(GEO, 120, -40, 30);
    const [e, n] = fromMapPx(GEO, m.x, m.y, 30);
    expect(e).toBeCloseTo(120, 6);
    expect(n).toBeCloseTo(-40, 6);
    // a height lifts the point on screen by z·kz, nothing else
    expect(toMapPx(GEO, 120, -40, 0).y - m.y).toBeCloseTo(30 * GEO.kz, 6);
  });
});

/** A bridge deck 41 m up, 12 m wide, running east along n = 300 from e = 100 to 500. */
function bridgeCells(): WalkCell[] {
  const deck = deckWay(
    [
      [100, 300, 41],
      [500, 300, 41],
    ],
    12,
  );
  // filed under every square it touches, as the pipeline files elevated ways
  return [
    makeCell(0, 1, { elevated: [deck] }),
    makeCell(1, 1, { elevated: [deck] }),
    makeCell(2, 1, { elevated: [deck] }),
  ];
}

describe("pickDeck", () => {
  it("takes a raised deck where the map draws it, with its height", () => {
    const at = toMapPx(GEO, 260, 302, 41);
    const d = pickDeck(bridgeCells(), GEO, at.x, at.y)!;
    expect(d).not.toBeNull();
    expect(d.e).toBeCloseTo(260, 0);
    expect(d.n).toBeCloseTo(300, 0);
    expect(d.z).toBeCloseTo(41, 3);
    expect(Math.abs(d.yaw)).toBeCloseTo(Math.PI / 2, 3); // along the deck, east
  });

  it("does not take it at its footprint on the ground, where the map draws something else", () => {
    const ground = toMapPx(GEO, 260, 300, 0);
    expect(pickDeck(bridgeCells(), GEO, ground.x, ground.y)).toBeNull();
  });

  it("leaves railways out, and takes the deck in front where two are drawn at the point", () => {
    const rail = deckWay(
      [
        [100, 300, 41],
        [500, 300, 41],
      ],
      12,
      2,
    );
    const at = toMapPx(GEO, 260, 300, 41);
    expect(pickDeck([makeCell(1, 1, { elevated: [rail] })], GEO, at.x, at.y)).toBeNull();
    // a low deck whose drawing passes through the same screen point
    const g = fromMapPx(GEO, at.x, at.y, 6);
    const low = deckWay(
      [
        [g[0] - 50, g[1], 6],
        [g[0] + 50, g[1], 6],
      ],
      12,
    );
    const both = [
      ...bridgeCells(),
      makeCell(1, 0, { elevated: [low] }),
      makeCell(1, 1, { elevated: [low] }),
    ];
    expect(pickDeck(both, GEO, at.x, at.y)!.z).toBeCloseTo(41, 3);
  });
});

describe("WalkData.dropAtMap", () => {
  const ixOf = (): WalkIndex => ({ ...indexOf(), geo: GEO });

  it("puts the person on a raised deck drawn under the pointer, its ground far away", async () => {
    const cells = new Map(bridgeCells().map((c) => [c.key, c]));
    const data = new WalkData(ixOf(), async (i, j) => cells.get(`${i}_${j}`) ?? makeCell(i, j));
    const at = toMapPx(GEO, 300, 299, 41);
    const d = await data.dropAtMap(at.x, at.y);
    expect(d).not.toBeNull();
    expect(d!.z).toBeCloseTo(41, 3);
    // the ground point under the pointer is about 71 m from the deck
    const [ge, gn] = fromMapPx(GEO, at.x, at.y, 0);
    expect(Math.hypot(ge - 300, gn - 299)).toBeGreaterThan(60);
    // and the deck lights up when the person is carried there
    expect(data.waysNearMap(at.x, at.y, 40).length).toBe(1);
  });

  it("falls back to the street under the pointer on the ground", async () => {
    const filed = streetCells();
    const data = new WalkData(ixOf(), async (i, j) => filed.get(`${i}_${j}`) ?? makeCell(i, j));
    const at = toMapPx(GEO, 100, 300, 0);
    const d = await data.dropAtMap(at.x, at.y);
    expect(d).not.toBeNull();
    expect(d!.z).toBe(0);
    expect(d!.n).toBeCloseTo(395 - 6);
  });
});
