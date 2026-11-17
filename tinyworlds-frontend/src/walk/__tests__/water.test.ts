import { describe, expect, it } from "vitest";
import { DEEP, HALF, HIGH, LIT, OUTLINE, SHADE } from "../render/palette";
import {
  BAYER4,
  darkCutOf,
  DEPTH_NEAR,
  dashSpan,
  depthTone,
  dithered,
  glint,
  GLINT_FOR,
  GRAZE_DEEP,
  GRAZE_ONE,
  GRAZE_STEEP,
  GRAZE_TWO,
  lapRing,
  LOOP,
  quietShore,
  QUIET_FAR,
  reflectTone,
  SHALLOW_STEPS,
  shallowUntil,
  skyTone,
  surfaceLevel,
  SURFACE_CELL,
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
  const base: WaterTone = { ramp: "water", shade: HALF };
  const rim: WaterTone = { ramp: "water", shade: LIT };

  it("is the map's own water tone, whatever the depth, when you look steeply down into it", () => {
    for (const g of [0, 0.2, GRAZE_STEEP - 0.01]) {
      expect(skyTone(deep, g)).toEqual({ ramp: "water", shade: LIT });
      expect(skyTone(base, g)).toEqual({ ramp: "water", shade: LIT });
      expect(skyTone(rim, g)).toEqual(rim);
    }
  });

  it("goes down into the depth's tones a shade at a time, and keeps them at middle angles", () => {
    // from steep to middle: at most one shade under the map's water
    for (const g of [GRAZE_STEEP, (GRAZE_STEEP + GRAZE_DEEP) / 2]) {
      expect(skyTone(deep, g)).toEqual({ ramp: "water", shade: LIT - 1 });
      expect(skyTone(base, g)).toEqual(base);
      expect(skyTone(rim, g)).toEqual(rim);
    }
    for (const g of [GRAZE_DEEP, (GRAZE_DEEP + GRAZE_ONE) / 2]) {
      expect(skyTone(deep, g)).toEqual(deep);
      expect(skyTone(base, g)).toEqual(base);
    }
    expect(GRAZE_STEEP).toBeLessThan(GRAZE_DEEP);
    expect(GRAZE_DEEP).toBeLessThan(GRAZE_ONE);
  });

  it("lightens it a shade, then two, towards the horizon", () => {
    const grazing = Array.from(
      { length: 101 },
      (_, k) => GRAZE_DEEP + ((1 - GRAZE_DEEP) * k) / 100,
    );
    const shades = grazing.map((g) => skyTone(deep, g).shade);
    expect(new Set(shades)).toEqual(new Set([SHADE, SHADE + 1, SHADE + 2]));
    for (let k = 1; k < shades.length; k++) expect(shades[k]).toBeGreaterThanOrEqual(shades[k - 1]);
    expect(skyTone(deep, GRAZE_ONE).shade).toBe(SHADE + 1);
    expect(skyTone(deep, GRAZE_TWO).shade).toBe(SHADE + 2);
  });

  it("lightens back to the map's water, never past it, so the bands only get lighter outwards", () => {
    expect(skyTone(rim, 1)).toEqual(rim);
    expect(skyTone(deep, 1)).toEqual({ ramp: "water", shade: LIT });
    // along a look outwards (grazing growing), never darker then lighter then darker again
    for (const tone of [deep, base, rim]) {
      const shades = Array.from({ length: 101 }, (_, k) => skyTone(tone, k / 100).shade);
      const lowest = Math.min(...shades);
      const at = shades.indexOf(lowest);
      for (let k = 1; k <= at; k++) expect(shades[k]).toBeLessThanOrEqual(shades[k - 1]);
      for (let k = at + 1; k < shades.length; k++)
        expect(shades[k]).toBeGreaterThanOrEqual(shades[k - 1]);
      expect(Math.max(...shades)).toBe(LIT);
    }
  });

  it("shows no depth near the eye: the water round a swimmer is the map's", () => {
    const middle = (GRAZE_DEEP + GRAZE_ONE) / 2;
    expect(skyTone(deep, middle, DEPTH_NEAR - 1)).toEqual({ ramp: "water", shade: LIT });
    expect(skyTone(deep, middle, DEPTH_NEAR + 1)).toEqual(deep);
    expect(skyTone(deep, middle)).toEqual(deep);
  });

  it("leaves the shallow band alone", () => {
    const shallow: WaterTone = { ramp: "waterShallow", shade: LIT };
    for (const g of [0, 0.6, 1]) expect(skyTone(shallow, g)).toEqual(shallow);
  });
});

