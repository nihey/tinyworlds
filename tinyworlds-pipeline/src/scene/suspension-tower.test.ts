import { describe, expect, it } from "vitest";
import { deckAtTower, steelTower } from "./suspension-tower.js";

const ring = [-5, -20, 5, -20, 5, 20, -5, 20];
const along = [1, 0] as const;
const at = [0, 0] as const;

describe("suspension tower openings", () => {
  it("takes the crossing's width and height from its aligned deck at the tower", () => {
    expect(deckAtTower(at, along, 20, { p: 1, q: 4, up: 1, uq: 0, a: -4, b: 3, width: 12, z: 34 })).toEqual({
      across: 4,
      width: 12,
      z: 34,
    });
    expect(
      deckAtTower(at, along, 20, { p: 0, q: 0, up: 0, uq: 1, a: -6, b: 6, width: 12, z: 34 }),
    ).toBeNull();
    expect(
      deckAtTower(at, along, 20, { p: -25, q: 4, up: 1, uq: 0, a: -4, b: 3, width: 12, z: 34 }),
    ).toBeNull();
  });

  it("opens the tower at both deck heights and keeps its outer steel legs", () => {
    const tower = steelTower(
      ring,
      at,
      along,
      100,
      [
        { across: 0, width: 26, z: 25 },
        { across: 0, width: 19, z: 30 },
      ],
      "braced",
    );
    const solid = (cross: number, z: number) =>
      tower?.pieces.some(({ ring, base, top }) => {
        const qs = ring.filter((_, i) => i % 2 === 1);
        return base <= z && z < top && cross > Math.min(...qs) && cross < Math.max(...qs);
      });
    expect(solid(0, 32)).toBe(false);
    expect(solid(0, 28)).toBe(false);
    expect(solid(-19, 32)).toBe(true);
    expect(solid(19, 32)).toBe(true);
    expect(solid(0, 98)).toBe(true);
    expect(tower?.braces.length).toBeGreaterThan(0);
  });

  it("preserves a solid support when no deck goes through it", () => {
    expect(steelTower(ring, at, along, 100, [], "arched")).toBeNull();
    expect(steelTower(ring, at, along, 34, [{ across: 0, width: 20, z: 34 }], "arched")).toBeNull();
  });
});
