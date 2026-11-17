import { describe, expect, it } from "vitest";
import type { StatuePiece } from "../cities/types.js";
import { makeGeo, makeProjection } from "../projection.js";
import { statueRing } from "./statues.js";

describe("statueRing", () => {
  it("keeps the ground: a piece's corners land on the same lon/lat whatever the view", () => {
    const grid = 0.2;
    const view = 45;
    const g = makeProjection(makeGeo(-96.8, 32.78, grid, 2));
    const v = makeProjection(makeGeo(-96.8, 32.78, view, 2));
    const pieces: StatuePiece[] = [
      { dp: 30, dq: -12, from: 0, to: 5, hp: 1.5, hq: 6, ramp: "white" },
      { dp: -4, dq: 9, from: 0, to: 5, r: 2, ramp: "body" },
    ];
    const [p, q] = g.toGrid(-96.79, 32.781);
    const [pv, qv] = v.toGrid(-96.79, 32.781);
    for (const piece of pieces) {
      const before = statueRing(piece, p, q, 0);
      const after = statueRing(piece, pv, qv, view - grid);
      expect(after.length).toBe(before.length);
      // a disc's corners turn round its centre, so only its centre must stay put
      const centre = (ring: number[], proj: typeof g): [number, number] => {
        let x = 0;
        let y = 0;
        for (let i = 0; i < ring.length; i += 2) {
          const [lon, lat] = proj.toLonLat(...proj.gridToMap(ring[i], ring[i + 1]));
          x += lon;
          y += lat;
        }
        return [x / (ring.length / 2), y / (ring.length / 2)];
      };
      if ("r" in piece) {
        const a = centre(before, g);
        const b = centre(after, v);
        expect(b[0]).toBeCloseTo(a[0], 9);
        expect(b[1]).toBeCloseTo(a[1], 9);
        continue;
      }
      for (let i = 0; i < before.length; i += 2) {
        const a = g.toLonLat(...g.gridToMap(before[i], before[i + 1]));
        const b = v.toLonLat(...v.gridToMap(after[i], after[i + 1]));
        expect(b[0]).toBeCloseTo(a[0], 9);
        expect(b[1]).toBeCloseTo(a[1], 9);
      }
    }
  });

  it("with no turn is the box it always was", () => {
    const ring = statueRing({ dp: 1, dq: 2, from: 0, to: 1, hp: 3, hq: 4, ramp: "body" }, 10, 20, 0);
    expect(ring).toEqual([8, 18, 14, 18, 14, 26, 8, 26]);
  });
});
