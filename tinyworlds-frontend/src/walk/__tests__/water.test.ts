import { describe, expect, it } from "vitest";
import { DEEP, HALF, HIGH, LIT, OUTLINE, SHADE } from "../render/palette";
import {
  darkCutOf,
  depthTone,
  glint,
  GLINT_FOR,
  GRAZE_ONE,
  GRAZE_TWO,
  lapRing,
  LOOP,
  quietShore,
  QUIET_FAR,
  reflectTone,
  skyTone,
  wobble,
  type WaterTone,
} from "../water";

/** Every step of `dt` over [from, to). */
function times(from: number, to: number, dt: number): number[] {
  const out: number[] = [];
  for (let t = from; t < to - 1e-9; t += dt) out.push(t);
  return out;
}

describe("depthTone", () => {
  it("is the shallow teal at the shore, the light rim near it, the base, then the deep shade", () => {
    expect(depthTone(0)).toEqual({ ramp: "waterShallow", shade: LIT });
    expect(depthTone(2)).toEqual({ ramp: "water", shade: LIT });
    expect(depthTone(5)).toEqual({ ramp: "water", shade: HALF });
    expect(depthTone(9)).toEqual({ ramp: "water", shade: SHADE });
  });

  it("never gets lighter farther from the land", () => {
    let last = Infinity;
    for (let s = 1.5; s < 40; s += 0.25) {
      const tone = depthTone(s);
      expect(tone.ramp).toBe("water");
      expect(tone.shade).toBeLessThanOrEqual(last);
      last = tone.shade;
    }
  });
});

describe("skyTone", () => {
  const deep: WaterTone = { ramp: "water", shade: SHADE };

  it("leaves the water as it is when you look down into it", () => {
    expect(skyTone(deep, 0)).toEqual(deep);
    expect(skyTone(deep, 0.5)).toEqual(deep);
  });

  it("lightens it a shade, then two, as you see it at a grazing angle", () => {
    const grazing = Array.from({ length: 101 }, (_, k) => k / 100);
    const shades = grazing.map((g) => skyTone(deep, g).shade);
    expect(shades[shades.length - 1]).toBe(SHADE + 2);
    expect(new Set(shades)).toEqual(new Set([SHADE, SHADE + 1, SHADE + 2]));
    for (let k = 1; k < shades.length; k++) expect(shades[k]).toBeGreaterThanOrEqual(shades[k - 1]);
    expect(skyTone(deep, GRAZE_ONE).shade).toBe(SHADE + 1);
    expect(skyTone(deep, GRAZE_TWO).shade).toBe(SHADE + 2);
  });

  it("never goes past the ramp's highlight", () => {
    expect(skyTone({ ramp: "water", shade: LIT }, 1)).toEqual({ ramp: "water", shade: HIGH });
  });

  it("leaves the shallow band alone", () => {
    const shallow: WaterTone = { ramp: "waterShallow", shade: LIT };
    expect(skyTone(shallow, 1)).toEqual(shallow);
  });
});

describe("reflectTone", () => {
  it("splits into three flat tones of the ramp's deep half at darkCut and 110", () => {
    const cut = 80;
    expect(reflectTone(0, cut)).toEqual({ ramp: "water", shade: OUTLINE });
    expect(reflectTone(79.9, cut)).toEqual({ ramp: "water", shade: OUTLINE });
    expect(reflectTone(80, cut)).toEqual({ ramp: "water", shade: DEEP });
    expect(reflectTone(109.9, cut)).toEqual({ ramp: "water", shade: DEEP });
    expect(reflectTone(110, cut)).toEqual({ ramp: "water", shade: SHADE });
    expect(reflectTone(255, cut)).toEqual({ ramp: "water", shade: SHADE });
  });
});

describe("darkCutOf", () => {
  it("is the brightness under which the darkest 15% fall", () => {
    const lumas = Array.from({ length: 100 }, (_, k) => k);
    expect(darkCutOf(lumas)).toBe(15);
    expect(darkCutOf([200, 10, 50, 90, 120, 30, 70])).toBe(30);
  });
});

describe("wobble", () => {
  const ts = times(0, LOOP, 0.05);
  const ys = Array.from({ length: 64 }, (_, k) => k);

  it("keeps the first three rows still, so a reflection stays attached", () => {
    for (const rows of [0, 1, 2, 2.9])
      for (const t of ts) for (const y of ys) expect(wobble(rows, t, y)).toBe(0);
  });

  it("moves whole pixels: at most one up to row 30, at most two beyond, and it does move", () => {
    const seen = new Set<number>();
    for (const t of ts)
      for (const y of ys) {
        for (const rows of [3, 10, 29]) {
          const w = wobble(rows, t, y);
          expect(Number.isInteger(w)).toBe(true);
          expect(Math.abs(w)).toBeLessThanOrEqual(1);
          seen.add(w);
        }
        for (const rows of [30, 80, 400]) {
          const w = wobble(rows, t, y);
          expect(Number.isInteger(w)).toBe(true);
          expect(Math.abs(w)).toBeLessThanOrEqual(2);
          seen.add(w);
        }
      }
    expect(seen).toEqual(new Set([-2, -1, 0, 1, 2]));
  });

  it("is the same at t and t + LOOP, and runs twice per loop", () => {
    for (const t of ts)
      for (const y of ys)
        for (const rows of [5, 50]) {
          expect(wobble(rows, t + LOOP, y)).toBe(wobble(rows, t, y));
          expect(wobble(rows, t + LOOP / 2, y)).toBe(wobble(rows, t, y));
        }
  });
});

describe("lapRing", () => {
  it("takes both rings over a loop, stepping out and back twice, and repeats each loop", () => {
    const ts = times(0, LOOP, 0.01);
    const rings = ts.map(lapRing);
    expect(new Set(rings)).toEqual(new Set([2, 3]));
    let outward = 0;
    for (let k = 1; k <= rings.length; k++) {
      const a = rings[k - 1];
      const b = rings[k % rings.length];
      if (a === 2 && b === 3) outward++;
    }
    expect(outward).toBe(2);
    for (const t of ts) expect(lapRing(t + LOOP)).toBe(lapRing(t));
  });
});

describe("glint", () => {
  const lit = (age: number) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].filter((dx) => glint(age, dx));

  it("grows 1, 3, 5 pixels, then splits, then is gone", () => {
    expect(lit(0.05)).toEqual([0]);
    expect(lit(0.2)).toEqual([-1, 0, 1]);
    expect(lit(0.35)).toEqual([-2, -1, 0, 1, 2]);
    const split = lit(0.5);
    expect(split).not.toContain(0);
    expect(split.some((dx) => dx < 0)).toBe(true);
    expect(split.some((dx) => dx > 0)).toBe(true);
    expect(lit(GLINT_FOR)).toEqual([]);
    expect(lit(-0.01)).toEqual([]);
  });
});

describe("quietShore", () => {
  it("is quiet far away or where the shore faces away from the sun, lapping near a lit one", () => {
    expect(quietShore(20, 0.8)).toBe(false);
    expect(quietShore(20, 0)).toBe(false);
    expect(quietShore(QUIET_FAR + 1, 0.8)).toBe(true);
    expect(quietShore(20, -0.8)).toBe(true);
  });
});
