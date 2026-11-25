import { describe, expect, it } from "vitest";
import { snapDrop } from "../drop";
import { deckWay, makeCell, roadNode, streetEdge } from "./fixtures";
import type { WalkEdge } from "../cell";

function sidewalk(pts: number[][], crosswalk = false): WalkEdge {
  const flat = Float32Array.from(pts.flatMap(([e, n, z = 0]) => [e, n, z]));
  return { key: "w", a: 0, b: 1, crosswalk, phase: 0, elevated: false, pts: flat, length: 100 };
}

describe("snapDrop", () => {
  it("snaps to the nearer of two sidewalks and faces along it", () => {
    const cell = makeCell(0, 0, {
      walks: [
        sidewalk([
          [10, 50],
          [10, 150],
        ]),
        sidewalk([
          [60, 50],
          [60, 150],
        ]),
      ],
    });
    const d = snapDrop([cell], 20, 100)!;
    expect(d.e).toBeCloseTo(10);
    expect(d.n).toBeCloseTo(100);
    expect(d.yaw).toBeCloseTo(0); // north
  });

  it("faces the way nearer north whichever way the line is drawn", () => {
    const cell = makeCell(0, 0, {
      walks: [
        sidewalk([
          [10, 150],
          [10, 50],
        ]),
      ],
    });
    expect(snapDrop([cell], 12, 100)!.yaw).toBeCloseTo(0);
    const east = makeCell(0, 0, {
      walks: [
        sidewalk([
          [50, 20],
          [150, 20],
        ]),
      ],
    });
    expect(snapDrop([east], 100, 25)!.yaw).toBeCloseTo(Math.PI / 2);
  });

  it("prefers a sidewalk to a nearer street and ignores crosswalks", () => {
    const cell = makeCell(0, 0, {
      nodes: [roadNode(0, 0, 100), roadNode(1, 200, 100)],
      streets: [
        streetEdge(0, 1, [
          [0, 100],
          [200, 100],
        ]),
      ],
      walks: [
        sidewalk([
          [100, 120],
          [100, 180],
        ]),
        sidewalk(
          [
            [0, 100],
            [200, 100],
          ],
          true,
        ),
      ],
    });
    const d = snapDrop([cell], 100, 101)!;
    expect(d.n).toBeGreaterThan(115);
  });

  it("stands on a street's kerb on the side of the dropped point", () => {
    const cell = makeCell(0, 0, {
      nodes: [roadNode(0, 0, 100), roadNode(1, 200, 100)],
      streets: [
        streetEdge(
          0,
          1,
          [
            [0, 100],
            [200, 100],
          ],
          { width: 10 },
        ),
      ],
    });
    const south = snapDrop([cell], 100, 98)!;
    expect(south.n).toBeCloseTo(94);
    const north = snapDrop([cell], 100, 103)!;
    expect(north.n).toBeCloseTo(106);
    expect(north.yaw).toBeCloseTo(Math.PI / 2);
  });

  it("takes the deck, at its height, when dropped on a bridge's strip", () => {
    const cell = makeCell(0, 0, {
      elevated: [
        deckWay(
          [
            [0, 100, 10],
            [100, 100, 20],
          ],
          12,
        ),
      ],
      walks: [
        sidewalk([
          [50, 130],
          [50, 190],
        ]),
      ],
    });
    const d = snapDrop([cell], 50, 103)!;
    expect(d.e).toBeCloseTo(50);
    expect(d.n).toBeCloseTo(100);
    expect(d.z).toBeCloseTo(15);
    const off = snapDrop([cell], 50, 120)!;
    expect(off.z).toBe(0);
  });

  it("finds nothing 200 m from any way", () => {
    const cell = makeCell(0, 0, {
      walks: [
        sidewalk([
          [0, 0],
          [10, 0],
        ]),
      ],
    });
    expect(snapDrop([cell], 100, 200)).toBeNull();
    expect(snapDrop([], 0, 0)).toBeNull();
  });
});
