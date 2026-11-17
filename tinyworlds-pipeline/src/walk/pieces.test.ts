import { describe, expect, it } from "vitest";
import { piecesOf } from "./pieces.js";
import { oneWayOf, type Segment } from "./segments.js";

function seg(over: Partial<Segment> = {}): Segment {
  return {
    id: "s",
    subtype: "road",
    cls: "residential",
    subclass: null,
    name: "Test St",
    width: null,
    flags: [],
    levels: [],
    access: [],
    connectors: [
      { id: "c0", at: 0 },
      { id: "c1", at: 0.5 },
      { id: "c2", at: 1 },
    ],
    pts: [0, 0, 300, 0],
    ...over,
  };
}

const gaps = (pts: number[]): number[] =>
  Array.from({ length: pts.length / 2 - 1 }, (_, i) =>
    Math.hypot(pts[i * 2 + 2] - pts[i * 2], pts[i * 2 + 3] - pts[i * 2 + 1]),
  );

describe("oneWayOf", () => {
  const along = { access_type: "denied", when: { heading: "backward" } };
  it("reads the heading", () => {
    expect(oneWayOf([along])).toBe(1);
    expect(oneWayOf([{ access_type: "denied", when: { heading: "forward" } }])).toBe(-1);
  });
  it("ignores rules that are about someone or something", () => {
    expect(oneWayOf([{ access_type: "denied", when: { heading: "backward", mode: ["bicycle"] } }])).toBe(0);
    expect(oneWayOf([{ ...along, between: [0, 0.5] }])).toBe(0);
  });
  it("is null when denied to everyone", () => {
    expect(oneWayOf([{ access_type: "denied" }])).toBeNull();
    expect(oneWayOf([])).toBe(0);
  });
});

