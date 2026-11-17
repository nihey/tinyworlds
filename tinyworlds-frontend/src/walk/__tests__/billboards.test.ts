import { describe, expect, it } from "vitest";
import type { Volume } from "../cell";
import { lonLatToEN, type WalkGeo } from "../geo";
import { screenColours } from "../render/billboard-mesh";
import {
  BASE_MAX,
  billboardAreas,
  MAX_PANELS,
  PANEL_CEIL,
  PANEL_FLOOR,
  PICTOGRAMS,
  pictogramBytes,
  placeBillboards,
  SCHEMES,
  screenOf,
  squareBudget,
  squareInAreas,
  straightWalls,
  TEMPLATES,
  TOP_MARGIN,
  type Panel,
} from "../render/billboards";
import type { Palette } from "../render/palette";
import { boxVolume, makeCell } from "./fixtures";

const seeded = (v: Volume, seed: number): Volume => ({ ...v, seed });

/**
 * Square 0_0 with an area of 80 m round (100, 100). Building A (e 60–140, n 100–130, 40 m) faces
 * open ground to the south (the street); a neighbour stands 5 m north of it (B), and two touch
 * its ends (C, D). E stands in the square's corner, outside the area.
 */
function square() {
  const A = seeded(boxVolume(60, 100, 140, 130, 0, 40), 11);
  const B = seeded(boxVolume(60, 135, 140, 160, 0, 40), 12);
  const C = seeded(boxVolume(140, 100, 170, 130, 0, 40), 13);
  const D = seeded(boxVolume(30, 100, 60, 130, 0, 40), 14);
  const E = seeded(boxVolume(5, 5, 35, 35, 0, 40), 15);
  const cell = makeCell(0, 0, { volumes: [A, B, C, D, E] });
  const areas = [{ e: 100, n: 100, r: 80 }];
  return { cell, areas, A, B, E };
}

/** Whether a panel's foot lies on the wall from (ae, an) to (be, bn). */
const onWall = (p: Panel, ae: number, an: number, be: number, bn: number) => {
  const L = Math.hypot(be - ae, bn - an);
  const t = ((p.e - ae) * (be - ae) + (p.n - an) * (bn - an)) / (L * L);
  const off = Math.abs(((p.e - ae) * (bn - an) - (p.n - an) * (be - ae)) / L);
  return off < 1e-3 && t > 0 && t < 1;
};

describe("placeBillboards", () => {
  it("puts screens on the wall facing the street, none facing a neighbour, none outside the area", () => {
    const { cell, areas } = square();
    const panels = placeBillboards(cell, cell.volumes, areas);
    expect(panels.length).toBeGreaterThan(0);
    // A's south face, facing south: screens; its north face (5 m from B) and its ends: none
    const south = panels.filter((p) => onWall(p, 60, 100, 140, 100));
    expect(south.length).toBeGreaterThan(0);
    for (const p of south) {
      expect(p.ne).toBeCloseTo(0, 9);
      expect(p.nn).toBeCloseTo(-1, 9);
    }
    expect(panels.filter((p) => onWall(p, 60, 130, 140, 130))).toEqual([]);
    expect(panels.filter((p) => onWall(p, 60, 135, 140, 135))).toEqual([]);
    expect(panels.filter((p) => onWall(p, 140, 100, 140, 130))).toEqual([]);
    expect(panels.filter((p) => onWall(p, 60, 100, 60, 130))).toEqual([]);
    // nothing on E, in the corner outside the area
    expect(panels.filter((p) => p.e < 40 && p.n < 40)).toEqual([]);
    for (const p of panels) expect(Math.hypot(p.e - 100, p.n - 100)).toBeLessThanOrEqual(80);
  });

  it("stacks one to three screens up a wall, 60 to 90% of it wide, 1:1 to 3:1, in whole texels", () => {
    const { cell, areas } = square();
    const panels = placeBillboards(cell, cell.volumes, areas);
    const ceil = Math.min(40 - TOP_MARGIN, PANEL_CEIL);
    for (const p of panels) {
      expect(p.z).toBeGreaterThanOrEqual(PANEL_FLOOR);
      expect(p.z + p.h).toBeLessThanOrEqual(ceil + 1e-9);
      expect((p.w * 2) % 1).toBe(0);
      expect((p.h * 2) % 1).toBe(0);
      expect(p.w / p.h).toBeGreaterThanOrEqual(0.9);
      expect(p.w / p.h).toBeLessThanOrEqual(3.1);
    }
    // A's 80 m face is taken in two pieces of 40 m
    const south = panels.filter((p) => onWall(p, 60, 100, 140, 100));
    for (const p of south) {
      expect(p.w).toBeGreaterThanOrEqual(0.6 * 40 - 0.5);
      expect(p.w).toBeLessThanOrEqual(0.9 * 40 + 0.5);
    }
    // per piece of wall, at most three, one above the other
    const byPiece = new Map<number, Panel[]>();
    for (const p of south) {
      const key = p.e < 100 ? 0 : 1;
      byPiece.set(key, [...(byPiece.get(key) ?? []), p]);
    }
    for (const stack of byPiece.values()) {
      expect(stack.length).toBeLessThanOrEqual(3);
      const up = [...stack].sort((a, b) => a.z - b.z);
      for (let k = 1; k < up.length; k++)
        expect(up[k].z).toBeGreaterThanOrEqual(up[k - 1].z + up[k - 1].h);
    }
  });

  it("is the same every time, whatever order the volumes round it come in", () => {
    const { cell, areas } = square();
    const once = placeBillboards(cell, cell.volumes, areas);
    expect(placeBillboards(cell, cell.volumes, areas)).toEqual(once);
    expect(placeBillboards(cell, [...cell.volumes].reverse(), areas)).toEqual(once);
  });

  it("sees a neighbour in the next square", () => {
    // A's south face, with a building 6 m south of it in square 0_-1
    const { cell, areas } = square();
    const across = seeded(boxVolume(60, 80, 140, 94, 0, 30), 21);
    const panels = placeBillboards(cell, [...cell.volumes, across], areas);
    expect(panels.filter((p) => onWall(p, 60, 100, 140, 100))).toEqual([]);
  });

  it("leaves out what stands on a podium or is low, and squares outside every area", () => {
    const low = makeCell(0, 0, { volumes: [seeded(boxVolume(60, 100, 140, 130, 0, 12), 1)] });
    const raised = makeCell(0, 0, {
      volumes: [seeded(boxVolume(60, 100, 140, 130, BASE_MAX + 1, 40), 1)],
    });
    const areas = [{ e: 100, n: 100, r: 80 }];
    expect(placeBillboards(low, low.volumes, areas)).toEqual([]);
    expect(placeBillboards(raised, raised.volumes, areas)).toEqual([]);
    const { cell } = square();
    expect(placeBillboards(cell, cell.volumes, [{ e: 900, n: 900, r: 80 }])).toEqual([]);
    expect(placeBillboards(cell, cell.volumes, [])).toEqual([]);
  });
});

