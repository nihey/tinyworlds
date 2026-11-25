import { describe, expect, it } from "vitest";
import {
  applyAffine,
  clipPolyline,
  ELEVATED,
  MAJOR,
  easeSpan,
  maskWater,
  minimapSpan,
  minimapTransform,
  northTick,
  offDataWater,
  rasterSegments,
  SEG,
  SPAN_FAR,
  SPAN_NEAR,
  squareSegments,
  squareWays,
  STREET,
} from "../minimap";
import { makeCell, streetEdge, waterRect } from "./fixtures";

const RAD = Math.PI / 180;

describe("the minimap's zoom", () => {
  it("shows 150 m standing still and 450 m at 30 m/s and over", () => {
    expect(minimapSpan(0)).toBe(SPAN_NEAR);
    expect(SPAN_NEAR).toBe(150);
    expect(minimapSpan(30)).toBe(SPAN_FAR);
    expect(SPAN_FAR).toBe(450);
    expect(minimapSpan(45)).toBe(450);
    expect(minimapSpan(1000)).toBe(450);
  });

  it("only zooms out as the speed grows", () => {
    let before = minimapSpan(0);
    for (let v = 0.5; v <= 40; v += 0.5) {
      const now = minimapSpan(v);
      expect(now).toBeGreaterThanOrEqual(before);
      before = now;
    }
    expect(minimapSpan(10)).toBeGreaterThan(minimapSpan(5));
  });

  it("takes reversing as speed, and nonsense as standing still", () => {
    expect(minimapSpan(-12)).toBe(minimapSpan(12));
    expect(minimapSpan(Number.NaN)).toBe(150);
  });

  it("eases towards a new span, and jumps there under reduced motion", () => {
    const eased = easeSpan(150, 450, 0.05, false);
    expect(eased).toBeGreaterThan(150);
    expect(eased).toBeLessThan(200);
    expect(easeSpan(150, 450, 0.05, true)).toBe(450);
    // the first drawing has nothing to ease from
    expect(easeSpan(Number.NaN, 300, 0.05, false)).toBe(300);
    // most of the way in a second, all but nothing in five
    let s = 150;
    for (let k = 0; k < 20; k++) s = easeSpan(s, 450, 0.05, false);
    expect(s).toBeGreaterThan(380);
    for (let k = 0; k < 80; k++) s = easeSpan(s, 450, 0.05, false);
    expect(s).toBeCloseTo(450, 0);
  });
});

describe("the minimap's transform", () => {
  const size = 87;

  it("puts you at the centre", () => {
    const m = minimapTransform({ e: 1234, n: -567, yaw: 1.1 }, 150, size);
    const [x, y] = applyAffine(m, 1234, -567);
    expect(x).toBeCloseTo(size / 2, 6);
    expect(y).toBeCloseTo(size / 2, 6);
  });

  it("puts what is straight ahead above the centre, whichever way you face", () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const yaw = deg * RAD;
      const at = { e: 500, n: 800, yaw };
      const m = minimapTransform(at, 150, size);
      // 30 m ahead
      const [x, y] = applyAffine(m, at.e + Math.sin(yaw) * 30, at.n + Math.cos(yaw) * 30);
      expect(x).toBeCloseTo(size / 2, 6);
      expect(y).toBeCloseTo(size / 2 - (30 * size) / 150, 6);
      // and what is on your right, to the right
      const [rx, ry] = applyAffine(m, at.e + Math.cos(yaw) * 30, at.n - Math.sin(yaw) * 30);
      expect(rx).toBeCloseTo(size / 2 + (30 * size) / 150, 6);
      expect(ry).toBeCloseTo(size / 2, 6);
    }
  });

  it("draws farther out smaller as it zooms out", () => {
    const at = { e: 0, n: 0, yaw: 0 };
    const near = applyAffine(minimapTransform(at, 150, size), 0, 60)[1];
    const far = applyAffine(minimapTransform(at, 450, size), 0, 60)[1];
    expect(size / 2 - near).toBeCloseTo(3 * (size / 2 - far), 6);
  });

  it("ticks north on the rim, where north lies", () => {
    const inset = 5;
    const top = northTick(0, size, inset);
    expect(top.edge).toBe("top");
    expect(top.x).toBeCloseTo(size / 2, 6);
    expect(top.y).toBeCloseTo(inset, 6);
    // facing east, north is on your left
    const east = northTick(90 * RAD, size, inset);
    expect(east.edge).toBe("left");
    expect(east.x).toBeCloseTo(inset, 6);
    expect(east.y).toBeCloseTo(size / 2, 6);
    expect(northTick(180 * RAD, size, inset).edge).toBe("bottom");
    expect(northTick(270 * RAD, size, inset).edge).toBe("right");
    // in between, on the rim and the way the transform puts north
    for (let deg = 0; deg < 360; deg += 10) {
      const yaw = deg * RAD;
      const t = northTick(yaw, size, inset);
      const [nx, ny] = applyAffine(minimapTransform({ e: 0, n: 0, yaw }, 150, size), 0, 50);
      const along = (t.x - size / 2) * (nx - size / 2) + (t.y - size / 2) * (ny - size / 2);
      const across = (t.x - size / 2) * (ny - size / 2) - (t.y - size / 2) * (nx - size / 2);
      expect(along).toBeGreaterThan(0);
      expect(Math.abs(across)).toBeLessThan(1e-6 * size * size);
      const rim = Math.max(Math.abs(t.x - size / 2), Math.abs(t.y - size / 2));
      expect(rim).toBeCloseTo(size / 2 - inset, 6);
    }
  });
});

