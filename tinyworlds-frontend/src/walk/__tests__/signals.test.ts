import { describe, expect, it } from "vitest";
import { CYCLE, signal } from "../lights";
import { lampLit, signalPosts } from "../signals";
import { roadNode, streetEdge } from "./fixtures";

describe("lampLit", () => {
  it("lights the lamp the phase's signal shows, all through the cycle", () => {
    const lamp = { red: 0, yellow: 1, green: 2 };
    for (const phase of [0, 1] as const)
      for (let t = -CYCLE; t < 2 * CYCLE; t += 0.25)
        expect(lampLit(t, phase)).toBe(lamp[signal(t, phase)]);
  });
});

describe("signalPosts", () => {
  // a crossing at (100, 100) whose widest street runs north and south
  const node = roadNode(1, 100, 100, { lights: true, bearing: 0 });
  const south = streetEdge(2, 1, [
    [100, 40],
    [100, 100],
  ]);
  const north = streetEdge(1, 3, [
    [100, 100],
    [100, 160],
  ]);
  const west = streetEdge(4, 1, [
    [40, 100],
    [100, 100],
  ]);
  // one way, east, away from the crossing: nobody arrives by it
  const east = streetEdge(
    1,
    5,
    [
      [100, 100],
      [160, 100],
    ],
    { ow: 1 },
  );

  it("stand one at each way in, before the crossing at the right-hand kerb, facing the cars coming", () => {
    const posts = signalPosts(node, [south, north, west, east], () => 8);
    expect(posts).toHaveLength(3);
    const from = (yaw: number) => posts.find((p) => Math.abs(Math.sin((p.yaw - yaw) / 2)) < 1e-6)!;
    // from the south, heading north: the post faces south, east of the street, 8 m short
    const s = from(Math.PI);
    expect(s.e).toBeCloseTo(100 + 5 + 0.6, 5);
    expect(s.n).toBeCloseTo(92, 5);
    expect(s.phase).toBe(0);
    // from the north, heading south: faces north, west of the street
    const n = from(0);
    expect(n.e).toBeCloseTo(100 - 5.6, 5);
    expect(n.n).toBeCloseTo(108, 5);
    expect(n.phase).toBe(0);
    // from the west, heading east: faces west, south of the street, with the other phase
    const w = from(-Math.PI / 2);
    expect(w.e).toBeCloseTo(92, 5);
    expect(w.n).toBeCloseTo(100 - 5.6, 5);
    expect(w.phase).toBe(1);
  });

  it("are none where there are no lights", () => {
    expect(signalPosts({ ...node, lights: false }, [south, north], () => 8)).toEqual([]);
  });
});
