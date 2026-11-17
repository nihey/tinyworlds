import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildCellMeshes } from "../render/cell-mesh";
import { makeMaterials } from "../render/materials";
import type { Palette } from "../render/palette";
import type { WalkIndex } from "../walk-index";
import { makeCell, worldOf } from "./fixtures";

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
});
