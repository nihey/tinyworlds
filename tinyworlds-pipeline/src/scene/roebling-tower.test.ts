import { describe, expect, it } from "vitest";
import { ROEBLING_DECK_HEIGHT, roeblingPortalShoulders } from "./roebling-tower.js";

describe("Roebling Bridge tower portals", () => {
  it("keeps the deck and middle clear beneath a rounded lintel", () => {
    const crown = 46;
    const shoulders = roeblingPortalShoulders([-4.6, 0, -4.6, 7.3, 4.6, 7.3, 4.6, 0], crown);
    expect(shoulders.length).toBeGreaterThan(2);
    expect(Math.min(...shoulders.map((part) => part.base))).toBeCloseTo(41.4);
    expect(Math.min(...shoulders.map((part) => part.base))).toBeGreaterThan(ROEBLING_DECK_HEIGHT);
    expect(Math.max(...shoulders.map((part) => part.top))).toBeCloseTo(crown);

    const gaps = shoulders
      .filter((part) => part.ring[0] < 0)
      .map(({ ring }) => -Math.max(ring[0], ring[2], ring[4], ring[6]) * 2);
    expect(gaps.at(0)).toBeCloseTo(9.2, 1);
    expect(gaps.at(-1)).toBeGreaterThan(0);
    for (const [i, gap] of gaps.entries()) {
      if (i > 0) expect(gap).toBeLessThan(gaps[i - 1]);
    }
  });

  it("keeps the masonry attached to both jambs on a rotated footprint", () => {
    const shoulders = roeblingPortalShoulders([12, 34, 4, 40, 0, 34, 8, 28], 46);
    for (const [i, { ring }] of shoulders.entries()) {
      const jamb =
        i % 2 === 0
          ? [
              [12, 34],
              [8, 28],
            ]
          : [
              [4, 40],
              [0, 34],
            ];
      const points = Array.from({ length: ring.length / 2 }, (_, j) => ring.slice(j * 2, j * 2 + 2));
      for (const corner of jamb) expect(points).toContainEqual(corner);
    }
    expect(shoulders.length).toBeGreaterThan(0);
  });
});