describe("piecesOf", () => {
  it("cuts between connectors and keeps vertices within 10 m", () => {
    const ps = piecesOf([seg()]);
    expect(ps).toHaveLength(2);
    expect([ps[0].a, ps[0].b, ps[1].a, ps[1].b]).toEqual(["c0", "c1", "c1", "c2"]);
    for (const p of ps) {
      expect(p.kind).toBe("street");
      expect(Math.max(...gaps(p.pts))).toBeLessThanOrEqual(10 + 1e-6);
      expect(p.bridge).toHaveLength(p.pts.length / 2);
      expect(p.level).toHaveLength(p.pts.length / 2);
    }
    expect(ps[0].pts.slice(0, 2)).toEqual([0, 0]);
    expect(ps[0].pts.slice(-2)).toEqual([150, 0]);
  });

  it("marks exactly the vertices a bridge flag covers", () => {
    const [p0, p1] = piecesOf([seg({ flags: [{ values: ["is_bridge"], between: [0.2, 0.8] }] })]);
    for (const p of [p0, p1])
      for (let i = 0; i < p.bridge.length; i++) {
        const f = p.pts[i * 2] / 300;
        expect(p.bridge[i]).toBe(f >= 0.2 - 1e-9 && f <= 0.8 + 1e-9);
      }
    expect(p0.bridge.filter(Boolean).length).toBeGreaterThan(0);
    expect(p0.bridge[0]).toBe(false);
    expect(p1.bridge.at(-1)).toBe(false);
  });

  it("gives vertices the level of the rule covering them", () => {
    const [p0, p1] = piecesOf([seg({ levels: [{ value: 1, between: [0.25, 0.75] }] })]);
    for (const p of [p0, p1])
      for (let i = 0; i < p.level.length; i++) {
        const f = p.pts[i * 2] / 300;
        expect(p.level[i]).toBe(f >= 0.25 - 1e-9 && f <= 0.75 + 1e-9 ? 1 : 0);
      }
  });

  it("fills a gap in a bridge's flags and levels shorter than its ramps would need", () => {
    // the Williamsburg's approach: level 2 and a bridge on two stretches, 246 m of nothing between
    const [p] = piecesOf([
      seg({
        pts: [0, 0, 1000, 0],
        connectors: [
          { id: "c0", at: 0 },
          { id: "c1", at: 1 },
        ],
        flags: [
          { values: ["is_bridge"], between: [0, 0.3] },
          { values: ["is_bridge"], between: [0.546, 1] },
        ],
        levels: [
          { value: 2, between: [0, 0.3] },
          { value: 2, between: [0.546, 1] },
        ],
      }),
    ]);
    expect(p.bridge.every(Boolean)).toBe(true);
    expect(p.level.every((l) => l === 2)).toBe(true);
  });

  it("fills a gap in the levels of a way that is a bridge all along", () => {
    // the Brooklyn Bridge's approach: a bridge everywhere, level 3 but for 50 m
    const [p] = piecesOf([
      seg({
        pts: [0, 0, 1000, 0],
        connectors: [
          { id: "c0", at: 0 },
          { id: "c1", at: 1 },
        ],
        flags: [{ values: ["is_bridge"] }],
        levels: [
          { value: 3, between: [0, 0.4] },
          { value: 3, between: [0.45, 0.9] },
          { value: 1, between: [0.95, 1] },
        ],
      }),
    ]);
    for (let i = 0; i < p.level.length; i++) {
      const f = p.pts[i * 2] / 1000;
      // past 0.9 it comes down for good, to a bridge with no level, then level 1: no dip
      expect(p.level[i]).toBe(f <= 0.9 + 1e-9 ? 3 : f >= 0.95 - 1e-9 ? 1 : 0);
    }
  });

  it("fills a gap that runs to a connector where only the next stretch of bridge meets it", () => {
    // its last 200 m have no level; past the connector the span's own segment is at level 2
    const approach = seg({
      id: "a",
      pts: [0, 0, 1000, 0],
      connectors: [
        { id: "c0", at: 0 },
        { id: "j", at: 1 },
      ],
      flags: [{ values: ["is_bridge"], between: [0, 0.8] }],
      levels: [{ value: 2, between: [0, 0.8] }],
    });
    const span = seg({
      id: "b",
      pts: [1000, 0, 1500, 0],
      connectors: [
        { id: "j", at: 0 },
        { id: "c2", at: 1 },
      ],
      flags: [{ values: ["is_bridge"] }],
      levels: [{ value: 2 }],
    });
    // (the connector itself keeps what each way says of it: the span's level 2 holds it up)
    const [a] = piecesOf([approach, span]);
    expect(a.level.slice(0, -1).every((l) => l === 2)).toBe(true);
    // an on-ramp meeting them at the connector climbs to the span there: the gap is still filled,
    // and the connector keeps what each way says of it
    const ramp = seg({
      id: "r",
      pts: [1000, 0, 1000, 300],
      connectors: [
        { id: "j", at: 0 },
        { id: "c3", at: 1 },
      ],
    });
    const [a2, , r] = piecesOf([approach, span, ramp]);
    expect(a2.level.slice(0, -1).every((l) => l === 2)).toBe(true);
    expect(a2.level.at(-1)).toBe(0);
    expect(r.level.every((l) => l === 0)).toBe(true);
    // a street meeting the approach inside the gap: the approach comes down to it
    const cut = seg({ ...approach, connectors: [...approach.connectors, { id: "k", at: 0.9 }] });
    const street = seg({
      id: "s",
      pts: [900, 0, 900, 300],
      connectors: [
        { id: "k", at: 0 },
        { id: "c4", at: 1 },
      ],
    });
    const [c0, c1] = piecesOf([cut, span, street]);
    expect(c0.level.at(-1)).toBe(0);
    expect(c1.level.every((l) => l === 0)).toBe(true);
  });

  it("leaves a long stretch of ground between two bridges alone, and the ends of a piece", () => {
    // two creek bridges at level 1 with 600 m of ground between them, on one piece
    const [p] = piecesOf([
      seg({
        pts: [0, 0, 1000, 0],
        connectors: [
          { id: "c0", at: 0 },
          { id: "c1", at: 1 },
        ],
        flags: [
          { values: ["is_bridge"], between: [0.1, 0.2] },
          { values: ["is_bridge"], between: [0.8, 0.9] },
        ],
        levels: [
          { value: 1, between: [0.1, 0.2] },
          { value: 1, between: [0.8, 0.9] },
        ],
      }),
    ]);
    for (let i = 0; i < p.bridge.length; i++) {
      const f = p.pts[i * 2] / 1000;
      const on = (f >= 0.1 - 1e-9 && f <= 0.2 + 1e-9) || (f >= 0.8 - 1e-9 && f <= 0.9 + 1e-9);
      expect(p.bridge[i]).toBe(on);
      expect(p.level[i]).toBe(on ? 1 : 0);
    }
  });

  it("fills a short gap at the lower of the two levels either side", () => {
    // level 3 then level 1, 100 m apart: a level-1 gap may be up to 162.5 m
    const [p] = piecesOf([
      seg({
        pts: [0, 0, 1000, 0],
        connectors: [
          { id: "c0", at: 0 },
          { id: "c1", at: 1 },
        ],
        levels: [
          { value: 3, between: [0, 0.4] },
          { value: 1, between: [0.5, 1] },
        ],
      }),
    ]);
    for (let i = 0; i < p.level.length; i++) {
      const f = p.pts[i * 2] / 1000;
      expect(p.level[i]).toBe(f <= 0.4 + 1e-9 ? 3 : 1);
    }
    // a gap at level 1 longer than that stays
    const [q] = piecesOf([
      seg({
        pts: [0, 0, 1000, 0],
        connectors: [
          { id: "c0", at: 0 },
          { id: "c1", at: 1 },
        ],
        levels: [
          { value: 3, between: [0, 0.4] },
          { value: 1, between: [0.6, 1] },
        ],
      }),
    ]);
    expect(q.level[50]).toBe(0);
  });

  it("calls a piece a tunnel when its middle is under a tunnel flag", () => {
    const [p0, p1] = piecesOf([seg({ flags: [{ values: ["is_tunnel"], between: [0, 0.5] }] })]);
    expect(p0.tunnel).toBe(true);
    expect(p1.tunnel).toBe(false);
    expect(piecesOf([seg({ levels: [{ value: -1 }] })])[0].tunnel).toBe(true);
  });

  it("makes crosswalks walk pieces, and drops indoor ones", () => {
    const walk = seg({ cls: "footway", subclass: "crosswalk" });
    const [p] = piecesOf([walk]);
    expect(p.kind).toBe("walk");
    expect(p.crosswalk).toBe(true);
    expect(piecesOf([seg({ cls: "footway", flags: [{ values: ["is_indoor"] }] })])).toHaveLength(0);
  });

  it("leaves walking pieces in tunnels out, and keeps street tunnels", () => {
    expect(piecesOf([seg({ cls: "footway", flags: [{ values: ["is_tunnel"] }] })])).toHaveLength(0);
    expect(piecesOf([seg({ cls: "footway", levels: [{ value: -1 }] })])).toHaveLength(0);
    const ps = piecesOf([seg({ flags: [{ values: ["is_tunnel"] }] })]);
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => p.tunnel)).toBe(true);
  });

  it("drops closed streets, abandoned rails and slivers", () => {
    expect(piecesOf([seg({ access: [{ access_type: "denied" }] })])).toHaveLength(0);
    expect(
      piecesOf([seg({ subtype: "rail", cls: "standard_gauge", flags: [{ values: ["is_abandoned"] }] })]),
    ).toHaveLength(0);
    expect(piecesOf([seg({ pts: [0, 0, 0.3, 0] })])).toHaveLength(0);
  });

  it("carries the one-way direction, the link flag and the width", () => {
    const [p] = piecesOf([
      seg({
        cls: "primary",
        subclass: "link",
        access: [{ access_type: "denied", when: { heading: "backward" } }],
      }),
    ]);
    expect(p.ow).toBe(1);
    expect(p.link).toBe(true);
    expect(p.cls).toBe(2);
    expect(p.width).toBeCloseTo(17 * 0.6);
  });
});
