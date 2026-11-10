import { describe, expect, it } from "vitest";
import { cantileverTruss } from "./truss.js";

// the Queensboro's four towers, in metres along the bridge
const SPEC = { towers: [0, 359, 548, 847], top: 110, deck: 40 };

describe("cantileverTruss", () => {
  const truss = cantileverTruss(SPEC);

  it("reaches past the outer towers by an anchor arm each", () => {
    expect(truss.from).toBeCloseTo(-0.42 * 359, 6);
    expect(truss.to).toBeCloseTo(847 + 0.42 * 299, 6);
  });

  it("carries its top chord from each tower top down towards the middle of a span", () => {
    for (const tower of SPEC.towers) expect(truss.topAt(tower)).toBeCloseTo(110, 6);
    // the longest span comes all the way down to a shallow truss over the deck
    expect(truss.topAt(359 / 2)).toBeCloseTo(40 + 14, 6);
    // a short span between two towers stays well up
    expect(truss.topAt((359 + 548) / 2)).toBeGreaterThan(40 + 24);
    expect(truss.topAt((359 + 548) / 2)).toBeLessThan(40 + 40);
    // and it only ever falls on the way out from a tower: steeply first, then flattening
    let last = 110;
    let lastDrop = Infinity;
    for (let s = 10; s <= 170; s += 10) {
      const z = truss.topAt(s);
      expect(z).toBeLessThan(last);
      expect(last - z).toBeLessThanOrEqual(lastDrop + 1e-9);
      lastDrop = last - z;
      last = z;
    }
  });

  it("has no steel outside its own length", () => {
    expect(truss.topAt(truss.from - 1)).toBe(40);
    expect(truss.topAt(truss.to + 1)).toBe(40);
  });

  it("is cut into panels of a bay or so, with a panel point at every tower and both ends", () => {
    for (const tower of SPEC.towers) expect(truss.panels).toContain(tower);
    expect(truss.panels[0]).toBe(truss.from);
    expect(truss.panels[truss.panels.length - 1]).toBe(truss.to);
    for (let i = 1; i < truss.panels.length; i++) {
      const bay = truss.panels[i] - truss.panels[i - 1];
      expect(bay).toBeGreaterThan(9);
      expect(bay).toBeLessThan(21);
    }
  });

  it("draws its chords from end to end", () => {
    const [top, bottom] = truss.chords;
    expect(top.length).toBe(truss.panels.length * 2);
    expect(top[0]).toBe(truss.from);
    expect(top[top.length - 2]).toBe(truss.to);
    expect(bottom).toEqual([truss.from, 40, truss.to, 40]);
  });

  it("keeps every member between the deck and the top chord", () => {
    // the chord as it is drawn: straight from one panel point to the next
    const [top] = truss.chords;
    const drawn = (s: number): number => {
      for (let i = 0; i + 3 < top.length; i += 2)
        if (s <= top[i + 2] + 1e-9)
          return top[i + 1] + ((top[i + 3] - top[i + 1]) * (s - top[i])) / (top[i + 2] - top[i]);
      return top[top.length - 1];
    };
    expect(truss.members.length).toBeGreaterThan(300);
    for (const [s0, z0, s1, z1] of truss.members) {
      for (const [s, z] of [
        [s0, z0],
        [s1, z1],
      ]) {
        expect(s).toBeGreaterThanOrEqual(truss.from - 1e-6);
        expect(s).toBeLessThanOrEqual(truss.to + 1e-6);
        expect(z).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(z).toBeLessThanOrEqual(drawn(s) + 1e-6);
      }
      // nothing of no length
      expect(Math.hypot(s1 - s0, z1 - z0)).toBeGreaterThan(1);
    }
  });

  it("stands a post under the chord at every panel point", () => {
    for (const s of truss.panels) {
      const post = truss.members.find(
        ([s0, z0, s1, z1]) => s0 === s && s1 === s && z0 === 40 && Math.abs(z1 - truss.topAt(s)) < 1e-9,
      );
      expect(post, `panel point ${s}`).toBeDefined();
    }
  });

  it("is braced in tiers where it is deep, and in one where it is shallow", () => {
    const crossing = (s: number): number =>
      truss.members.filter(([s0, , s1]) => s0 !== s1 && Math.min(s0, s1) < s && Math.max(s0, s1) > s).length;
    // just out from a tower: three tiers of crossed braces and the lesser chords between them
    expect(crossing(8)).toBeGreaterThanOrEqual(7);
    // the middle of the long span: one pair of braces
    expect(crossing(359 / 2 - 3)).toBeLessThanOrEqual(3);
  });

  it("draws the same bridge every time", () => {
    expect(cantileverTruss(SPEC).members).toEqual(truss.members);
  });
});
