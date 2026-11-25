import { describe, expect, it } from "vitest";
import { CELL } from "../geo";
import { brooklynBridge } from "../render/brooklyn-bridge";
import { brooklynBridgeStays } from "../render/brooklyn-bridge-stays";

const bridge = brooklynBridge({ lon0: -73.98566, lat0: 40.74844, betaDeg: 45, k: 2, kz: 2.45 });

describe("Brooklyn Bridge diagonal stays", () => {
  it("fans out from both sides of both towers in four planes", () => {
    const fans = new Map<string, number>();
    for (let i = -7; i <= -3; i++) {
      for (let j = -26; j <= -22; j++) {
        for (const { pts, kind } of brooklynBridgeStays(bridge, i, j, CELL)) {
          const [e, n, top, endE, endN, deck] = pts;
          const tower = bridge.towers.findIndex(([te, tn]) => Math.hypot(e - te, n - tn) < 20);
          expect(tower).toBeGreaterThanOrEqual(0);
          expect(kind).toBe(1);
          expect(top).toBeCloseTo(82.9);
          expect(deck).toBeLessThan(top);
          const de = endE - e;
          const dn = endN - n;
          expect(dn * bridge.de - de * bridge.dn).toBeCloseTo(0);
          const [te, tn] = bridge.towers[tower];
          const across = (n - tn) * bridge.de - (e - te) * bridge.dn;
          const direction = Math.sign(de * bridge.de + dn * bridge.dn);
          const fan = `${tower}/${across.toFixed(1)}/${direction}`;
          fans.set(fan, (fans.get(fan) ?? 0) + 1);
        }
      }
    }
    expect(fans.size).toBe(16);
    for (const count of fans.values()) expect(count).toBe(25);
  });

  it("assigns each stay to the square containing its midpoint", () => {
    const stays = new Set<string>();
    for (let i = -7; i <= -3; i++) {
      for (let j = -26; j <= -22; j++) {
        for (const { pts } of brooklynBridgeStays(bridge, i, j, CELL)) {
          expect(Math.floor((pts[0] + pts[3]) / (2 * CELL))).toBe(i);
          expect(Math.floor((pts[1] + pts[4]) / (2 * CELL))).toBe(j);
          stays.add(pts.join(","));
        }
      }
    }
    expect(stays.size).toBe(400);
    expect(brooklynBridgeStays(bridge, 0, 0, CELL)).toEqual([]);
  });
});
