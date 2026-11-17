import { describe, expect, it } from "vitest";
import type { WalkCell } from "../cell";
import {
  MIRROR_MIN_FPS,
  SLOW_SPAN,
  SLOW_SPANS,
  SLOW_WARM_UP,
  OPEN_REACH,
  openTiles,
  SlowWatch,
  SquareStream,
} from "../render/view";
import type { WalkIndex } from "../walk-index";
import { makeCell } from "./fixtures";

/** An index whose squares exist from (i0, j0) over cols × rows, except those in `missing`. */
function indexOf(
  i0: number,
  j0: number,
  cols: number,
  rows: number,
  missing: string[] = [],
): WalkIndex {
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (missing.includes(`${i0 + x}_${j0 + y}`)) continue;
      const b = x + y * cols;
      bits[b >> 3] |= 1 << (b & 7);
    }
  return {
    v: 1,
    cell: 200,
    i0,
    j0,
    cols,
    rows,
    cells: btoa(String.fromCharCode(...bits)),
    geo: { lon0: 0, lat0: 0, betaDeg: 45, k: 2, kz: 2.45 },
    gridDeg: 0,
    sunDeg: 254,
    palette: { names: [], rgb: [] },
    paintRank: [],
    tunnels: [],
  };
}

/** A loader whose answers the test gives, square by square. */
function loader() {
  const asked: string[] = [];
  const pending = new Map<string, { ok: () => void; fail: () => void }>();
  const load = (i: number, j: number) =>
    new Promise<WalkCell>((resolve, reject) => {
      const key = `${i}_${j}`;
      asked.push(key);
      pending.set(key, { ok: () => resolve(makeCell(i, j)), fail: () => reject(new Error("404")) });
    });
  return { asked, pending, load };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/** Hooks that keep what was made and dropped. */
function hooks() {
  const fogs: string[] = [];
  const dropped: string[] = [];
  return {
    fogs,
    dropped,
    hooks: {
      failed: (i: number, j: number) => {
        fogs.push(`${i}_${j}`);
        return `fog ${i}_${j}`;
      },
      drop: (shown: string) => dropped.push(shown),
    },
  };
}

describe("SquareStream", () => {
  it("asks for the squares within 3.5 of the camera's, six at a time, nearest first", async () => {
    const l = loader();
    const s = new SquareStream(indexOf(-10, -10, 20, 20), l.load, hooks().hooks);
    s.update(0.016, 100, 100);
    expect(l.asked.length).toBe(6);
    expect(l.asked[0]).toBe("0_0");
    // then the four beside it, before any square farther away
    expect(new Set(l.asked.slice(1, 5))).toEqual(new Set(["1_0", "-1_0", "0_1", "0_-1"]));
    s.update(0.016, 100, 100);
    expect(l.asked.length).toBe(6);

    // each answer frees a place for the next square
    let rounds = 0;
    while (l.pending.size > 0 && rounds++ < 100) {
      for (const [key, p] of [...l.pending]) {
        p.ok();
        l.pending.delete(key);
      }
      await settle();
      s.update(0.016, 100, 100);
    }
    // every square whose index is within 3.5 of (0, 0): 37 of them, and nothing else
    expect(l.asked.length).toBe(37);
    for (const key of l.asked) {
      const [i, j] = key.split("_").map(Number);
      expect(Math.hypot(i, j)).toBeLessThanOrEqual(3.5);
    }
    expect(s.world.has(3, 1)).toBe(true);
    expect(s.world.has(3, 2)).toBe(false);
  });

  it("never asks for a square the index does not have", () => {
    const l = loader();
    const s = new SquareStream(indexOf(-10, -10, 20, 20, ["0_0", "1_0"]), l.load, hooks().hooks);
    s.update(0.016, 100, 100);
    expect(l.asked).not.toContain("0_0");
    expect(l.asked).not.toContain("1_0");
  });

  it("puts a square in the world once it is in, and offers the nearest to be shown first", async () => {
    const l = loader();
    const h = hooks();
    const s = new SquareStream(indexOf(-10, -10, 20, 20), l.load, h.hooks);
    s.update(0.016, 100, 100);
    expect(s.world.has(1, 0)).toBe(false);
    l.pending.get("1_0")!.ok();
    l.pending.get("0_0")!.ok();
    await settle();
    expect(s.world.has(1, 0)).toBe(true);
    expect(s.world.inData(100, 100)).toBe(true);
    const first = s.next(100, 100)!;
    expect(first.key).toBe("0_0");
    s.show(first, "meshes 0_0");
    expect(s.next(100, 100)!.key).toBe("1_0");
  });

  /** A stream round (100, 100) where every square but (0, 0) has come in and (0, 0) has failed once. */
  async function oneFailed() {
    const l = loader();
    const h = hooks();
    const s = new SquareStream(indexOf(-10, -10, 20, 20), l.load, h.hooks);
    s.update(0.016, 100, 100);
    l.pending.get("0_0")!.fail();
    l.pending.delete("0_0");
    // every other square comes in, so there is room to ask again
    for (let rounds = 0; rounds < 20; rounds++) {
      await settle();
      s.update(0, 100, 100);
      for (const [key, p] of [...l.pending]) {
        p.ok();
        l.pending.delete(key);
      }
    }
    await settle();
    return { l, h, s, askedFor: () => l.asked.filter((k) => k === "0_0").length };
  }

  it("keeps a square that failed out of the world, with fog in its place, and asks again after 10 s", async () => {
    const { l, h, s, askedFor } = await oneFailed();
    expect(s.counts().loading).toBe(0);
    expect(s.world.has(0, 0)).toBe(false);
    expect(s.world.inData(100, 100)).toBe(false);
    expect(h.fogs).toEqual(["0_0"]);
    expect(s.counts().failed).toBe(1);

    for (let t = 0; t < 9.9; t += 0.1) s.update(0.1, 100, 100);
    expect(askedFor()).toBe(1);
    s.update(0.2, 100, 100);
    expect(askedFor()).toBe(2);
    // the fog stays while it is asked again, and until what came in is shown
    expect(h.dropped).not.toContain("fog 0_0");
    l.pending.get("0_0")!.ok();
    await settle();
    expect(s.world.has(0, 0)).toBe(true);
    expect(h.dropped).not.toContain("fog 0_0");
    const cell = s.next(100, 100)!;
    expect(cell.key).toBe("0_0");
    s.show(cell, "meshes 0_0");
    expect(h.dropped).toEqual(["fog 0_0"]);
  });

  it("keeps the same fog when the square fails again", async () => {
    const { l, h, s, askedFor } = await oneFailed();
    for (let t = 0; t < 10.1; t += 0.1) s.update(0.1, 100, 100);
    expect(askedFor()).toBe(2);
    l.pending.get("0_0")!.fail();
    await settle();
    expect(h.fogs).toEqual(["0_0"]);
    expect(h.dropped).toEqual([]);
    expect(s.counts().failed).toBe(1);
    expect(s.world.has(0, 0)).toBe(false);
  });

  it("puts a square that came in but could not be shown back to fog, out of the world, asked again after 10 s", async () => {
    const l = loader();
    const h = hooks();
    const s = new SquareStream(indexOf(-10, -10, 20, 20), l.load, h.hooks);
    s.update(0.016, 100, 100);
    l.pending.get("0_0")!.ok();
    l.pending.delete("0_0");
    await settle();
    const cell = s.next(100, 100)!;
    s.reject(cell);
    expect(s.world.has(0, 0)).toBe(false);
    expect(h.fogs).toEqual(["0_0"]);
    expect(s.next(100, 100)?.key).not.toBe("0_0");
    // answer the rest, then wait out the 10 s
    for (let rounds = 0; rounds < 20; rounds++) {
      await settle();
      s.update(0, 100, 100);
      for (const [key, p] of [...l.pending]) {
        p.ok();
        l.pending.delete(key);
      }
    }
    const askedFor = () => l.asked.filter((k) => k === "0_0").length;
    for (let t = 0; t < 9.9; t += 0.1) s.update(0.1, 100, 100);
    expect(askedFor()).toBe(1);
    s.update(0.2, 100, 100);
    expect(askedFor()).toBe(2);
  });

  it("lets go of squares beyond 4.5, out of the world, and drops what was shown of them", async () => {
    const l = loader();
    const h = hooks();
    const s = new SquareStream(indexOf(-20, -20, 40, 40), l.load, h.hooks);
    s.update(0.016, 100, 100);
    l.pending.get("0_0")!.ok();
    await settle();
    s.show(s.next(100, 100)!, "meshes 0_0");
    // 4 squares east: (0, 0) is 4 away and stays
    s.update(0.016, 4 * 200 + 100, 100);
    expect(s.world.has(0, 0)).toBe(true);
    // 5 squares east: it goes
    s.update(0.016, 5 * 200 + 100, 100);
    expect(s.world.has(0, 0)).toBe(false);
    expect(h.dropped).toContain("meshes 0_0");
  });

  it("drops an answer that comes after its square was let go", async () => {
    const l = loader();
    const s = new SquareStream(indexOf(-20, -20, 40, 40), l.load, hooks().hooks);
    s.update(0.016, 100, 100);
    s.update(0.016, 10 * 200 + 100, 100);
    l.pending.get("0_0")!.ok();
    await settle();
    expect(s.world.has(0, 0)).toBe(false);
  });

  it("lets go of everything when disposed", async () => {
    const l = loader();
    const h = hooks();
    const s = new SquareStream(indexOf(-10, -10, 20, 20), l.load, h.hooks);
    s.update(0.016, 100, 100);
    l.pending.get("0_0")!.ok();
    await settle();
    s.show(s.next(100, 100)!, "meshes 0_0");
    s.dispose();
    expect(s.world.has(0, 0)).toBe(false);
    expect(h.dropped).toContain("meshes 0_0");
  });
});

describe("SlowWatch", () => {
  /** Feeds `seconds` of frames at `fps`; whether it said slow at the end, and when it first did. */
  function run(watch: SlowWatch, fps: number, seconds: number, from = 0) {
    let first: number | null = null;
    let t = from;
    let slow = false;
    for (let k = 0; k < Math.round(seconds * fps); k++) {
      t += 1 / fps;
      slow = watch.frame(1 / fps);
      if (slow && first === null) first = t;
    }
    return { slow, first, t };
  }

  it("never calls fast frames slow", () => {
    expect(run(new SlowWatch(), 60, 30).slow).toBe(false);
    expect(run(new SlowWatch(), MIRROR_MIN_FPS + 2, 30).slow).toBe(false);
  });

  it("calls frames slow once they stay under the rate for its spans in a row, after the warm-up", () => {
    const r = run(new SlowWatch(), 25, 20);
    expect(r.slow).toBe(true);
    expect(r.first).not.toBeNull();
    expect(r.first!).toBeGreaterThanOrEqual(SLOW_WARM_UP + SLOW_SPAN * SLOW_SPANS - 0.1);
    expect(r.first!).toBeLessThan(SLOW_WARM_UP + SLOW_SPAN * SLOW_SPANS + 0.2);
  });

  it("does not count a slow moment between fast ones", () => {
    const w = new SlowWatch();
    run(w, 60, SLOW_WARM_UP + 1);
    run(w, 20, SLOW_SPAN);
    expect(run(w, 60, 10).slow).toBe(false);
  });

  it("ignores gaps (a hidden tab, a breakpoint), and starts afresh when reset", () => {
    const w = new SlowWatch();
    run(w, 60, SLOW_WARM_UP + 1);
    for (let k = 0; k < 20; k++) expect(w.frame(5)).toBe(false);
    expect(run(w, 25, 10).slow).toBe(true);
    w.reset();
    expect(w.frame(1 / 25)).toBe(false);
    expect(run(w, 60, 10).slow).toBe(false);
  });
});

describe("openTiles", () => {
  it("covers the squares round the camera that no shown square covers, so the water is drawn once", () => {
    const shown = new Set(["0_0", "1_0", "-1_2"]);
    const tiles = openTiles(0, 0, shown);
    const keys = new Set(tiles.map(([i, j]) => `${i}_${j}`));
    const side = 2 * OPEN_REACH;
    expect(tiles.length).toBe(side * side - 3);
    for (const k of shown) expect(keys.has(k)).toBe(false);
    expect(keys.has("2_0")).toBe(true);
    expect(keys.has(`${-OPEN_REACH}_${-OPEN_REACH}`)).toBe(true);
    expect(keys.has(`${OPEN_REACH}_0`)).toBe(false);
  });

  it("follows the camera's square", () => {
    const keys = new Set(openTiles(30, -7, new Set()).map(([i, j]) => `${i}_${j}`));
    expect(keys.has("30_-7")).toBe(true);
    expect(keys.has(`${30 - OPEN_REACH}_${-7 - OPEN_REACH}`)).toBe(true);
    expect(keys.has("0_0")).toBe(false);
  });
});
