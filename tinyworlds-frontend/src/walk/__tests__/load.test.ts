import { describe, expect, it } from "vitest";
import type { WalkCell } from "../cell";
import { squaresNear, WalkData } from "../load";
import type { WalkIndex } from "../walk-index";
import { fileStreets, makeCell, roadNode, streetEdge } from "./fixtures";

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