describe("a square's streets on the minimap", () => {
  /** Square (2, 3): e from 400 to 600, n from 600 to 800. */
  const cell = makeCell(2, 3, {
    streets: [
      // a street from the square's west neighbour, across it and on into the east one
      streetEdge(1, 2, [
        [350, 700],
        [450, 700],
        [550, 720],
        [650, 720],
      ]),
      // a major avenue inside it, north to south
      streetEdge(
        3,
        4,
        [
          [500, 610],
          [500, 790],
        ],
        { cls: 2, width: 18 },
      ),
      // a bridge's deck coming in from the north
      streetEdge(
        5,
        6,
        [
          [420, 900, 25],
          [420, 650, 20],
        ],
        { cls: 1, elevated: true, width: 13 },
      ),
      // and a street that only passes by
      streetEdge(7, 8, [
        [100, 100],
        [300, 100],
      ]),
    ],
  });

  it("keeps each street's stretch inside the square", () => {
    const ways = squareWays(cell);
    expect(ways).toHaveLength(3);
    for (const w of ways) {
      expect(w.pts.length % 2).toBe(0);
      expect(w.pts.length).toBeGreaterThanOrEqual(4);
      for (let q = 0; q < w.pts.length; q += 2) {
        expect(w.pts[q]).toBeGreaterThanOrEqual(400 - 1e-3);
        expect(w.pts[q]).toBeLessThanOrEqual(600 + 1e-3);
        expect(w.pts[q + 1]).toBeGreaterThanOrEqual(600 - 1e-3);
        expect(w.pts[q + 1]).toBeLessThanOrEqual(800 + 1e-3);
      }
    }
    // the one across is cut at the square's west and east edges, its bend kept
    const across = ways[0];
    expect(Array.from(across.pts)).toEqual([400, 700, 450, 700, 550, 720, 600, 720]);
  });

  it("flags the elevated ways and the major classes, at their widths", () => {
    const [street, avenue, deck] = squareWays(cell);
    expect(street).toMatchObject({ elevated: false, major: false, width: 10 });
    expect(avenue).toMatchObject({ elevated: false, major: true, width: 18 });
    expect(deck).toMatchObject({ elevated: true, width: 13 });
    expect(deck.pts[1]).toBeCloseTo(800, 3);
    expect(deck.pts[3]).toBeCloseTo(650, 3);
  });

  it("splits a street that leaves the square and comes back into two stretches", () => {
    const runs = clipPolyline(
      Float32Array.of(410, 610, 0, 700, 610, 0, 700, 790, 0, 410, 790, 0),
      3,
      400,
      600,
      600,
      800,
    );
    expect(runs.map((r) => Array.from(r))).toEqual([
      [410, 610, 600, 610],
      [600, 790, 410, 790],
    ]);
  });

  it("reads a square's water from its mask", () => {
    expect(maskWater(cell, 450, 650)).toBe(false);
    const all = makeCell(2, 3, { mask: { mode: 1, bits: null } });
    expect(maskWater(all, 450, 650)).toBe(true);
    // a pond in the square's south-west, 2 m cells
    const pond = makeCell(2, 3, { mask: waterRect(2, 3, 410, 620, 470, 700) });
    expect(maskWater(pond, 411, 621)).toBe(true);
    expect(maskWater(pond, 469.9, 699.9)).toBe(true);
    expect(maskWater(pond, 470.1, 650)).toBe(false);
    expect(maskWater(pond, 440, 619.9)).toBe(false);
    expect(maskWater(pond, 590, 790)).toBe(false);
    // the square's far edges read its last row and column, not the next square's first
    const east = makeCell(2, 3, { mask: waterRect(2, 3, 598, 600, 600, 800) });
    expect(maskWater(east, 600, 700)).toBe(true);
  });

  it("lays the open water past the edge of the data, but not beside land", () => {
    const exists = (i: number) => i < 5;
    expect(offDataWater(2, 0, exists, () => false)).toBe(false);
    expect(offDataWater(8, 0, exists, () => false)).toBe(true);
    // the data ends inland: an all-land square beside
    expect(offDataWater(5, 0, exists, (i) => i === 4)).toBe(false);
  });
});

