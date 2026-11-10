import { describe, expect, it } from "vitest";
import { distanceAlong, holdDecks, type DeckPath, type DeckRun } from "./decks.js";

const run = (a: number, b: number, h: number[]): DeckRun => ({ a, b, h: [...h] });

describe("holdDecks", () => {
  it("leaves a bridge over one stretch of water as it is", () => {
    const runs = [run(0, 1, [0, 4, 18, 30, 18, 4, 0])];
    expect(holdDecks(runs)).toBe(0);
    expect(runs[0].h).toEqual([0, 4, 18, 30, 18, 4, 0]);
  });

  it("keeps the deck up over an island between two channels", () => {
    // shore, a channel, an island (0, 0, 0), a narrower channel, shore
    const runs = [run(0, 1, [0, 10, 30, 10, 0, 0, 0, 8, 23, 8, 0])];
    expect(holdDecks(runs)).toBe(5);
    // it comes off the higher crest down to the lower one and stays there
    expect(runs[0].h).toEqual([0, 10, 30, 23, 23, 23, 23, 23, 23, 8, 0]);
  });

  it("does the same when the bridge is mapped in pieces that meet on the island", () => {
    const runs = [run(0, 1, [0, 10, 30, 10]), run(1, 2, [0, 0, 0]), run(2, 3, [8, 23, 8, 0])];
    holdDecks(runs);
    expect(runs.map((r) => r.h)).toEqual([
      [0, 10, 30, 23],
      [23, 23, 23],
      [23, 23, 8, 0],
    ]);
  });

  it("does not care which way a piece was drawn", () => {
    const runs = [run(1, 0, [10, 30, 10, 0]), run(1, 2, [0, 0, 0]), run(3, 2, [0, 8, 23, 8])];
    holdDecks(runs);
    expect(runs.map((r) => r.h)).toEqual([
      [23, 30, 10, 0],
      [23, 23, 23],
      [0, 8, 23, 23],
    ]);
  });

  it("lets the deck come down where the bridge has a way down to the island", () => {
    const runs = [
      run(0, 1, [0, 10, 30, 10]),
      run(1, 2, [0, 0, 0]),
      run(2, 3, [8, 23, 8, 0]),
      run(1, 9, [0, 0]), // a ramp leaving the bridge on the island
    ];
    expect(holdDecks(runs)).toBe(0);
    expect(runs.map((r) => r.h)).toEqual([
      [0, 10, 30, 10],
      [0, 0, 0],
      [8, 23, 8, 0],
      [0, 0],
    ]);
  });

  it("holds a meeting of bridges only as high as the lowest of them", () => {
    // three bridges meet over an island: the lowest crest on a way to the ground is 9
    const runs = [run(0, 1, [0, 30, 0]), run(1, 2, [0, 23, 0]), run(1, 3, [0, 9, 0])];
    holdDecks(runs);
    expect(runs.map((r) => r.h)).toEqual([
      [0, 30, 9],
      [9, 23, 0],
      [9, 9, 0],
    ]);
  });

  it("never lowers a deck, and never lifts one above the bridge's own crests", () => {
    const runs = [
      run(0, 1, [0, 3, 9, 2]),
      run(1, 2, [2, 0, 5, 1]),
      run(2, 3, [1, 14, 0]),
      run(2, 4, [1, 0, 0]),
      run(5, 6, [0, 7, 0, 7, 0]),
    ];
    const before = runs.map((r) => [...r.h]);
    holdDecks(runs);
    runs.forEach((r, i) =>
      r.h.forEach((h, j) => {
        expect(h).toBeGreaterThanOrEqual(before[i][j]);
        expect(h).toBeLessThanOrEqual(14);
      }),
    );
    expect(runs[4].h).toEqual([0, 7, 7, 7, 0]);
  });

  it("leaves a ring that never comes down, and pieces with no steps, alone", () => {
    const runs = [run(0, 1, [0, 5, 0]), run(1, 0, [0, 7, 0]), run(2, 3, [])];
    expect(holdDecks(runs)).toBe(0);
    expect(runs.map((r) => r.h)).toEqual([[0, 5, 0], [0, 7, 0], []]);
  });
});

const path = (a: number, b: number, at: number[], length: number): DeckPath => ({ a, b, at, length });

describe("distanceAlong", () => {
  it("measures to the ends of a bridge when nothing is marked", () => {
    expect(distanceAlong([path(0, 1, [10, 30, 50, 70, 90], 100)])).toEqual([[10, 30, 50, 30, 10]]);
  });

  it("goes on through the joints of a bridge mapped in pieces", () => {
    const paths = [path(0, 1, [25, 75], 100), path(1, 2, [50], 100), path(2, 3, [25, 75], 100)];
    expect(distanceAlong(paths)).toEqual([[25, 75], [150], [75, 25]]);
  });

  it("measures to the marked steps instead, along a piece and across the joints", () => {
    const paths = [path(0, 1, [25, 75], 100), path(1, 2, [10, 50, 90], 100), path(2, 3, [25, 75], 100)];
    const marked = [
      [false, false],
      [false, true, false],
      [false, false],
    ];
    expect(distanceAlong(paths, marked)).toEqual([
      [125, 75],
      [40, 0, 40],
      [75, 125],
    ]);
  });

  it("takes the shorter way round", () => {
    // two ways from the marked piece to the far one: 30 m of ramp, or 200 m of roadway
    const paths = [path(0, 1, [5], 10), path(1, 2, [15], 30), path(1, 2, [100], 200), path(2, 3, [5], 10)];
    const marked = [[true], [false], [false], [false]];
    expect(distanceAlong(paths, marked)).toEqual([[0], [20], [105], [40]]);
  });

  it("is infinite where no way leads", () => {
    // a ring has no end to measure to, and a bridge apart has no marked step
    expect(distanceAlong([path(0, 1, [5], 10), path(1, 0, [5], 10)])).toEqual([[Infinity], [Infinity]]);
    const marked = [[true], [false]];
    expect(distanceAlong([path(0, 1, [5], 10), path(2, 3, [5], 10)], marked)).toEqual([[0], [Infinity]]);
  });
});
