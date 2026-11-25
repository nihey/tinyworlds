import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildCellMeshes } from "../render/cell-mesh";
import { makeMaterials } from "../render/materials";
import { G, PAINT_DRY, type Palette } from "../render/palette";
import type { WalkIndex } from "../walk-index";
import { makeCell, waterRect, worldOf } from "./fixtures";

/** A palette that has every ramp asked for, one after another, all grey. */
function anyPalette(): Palette {
  const ids = new Map<string, number>();
  const size = 128 * 6;
  return {
    rgb: () => [128, 128, 128],
    texture: new THREE.DataTexture(new Uint8Array(size * 4).fill(128), size, 1, THREE.RGBAFormat),
    ramp(name) {
      if (!ids.has(name)) ids.set(name, ids.size);
      return ids.get(name)!;
    },
    size,
  };
}

const index = {
  v: 1,
  cell: 200,
  i0: -1,
  j0: -1,
  cols: 3,
  rows: 3,
  cells: btoa(String.fromCharCode(0xff, 0x01)),
  geo: { lon0: -74, lat0: 40.7, betaDeg: 45, k: 2, kz: 2.45 },
  gridDeg: 28.9,
  sunDeg: 254,
  palette: { names: [], rgb: [] },
  paintRank: [],
  tunnels: [],
} as WalkIndex;

describe("a square's meshes", () => {
  it("give a square of water its surface even when its data lacks the shore field", () => {
    const palette = anyPalette();
    const materials = makeMaterials(palette, index);
    const wet = makeCell(0, 0, { mask: { mode: 1, bits: null }, shore: null });
    const world = worldOf(wet);
    const group = buildCellMeshes(wet, { palette, materials, index, world });
    const water: THREE.Mesh[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === materials.water) water.push(o);
    });
    expect(water).toHaveLength(1);
  });

  it("leaves no damp band on what is painted over a pier's deck", () => {
    const palette = anyPalette();
    const materials = makeMaterials(palette, index);
    const ring = (e0: number, n0: number, e1: number, n1: number) =>
      Float32Array.of(e0, n0, e1, n0, e1, n1, e0, n1);
    // a pier out into the water east of e = 100, a plaza on it, and the same kind on the land
    const cell = makeCell(0, 0, {
      mask: waterRect(0, 0, 100, 0, 200, 200),
      ground: [
        { kind: G.Pier, order: 0, rings: [ring(90, 80, 170, 120)] },
        { kind: G.Park, order: 1, rings: [ring(110, 90, 160, 110)] },
        { kind: G.Park, order: 2, rings: [ring(20, 20, 60, 60)] },
      ],
    });
    const group = buildCellMeshes(cell, { palette, materials, index, world: worldOf(cell) });
    // the pattern painted at a corner of each polygon (positions are e, height, −n in the square)
    const patternAt = (e: number, n: number) => {
      let found: number | null = null;
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute("paint")) return;
        const pos = o.geometry.getAttribute("position");
        const paint = o.geometry.getAttribute("paint");
        for (let v = 0; v < pos.count; v++)
          if (Math.abs(pos.getX(v) - e) < 1e-3 && Math.abs(pos.getZ(v) + n) < 1e-3)
            found = paint.getW(v);
      });
      return found;
    };
    expect(patternAt(110, 90)).toBeGreaterThanOrEqual(PAINT_DRY);
    expect(patternAt(20, 20)).toBeLessThan(PAINT_DRY);
    expect(patternAt(90, 80)).toBeLessThan(PAINT_DRY);
  });
});