describe("the areas", () => {
  const geo: WalkGeo = { lon0: -73.98566, lat0: 40.74844, betaDeg: 45, k: 2, kz: 2.45 };

  it("are taken from lon/lat to the walk's metres", () => {
    const [a] = billboardAreas(geo, [{ lon: -73.98553, lat: 40.758, radius: 190 }]);
    const [e, n] = lonLatToEN(geo, -73.98553, 40.758);
    expect(a).toEqual({ e, n, r: 190 });
    expect(billboardAreas(geo, undefined)).toEqual([]);
  });

  it("share out at most MAX_PANELS among the squares they touch", () => {
    const areas = [{ e: 11, n: 1063, r: 190 }];
    let total = 0;
    let touched = 0;
    for (let i = -3; i <= 3; i++)
      for (let j = 2; j <= 9; j++) {
        total += squareBudget(i, j, areas);
        if (squareInAreas(i, j, areas)) touched++;
      }
    expect(total).toBeLessThanOrEqual(MAX_PANELS);
    expect(total).toBeGreaterThan(MAX_PANELS - touched);
    expect(squareInAreas(5, 5, areas)).toBe(false);
  });
});

describe("straightWalls", () => {
  it("takes a side traced in pieces as one wall, and keeps the corners", () => {
    // a 40 × 20 box whose south side is traced in four pieces, one a little off the line
    const r = Float32Array.of(0, 0, 10, 0, 20, 0.2, 30, 0, 40, 0, 40, 20, 0, 20);
    const walls = straightWalls(r);
    expect(walls).toHaveLength(4);
    const south = walls.find((w) => w.an === 0 && w.bn === 0)!;
    expect([south.ae, south.be]).toEqual([0, 40]);
  });
});

describe("what a screen shows", () => {
  it("is picked from its hash alone, and every template and pictogram comes up", () => {
    const templates = new Set<number>();
    const pictos = new Set<number>();
    for (let h = 0; h < 2000; h++) {
      const s = screenOf(h * 2654435761);
      expect(screenOf(h * 2654435761)).toEqual(s);
      expect(s.a).not.toBe(s.b);
      expect(s.a).toBeLessThan(SCHEMES.length);
      expect(s.b).toBeLessThan(SCHEMES.length);
      expect(Number.isInteger(s.phase)).toBe(true);
      templates.add(s.template);
      pictos.add(s.picto);
    }
    expect(templates.size).toBe(TEMPLATES.length);
    expect(pictos.size).toBe(PICTOGRAMS.length);
  });

  it("draws pictograms that are 16 × 16, none blank, none the same", () => {
    expect(PICTOGRAMS.length).toBeGreaterThanOrEqual(8);
    for (const p of PICTOGRAMS) {
      expect(p.rows).toHaveLength(16);
      for (const row of p.rows) expect(row).toMatch(/^[.#+]{16}$/);
      const figure = p.rows.join("").replace(/[^#]/g, "").length;
      expect(figure, p.name).toBeGreaterThan(30);
    }
    expect(new Set(PICTOGRAMS.map((p) => p.rows.join(""))).size).toBe(PICTOGRAMS.length);
    expect(new Set(PICTOGRAMS.map((p) => p.name)).size).toBe(PICTOGRAMS.length);
    const bytes = pictogramBytes();
    expect(bytes.length).toBe(256 * PICTOGRAMS.length);
    expect(Math.max(...bytes)).toBe(2);
  });

  it("uses palette colours only, and shows nothing where the palette lacks them", () => {
    const names = [...new Set(SCHEMES.flat().map(([name]) => name)), "carBlack"];
    const fake = (have: string[]): Palette =>
      ({
        ramp(name: string) {
          const i = have.indexOf(name);
          if (i < 0) throw new Error(`no ramp ${name}`);
          return i;
        },
      }) as unknown as Palette;
    const got = screenColours(fake(names))!;
    expect(got.schemes).toHaveLength(SCHEMES.length);
    for (const s of got.schemes) for (const c of s) expect(c).toBeLessThan(names.length * 6);
    expect(screenColours(fake(names.slice(1)))).toBeNull();
  });
});
