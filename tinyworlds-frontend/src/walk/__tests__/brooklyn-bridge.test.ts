import { describe, expect, it } from "vitest";
import {
  brooklynBridge,
  brooklynTowerVolumes,
  onBrooklynPromenade,
} from "../render/brooklyn-bridge";
import { inRings } from "../render/shore";
import { boxVolume } from "./fixtures";

const geo = { lon0: -73.98566, lat0: 40.74844, betaDeg: 45, k: 2, kz: 2.45 };
const bridge = brooklynBridge(geo);
const [e, n] = bridge.towers[0];
const point = (across: number) => [e - bridge.dn * across, n + bridge.de * across] as const;

describe("the Brooklyn Bridge landmark", () => {
  it("opens two pointed arches through the mapped tower footprint", () => {
    const tower = boxVolume(e - 24, n - 24, e + 24, n + 24, 0, 82.9);
    const pieces = brooklynTowerVolumes(bridge, tower)!;
    const stone = (across: number, height: number) =>
      pieces.some((v) => v.base <= height && height < v.top && inRings(v.rings, ...point(across)));

    expect(stone(0, 30)).toBe(true);
    expect(stone(-4, 27)).toBe(false);
    expect(stone(4, 27)).toBe(false);
    expect(stone(-9, 35)).toBe(false);
    expect(stone(9, 35)).toBe(false);
    expect(stone(17, 35)).toBe(true);
    expect(stone(9, 59)).toBe(false);
    expect(stone(4, 59)).toBe(true);
    expect(stone(9, 73)).toBe(true);
    expect(stone(9, 12)).toBe(true);
    expect(brooklynTowerVolumes(bridge, { ...tower, top: 60 })).toBeNull();
  });

  it("limits the promenade boards to the raised central span and its approaches", () => {
    expect(onBrooklynPromenade(bridge, ...point(0), 26)).toBe(true);
    expect(onBrooklynPromenade(bridge, ...point(14), 26)).toBe(false);
    expect(onBrooklynPromenade(bridge, ...point(0), 0)).toBe(false);
    expect(onBrooklynPromenade(bridge, e - bridge.de * 500, n - bridge.dn * 500, 26)).toBe(false);
  });
});
