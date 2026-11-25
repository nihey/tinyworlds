import { describe, expect, it } from "vitest";
import { cityLightAt, DAY, DAY_LENGTH_MS, NIGHT } from "../daylight";

describe("city lighting", () => {
  it("starts in daylight, holds night and wraps continuously back to daylight", () => {
    expect(cityLightAt(0)).toBe(DAY);
    expect(cityLightAt(DAY_LENGTH_MS / 2)).toBe(NIGHT);
    expect(cityLightAt(DAY_LENGTH_MS - 1)).toBe(DAY);
    expect(cityLightAt(DAY_LENGTH_MS)).toBe(DAY);
    expect(cityLightAt(DAY_LENGTH_MS * 3.5)).toBe(NIGHT);
  });

  it("gives dusk and dawn distinct colours and keeps the five shades in order", () => {
    const dusk = cityLightAt(DAY_LENGTH_MS * 0.23);
    const dawn = cityLightAt(DAY_LENGTH_MS * 0.77);
    expect(dusk.curve[6]).toBeGreaterThan(dawn.curve[6]);
    for (let i = 0; i < 100; i++) {
      const light = cityLightAt((DAY_LENGTH_MS * i) / 100);
      expect(light.curve).toHaveLength(15);
      for (let j = 3; j < light.curve.length; j++) {
        expect(light.curve[j]).toBeGreaterThan(light.curve[j - 3]);
      }
      expect(light.lamps).toBeGreaterThanOrEqual(0);
      expect(light.lamps).toBeLessThanOrEqual(1);
    }
  });
});