describe("the minimap's pixels", () => {
  const size = 87;
  const lit = (code: Uint8Array, x: number, y: number) => code[x + y * size];

  it("flattens a square's streets into segments with their layers", () => {
    const cell = makeCell(0, 0, {
      streets: [
        streetEdge(1, 2, [
          [10, 100],
          [100, 100],
          [190, 120],
        ]),
        streetEdge(
          3,
          4,
          [
            [50, 10],
            [50, 190],
          ],
          { cls: 0, width: 20 },
        ),
        streetEdge(
          5,
          6,
          [
            [150, 10, 9],
            [150, 190, 9],
          ],
          { elevated: true },
        ),
      ],
    });
    const segs = squareSegments(cell);
    expect(segs.length).toBe(4 * SEG);
    expect(Array.from(segs.subarray(0, SEG))).toEqual([10, 100, 100, 100, 10, STREET]);
    expect(segs[2 * SEG + 4]).toBe(20);
    expect(segs[2 * SEG + 5]).toBe(MAJOR);
    expect(segs[3 * SEG + 5]).toBe(ELEVATED);
  });

  it("lights the pixels within half a street's width, at its real width", () => {
    // a 10 m street crosswise through you, 150 m across: 5.8 px wide
    const m = minimapTransform({ e: 0, n: 0, yaw: 0 }, 150, size);
    const code = new Uint8Array(size * size);
    rasterSegments(code, size, m, Float32Array.of(-200, 0, 200, 0, 10, STREET), 1.2);
    const rows = [];
    for (let y = 0; y < size; y++) if (lit(code, 43, y)) rows.push(y);
    expect(rows).toEqual([41, 42, 43, 44, 45]);
    for (let x = 0; x < size; x++) expect(lit(code, x, 43)).toBe(STREET);
    // nothing else
    expect(code.reduce((a, c) => a + (c ? 1 : 0), 0)).toBe(5 * size);
  });

  it("ends a street round, and leaves the far side of its end alone", () => {
    const m = minimapTransform({ e: 0, n: 0, yaw: 0 }, 150, size);
    const code = new Uint8Array(size * size);
    // from you northwards 30 m
    rasterSegments(code, size, m, Float32Array.of(0, 0, 0, 30, 10, STREET), 1.2);
    const top = Math.round(43.5 - (30 * size) / 150);
    expect(lit(code, 43, top)).toBe(STREET);
    expect(lit(code, 43, top - 4)).toBe(0);
    expect(lit(code, 43, 43 + 4)).toBe(0);
    // the round end: narrower at the tip than along the street
    const across = (y: number) => code.subarray(y * size, (y + 1) * size).filter((c) => c).length;
    expect(across(top - 3)).toBeGreaterThan(0);
    expect(across(top - 3)).toBeLessThan(across(30));
  });

  it("draws the higher layer where two meet", () => {
    const m = minimapTransform({ e: 0, n: 0, yaw: 0 }, 150, size);
    const code = new Uint8Array(size * size);
    rasterSegments(
      code,
      size,
      m,
      Float32Array.of(
        0,
        -100,
        0,
        100,
        12,
        ELEVATED,
        -100,
        0,
        100,
        0,
        12,
        STREET,
        20,
        -100,
        20,
        100,
        8,
        MAJOR,
      ),
      1.2,
    );
    expect(lit(code, 43, 43)).toBe(ELEVATED);
    expect(lit(code, 10, 43)).toBe(STREET);
    expect(lit(code, 43 + Math.round((20 * size) / 150), 43)).toBe(MAJOR);
  });

  it("keeps a narrow street far out a line, not dots", () => {
    // 2 m wide at 450 m across is 0.4 px: drawn at the least width, unbroken on the diagonal
    const yaw = 0.4;
    const m = minimapTransform({ e: 0, n: 0, yaw }, 450, size);
    const code = new Uint8Array(size * size);
    rasterSegments(code, size, m, Float32Array.of(-300, -300, 300, 300, 2, STREET), 1.2);
    for (let y = 5; y < size - 5; y++) {
      const row = code.subarray(y * size, (y + 1) * size);
      expect(row.some((c) => c === STREET)).toBe(true);
    }
  });

  it("turns with you: a street ahead runs up the middle whichever way you face", () => {
    for (const deg of [0, 30, 90, 135, 200, 300]) {
      const yaw = deg * RAD;
      const m = minimapTransform({ e: 500, n: 800, yaw }, 150, size);
      const code = new Uint8Array(size * size);
      const far = 200;
      rasterSegments(
        code,
        size,
        m,
        Float32Array.of(500, 800, 500 + Math.sin(yaw) * far, 800 + Math.cos(yaw) * far, 8, STREET),
        1.2,
      );
      for (let y = 5; y < 40; y++) expect(lit(code, 43, y)).toBe(STREET);
      expect(lit(code, 43, 80)).toBe(0);
      expect(lit(code, 10, 20)).toBe(0);
    }
  });
});
