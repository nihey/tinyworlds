import { describe, expect, it } from "vitest";
import { solveHeights } from "./heights.js";
import type { Piece } from "./pieces.js";

/** A straight line from (e0, n0) to (e1, n1), a vertex every `step` metres. */
function line(e0: number, n0: number, e1: number, n1: number, step = 10): number[] {
  const steps = Math.max(1, Math.round(Math.hypot(e1 - e0, n1 - n0) / step));
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) pts.push(e0 + ((e1 - e0) * i) / steps, n0 + ((n1 - n0) * i) / steps);
  return pts;
}

function piece(a: string, b: string, pts: number[], over: Partial<Piece> = {}): Piece {
  const m = pts.length / 2;
  return {
    kind: "street",
    seg: 0,
    a,
    b,
    cls: 5,
    link: false,
    ow: 0,
    width: 10,
    crosswalk: false,
    name: "",
    pts,
    bridge: new Array<boolean>(m).fill(false),
    level: new Array<number>(m).fill(0),
    tunnel: false,
    ...over,
  };
}

/** Level `value` on the vertices where `test` holds. */
function levelWhere(p: Piece, test: (e: number, n: number) => boolean, value = 1): Piece {
  p.level = p.level.map((l, i) => (test(p.pts[i * 2], p.pts[i * 2 + 1]) ? value : l));
  return p;
}

/** Level `value` on the vertices whose east coordinate is within [e0, e1]. */
const levelOn = (p: Piece, e0: number, e1: number, value = 1): Piece =>
  levelWhere(p, (e) => e >= e0 - 1e-9 && e <= e1 + 1e-9, value);

/** The steepest slope between consecutive vertices of every piece. */
function steepest(pieces: Piece[], z: Float32Array[]): number {
  let worst = 0;
  pieces.forEach((p, k) => {
    for (let i = 1; i < p.pts.length / 2; i++) {
      const d = Math.hypot(p.pts[i * 2] - p.pts[i * 2 - 2], p.pts[i * 2 + 1] - p.pts[i * 2 - 1]);
      worst = Math.max(worst, Math.abs(z[k][i] - z[k][i - 1]) / d);
    }
  });
  return worst;
}

/** The z of piece `p` at east coordinate `e`, interpolated (pieces running east). */
function zAt(p: Piece, z: Float32Array, e: number): number {
  for (let i = 1; i < p.pts.length / 2; i++) {
    const e0 = p.pts[i * 2 - 2];
    const e1 = p.pts[i * 2];
    if (e >= e0 && e <= e1) return z[i - 1] + ((z[i] - z[i - 1]) * (e - e0)) / (e1 - e0);
  }
  throw new Error(`${e} is off the piece`);
}

const none = (): number | null => null;