describe("reflectTone", () => {
  const map: WaterTone = { ramp: "water", shade: LIT };

  it("splits into three flat tones at darkCut and 110, one, two and three shades under the water", () => {
    const cut = 80;
    expect(reflectTone(0, cut, map)).toEqual({ ramp: "water", shade: DEEP });
    expect(reflectTone(79.9, cut, map)).toEqual({ ramp: "water", shade: DEEP });
    expect(reflectTone(80, cut, map)).toEqual({ ramp: "water", shade: SHADE });
    expect(reflectTone(109.9, cut, map)).toEqual({ ramp: "water", shade: SHADE });
    expect(reflectTone(110, cut, map)).toEqual({ ramp: "water", shade: HALF });
    expect(reflectTone(255, cut, map)).toEqual({ ramp: "water", shade: HALF });
    // on the map's water: the darkest darker than the deep water, the lightest close to the base
    expect(reflectTone(0, cut, map).shade).toBeLessThan(depthTone(99).shade);
  });

  it("always shows against the water under it, darker, down to the outline", () => {
    for (const shade of [OUTLINE + 1, SHADE, HALF, LIT, HIGH])
      for (const luma of [0, 90, 200]) {
        const r = reflectTone(luma, 80, { ramp: "water", shade });
        expect(r.shade).toBeLessThan(shade);
        expect(r.shade).toBeGreaterThanOrEqual(OUTLINE);
      }
  });

  it("keeps the water's ramp: a reflection in the shallow band is teal", () => {
    expect(reflectTone(200, 80, { ramp: "waterShallow", shade: LIT })).toEqual({
      ramp: "waterShallow",
      shade: HALF,
    });
  });
});

describe("dithered", () => {
  it("steps from 0 to 1 across a threshold, in a Bayer pattern within its width", () => {
    const cells = BAYER4.map((b) => (b + 0.5) / 16);
    expect(cells.every((b) => dithered(0, 5, 1, b) === 0)).toBe(true);
    expect(cells.every((b) => dithered(10, 5, 1, b) === 1)).toBe(true);
    // at the threshold itself, half the cells
    expect(cells.filter((b) => dithered(5, 5, 1, b) === 1).length).toBe(8);
    // a quarter of the way in, a quarter
    expect(cells.filter((b) => dithered(4.75, 5, 1, b) === 1).length).toBe(4);
    // no width: a hard step
    expect(dithered(4.99, 5, 0, 0.5)).toBe(0);
    expect(dithered(5.01, 5, 0, 0.5)).toBe(1);
  });

  it("uses each of the 16 thresholds once", () => {
    expect([...BAYER4].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, k) => k));
  });
});

describe("shallowUntil", () => {
  it("is a thin rim: a few pixels where the shore is near and large on screen, up to the 2 m band far off", () => {
    // steps a pixel: small when near
    expect(shallowUntil(0.01)).toBeLessThan(0.6);
    expect(shallowUntil(0.01)).toBeGreaterThan(0.5);
    expect(shallowUntil(1)).toBe(SHALLOW_STEPS);
    let last = 0;
    for (const s of [0.001, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 5]) {
      expect(shallowUntil(s)).toBeGreaterThanOrEqual(last);
      expect(shallowUntil(s)).toBeLessThanOrEqual(SHALLOW_STEPS);
      last = shallowUntil(s);
    }
  });
});

describe("the living surface", () => {
  it("uses cells twice as big a level up, the finest where a cell is small on screen", () => {
    expect(surfaceLevel(0)).toBe(0);
    expect(surfaceLevel(SURFACE_CELL)).toBe(0);
    expect(surfaceLevel(SURFACE_CELL * 2)).toBeCloseTo(1, 9);
    expect(surfaceLevel(SURFACE_CELL * 8)).toBeCloseTo(3, 9);
  });

  it("draws dashes of up to 4 pixels near, finer farther", () => {
    expect(dashSpan(0)).toBe(4);
    expect(dashSpan(20)).toBe(1);
    let last = 4;
    for (let l = 0; l < 12; l++) {
      expect(dashSpan(l)).toBeLessThanOrEqual(last);
      expect(dashSpan(l)).toBeGreaterThanOrEqual(1);
      last = dashSpan(l);
    }
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