describe("solveHeights", () => {
  it("a level-1 overpass 400 m long comes down to the ground at both ends", () => {
    const pieces = [
      piece("w", "o0", line(-300, 0, 0, 0)),
      levelOn(piece("o0", "o1", line(0, 0, 400, 0)), 100, 300),
      piece("o1", "e", line(400, 0, 700, 0)),
    ];
    const z = solveHeights(pieces, none);
    expect(z.map((a) => a.length)).toEqual(pieces.map((p) => p.pts.length / 2));
    const o = pieces[1];
    for (let i = 0; i < o.pts.length / 2; i++) if (o.level[i] > 0) expect(z[1][i]).toBeCloseTo(6.5, 6);
    expect(z[1][0]).toBe(0);
    expect(z[1].at(-1)).toBe(0);
    // the overpass's own ends are long enough for its ramps: the streets either side stay down
    expect([...z[0], ...z[2]].every((v) => v === 0)).toBe(true);
    expect(steepest(pieces, z)).toBeLessThanOrEqual(0.08 + 1e-6);
  });

  it("a short overpass borrows the next street for its ramp", () => {
    const pieces = [
      piece("w", "o0", line(-300, 0, 0, 0)),
      levelOn(piece("o0", "o1", line(0, 0, 60, 0)), 20, 40),
      piece("o1", "e", line(60, 0, 360, 0)),
    ];
    const z = solveHeights(pieces, none);
    expect(z[1][3]).toBeCloseTo(6.5, 6);
    // 20 m of ramp inside the overpass, then down the streets either side
    expect(z[0].at(-1)).toBeCloseTo(6.5 - 0.08 * 20, 5);
    expect(z[0].at(-2)).toBeCloseTo(6.5 - 0.08 * 30, 5);
    expect(z[2][1]).toBeCloseTo(6.5 - 0.08 * 30, 5);
    expect(z[0][0]).toBe(0);
    expect(z[2].at(-1)).toBe(0);
    expect(steepest(pieces, z)).toBeLessThanOrEqual(0.08 + 1e-6);
  });

  it("a bridge over water stands at the map's deck", () => {
    const b = piece("b0", "b1", line(0, 0, 600, 0));
    b.bridge = b.bridge.map((_, i) => b.pts[i * 2] >= 100 && b.pts[i * 2] <= 500);
    const pieces = [piece("w", "b0", line(-600, 0, 0, 0)), b, piece("b1", "e", line(600, 0, 1200, 0))];
    const deck = (e: number): number | null => (e >= 150 && e <= 450 ? 41 : null);
    const z = solveHeights(pieces, deck);
    for (let i = 0; i < b.pts.length / 2; i++) {
      const e = b.pts[i * 2];
      if (e >= 150 && e <= 450) expect(z[1][i]).toBe(41);
      // the bridge's own land ends ramp down from the deck, higher than an overpass would be
      if (e >= 100 && e < 150) expect(z[1][i]).toBeCloseTo(41 - 0.08 * (150 - e), 4);
    }
    expect(z[0][0]).toBe(0);
    expect(steepest(pieces, z)).toBeLessThanOrEqual(0.08 + 1e-6);
  });

  it("a link ramps at 12%", () => {
    const pieces = [
      levelOn(piece("o0", "o1", line(-100, 0, 0, 0)), -100, 0),
      piece("o1", "g", line(0, 0, 100, 0), { link: true }),
      piece("o0", "h", line(-100, 0, -200, 0)),
    ];
    const z = solveHeights(pieces, none);
    expect(z[1][3]).toBeCloseTo(6.5 - 0.12 * 30, 5);
    expect(z[1][6]).toBe(0);
    // the ordinary street on the other side takes 8%
    expect(z[2][3]).toBeCloseTo(6.5 - 0.08 * 30, 5);
    expect(steepest([pieces[1]], [z[1]])).toBeCloseTo(0.12, 5);
  });

  it("a street passing under an overpass keeps 4.5 m clear", () => {
    const o = levelOn(piece("o0", "o1", line(0, 0, 400, 0)), 100, 300);
    const c = piece("c0", "c1", line(56.25, -100, 56.25, 100));
    // without the street under it, the ramp would be 3 m up where they cross
    expect(zAt(o, solveHeights([o], none)[0], 56.25)).toBeCloseTo(3, 5);
    const z = solveHeights([o, c], none);
    expect(zAt(o, z[0], 56.25)).toBeGreaterThanOrEqual(4.5 + 1 - 1e-5);
    expect([...z[1]].every((v) => v === 0)).toBe(true);
    expect(steepest([o, c], z)).toBeLessThanOrEqual(0.08 + 1e-6);
  });

  it("a crossing street not joined to the ramp is not lifted", () => {
    // the overpass is cut at e = 160 where a street joins it; another crosses its ramp unjoined
    const o0 = levelOn(piece("o0", "x", line(0, 0, 160, 0)), 100, 300);
    const o1 = levelOn(piece("x", "o1", line(160, 0, 400, 0)), 100, 300);
    const j0 = piece("j0", "x", line(160, -100, 160, 0));
    const j1 = piece("x", "j1", line(160, 0, 160, 100));
    const c = piece("c0", "c1", line(56.25, -100, 56.25, 100));
    const z = solveHeights([o0, o1, j0, j1, c], none);
    expect([...z[4]].every((v) => v === 0)).toBe(true);
    expect(z[2].at(-1)).toBeCloseTo(6.5, 6);
    expect(z[2].at(-2)).toBeCloseTo(6.5 - 0.08 * 10, 5);
    expect(z[3][1]).toBeCloseTo(6.5 - 0.08 * 10, 5);
  });

  it("a ramp meeting a street at its foot is not lifted over it", () => {
    // an overpass ending 28 m from a T junction, so its ramp lifts the street it meets; a
    // crosswalk's connector cuts the ramp 8 m before the junction, over the street's edge
    const ramp = levelOn(piece("o0", "k", line(-300, 0, -8, 0, 4)), -300, -28);
    const foot = piece("k", "t", line(-8, 0, 0, 0));
    const cross0 = piece("s0", "t", line(0, -200, 0, 0));
    const cross1 = piece("t", "s1", line(0, 0, 0, 200));
    const z = solveHeights([ramp, foot, cross0, cross1], none);
    expect(z[0].at(-1)).toBeCloseTo(6.5 - 0.08 * 20, 5);
    expect(z[1][1]).toBeCloseTo(6.5 - 0.08 * 28, 5);
    expect(z[2].at(-2)).toBeCloseTo(6.5 - 0.08 * 38, 5);
    expect(z[2][0]).toBe(0);
    expect(z[3].at(-1)).toBe(0);
  });

  it("a ramp is not lifted over the sidewalk beside it", () => {
    const road = levelOn(piece("r0", "r1", line(0, 0, 400, 0)), 100, 300);
    const walk = piece("w0", "w1", line(0, 6, 400, 6), { kind: "walk", cls: -1, width: 2.5 });
    const z = solveHeights([road, walk], none);
    expect(z[0][5]).toBeCloseTo(6.5 - 0.08 * 50, 5);
    expect([...z[1]].every((v) => v === 0)).toBe(true);
  });

  it("ways at the same level crossing unjoined lift neither", () => {
    const p = levelOn(piece("p0", "p1", line(0, 0, 400, 0)), 100, 300);
    const q = levelWhere(piece("q0", "q1", line(45, -200, 45, 400)), (_, n) => n >= 60 && n <= 260);
    const z = solveHeights([p, q], none);
    expect(z[0][4]).toBeCloseTo(6.5 - 0.08 * 60, 5);
    expect(z[1][20]).toBeCloseTo(6.5 - 0.08 * 60, 5);
    expect(Math.max(...z[0])).toBeCloseTo(6.5, 6);
    expect(Math.max(...z[1])).toBeCloseTo(6.5, 6);
  });

  it("a street lifted only as a ramp is not lifted over what crosses it", () => {
    const pieces = [
      piece("w", "o0", line(-300, 0, 0, 0)),
      levelOn(piece("o0", "o1", line(0, 0, 60, 0)), 20, 40),
      piece("o1", "e", line(60, 0, 360, 0)),
      piece("c0", "c1", line(-30, -50, -30, 50), { kind: "walk", cls: -1, width: 2.5 }),
    ];
    const z = solveHeights(pieces, none);
    expect(z[0][27]).toBeCloseTo(6.5 - 0.08 * 50, 5);
    expect([...z[3]].every((v) => v === 0)).toBe(true);
  });

  it("keeps its headroom over the height the data gives the way under it, not a ramp it lends", () => {
    // a ground street lends its end to the ramp of an overpass at e = 100; another overpass
    // crosses it where that ramp has it 3.3 m up
    const pieces = [
      piece("r0", "r", line(100, -100, 100, 0), { level: new Array<number>(11).fill(1) }),
      piece("r", "q", line(100, 0, -100, 0)),
      levelWhere(piece("p0", "p1", line(60, -300, 60, 300)), (_, n) => n >= -100 && n <= 100),
    ];
    const z = solveHeights(pieces, none);
    expect(z[1][4]).toBeCloseTo(6.5 - 0.08 * 40, 5);
    expect(Math.max(...z[2])).toBeCloseTo(6.5, 6);
  });

  it("a way still on its ramp under a bridge is not lifted over it", () => {
    // level 2 at its far end, its ramp 5 m up where it meets a level-1 bridge at 6.5 m
    const p = levelOn(piece("p0", "p1", line(0, 0, 400, 0)), 300, 400, 2);
    const bridge = piece("b0", "b1", line(200, -100, 200, 100), { level: new Array<number>(21).fill(1) });
    const z = solveHeights([p, bridge], none);
    expect(z[0][20]).toBeCloseTo(13 - 0.08 * 100, 5);
    expect(Math.max(...z[1])).toBeCloseTo(6.5, 6);
  });

  it("a way the data puts below the ground is not lifted over what crosses it", () => {
    const o = levelOn(levelOn(piece("o0", "o1", line(0, 0, 400, 0)), 100, 300), 0, 60, -1);
    const c = piece("c0", "c1", line(56.25, -100, 56.25, 100));
    const z = solveHeights([o, c], none);
    expect(z[0][5]).toBeCloseTo(6.5 - 0.08 * 50, 5);
  });

  it("a bridge at the map's deck is not lifted off it", () => {
    const b = piece("b0", "b1", line(0, 0, 400, 0));
    b.bridge = b.bridge.map(() => true);
    const under = piece("u0", "u1", line(200, -100, 200, 100));
    const deck = (e: number): number | null => (e >= 150 && e <= 250 ? 4 : null);
    const z = solveHeights([b, under], deck);
    for (let i = 0; i < b.pts.length / 2; i++) {
      const d = deck(b.pts[i * 2]);
      if (d !== null) expect(z[0][i]).toBe(Math.fround(d));
    }
  });

  it("an overland approach comes down to meet a low deck near the shore", () => {
    // the scene's deck: 0 within 10 m of the shore (e = 0), then up to 41 m 220 m out
    const deck = (e: number): number | null => {
      if (e < 0) return null;
      const t = Math.min(1, Math.max(0, (e - 10) / 210));
      return 41 * t * t * (3 - 2 * t);
    };
    const approach = levelOn(piece("l", "s", line(-300, 0, 0, 0)), -300, 0);
    const bridge = piece("s", "x", line(0, 0, 400, 0));
    bridge.bridge = bridge.bridge.map(() => true);
    const z = solveHeights([approach, bridge], deck);
    for (let i = 0; i < bridge.pts.length / 2; i++)
      expect(z[1][i]).toBe(Math.fround(deck(bridge.pts[i * 2])!));
    expect(z[0].at(-1)).toBe(0);
    for (let i = 0; i < approach.pts.length / 2; i++) {
      const d = -approach.pts[i * 2];
      if (d <= 50) expect(z[0][i]).toBeLessThanOrEqual(0.08 * d + 1e-6);
    }
    // inland it is an overpass again
    expect(z[0][20]).toBeCloseTo(6.5, 6);
    expect(z[0][0]).toBeCloseTo(6.5, 6);
  });

  it("keeps tunnels out, and rails to rails", () => {
    const deck = levelOn(piece("a", "b", line(0, 0, 100, 0)), 0, 100);
    const tunnel = piece("b", "c", line(100, 0, 200, 0), { tunnel: true });
    const rail = piece("a", "r", line(0, 0, -100, 0), { kind: "rail", cls: -1, width: 3.4 });
    const z = solveHeights([deck, tunnel, rail], none);
    expect([...z[1]].every((v) => v === 0)).toBe(true);
    expect([...z[2]].every((v) => v === 0)).toBe(true);
    expect(z[0][0]).toBeCloseTo(6.5, 6);
  });

  it("takes the level's height and the slopes it is given", () => {
    const pieces = [
      levelOn(piece("a", "b", line(0, 0, 100, 0)), 0, 100, 2),
      piece("b", "c", line(100, 0, 300, 0)),
    ];
    const z = solveHeights(pieces, none, { slope: 0.05 });
    expect(z[0][5]).toBeCloseTo(13, 6);
    expect(z[1][2]).toBeCloseTo(13 - 0.05 * 20, 5);
  });
});
