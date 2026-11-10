import { describe, expect, it } from "vitest";
import { fillEllipse, fillPolygon, fillQuad, ringArea2 } from "./raster.js";

function paint(
  w: number,
  h: number,
  draw: (span: (y: number, x0: number, x1: number) => void) => void,
): Uint8Array {
  const buf = new Uint8Array(w * h);
  draw((y, x0, x1) => {
    for (let x = x0; x < x1; x++) buf[y * w + x]++;
  });
  return buf;
}
const count = (buf: Uint8Array) => buf.reduce((a, b) => a + b, 0);

describe("fillPolygon", () => {
  it("fills a square by pixel centres", () => {
    const buf = paint(8, 8, (span) => fillPolygon([1, 1, 5, 1, 5, 4, 1, 4], [0, 4], 0, 1, 0, 0, 8, 8, span));
    expect(count(buf)).toBe(12);
    expect(buf[1 * 8 + 1]).toBe(1);
    expect(buf[3 * 8 + 4]).toBe(1);
    expect(buf[4 * 8 + 1]).toBe(0);
    expect(buf[1 * 8 + 5]).toBe(0);
  });

  it("leaves holes empty", () => {
    const xy = [0, 0, 8, 0, 8, 8, 0, 8, /* hole */ 2, 2, 6, 2, 6, 6, 2, 6];
    const buf = paint(8, 8, (span) => fillPolygon(xy, [0, 4, 8], 0, 2, 0, 0, 8, 8, span));
    expect(count(buf)).toBe(64 - 16);
    expect(buf[3 * 8 + 3]).toBe(0);
  });

  it("clips to the target and applies the offset", () => {
    const buf = paint(4, 4, (span) =>
      fillPolygon([98, 98, 110, 98, 110, 110, 98, 110], [0, 4], 0, 1, 100, 100, 4, 4, span),
    );
    expect(count(buf)).toBe(16);
  });

  it("covers a shared edge exactly once", () => {
    // two triangles splitting a slanted quad, plus a neighbour along a 2:1 edge
    const a = [0.3, 0.2, 13.7, 6.9, 2.1, 11.4];
    const b = [13.7, 6.9, 15.2, 14.8, 2.1, 11.4];
    const buf = paint(16, 16, (span) => {
      fillPolygon(a, [0, 3], 0, 1, 0, 0, 16, 16, span);
      fillPolygon(b, [0, 3], 0, 1, 0, 0, 16, 16, span);
    });
    expect(Math.max(...buf)).toBe(1);
    const whole = paint(16, 16, (span) =>
      fillPolygon([0.3, 0.2, 13.7, 6.9, 15.2, 14.8, 2.1, 11.4], [0, 4], 0, 1, 0, 0, 16, 16, span),
    );
    expect(Array.from(buf)).toEqual(Array.from(whole));
  });

  it("handles a ring that repeats its first vertex", () => {
    const open = paint(8, 8, (span) => fillPolygon([1, 1, 6, 1, 6, 6, 1, 6], [0, 4], 0, 1, 0, 0, 8, 8, span));
    const closed = paint(8, 8, (span) =>
      fillPolygon([1, 1, 6, 1, 6, 6, 1, 6, 1, 1], [0, 5], 0, 1, 0, 0, 8, 8, span),
    );
    expect(Array.from(closed)).toEqual(Array.from(open));
  });
});

describe("fillQuad / fillEllipse", () => {
  it("fills a quad", () => {
    const buf = paint(8, 8, (span) => fillQuad(0, 0, 4, 0, 4, 2, 0, 2, 8, 8, span));
    expect(count(buf)).toBe(8);
  });

  it("fills a 2:1 ellipse symmetrically", () => {
    const buf = paint(16, 16, (span) => fillEllipse(8, 8, 6, 3, 16, 16, span));
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) expect(buf[y * 16 + x]).toBe(buf[(15 - y) * 16 + (15 - x)]);
    expect(count(buf)).toBeGreaterThan(48);
  });
});

describe("ringArea2", () => {
  it("is positive for a clockwise ring on screen", () => {
    expect(ringArea2([0, 0, 2, 0, 2, 2, 0, 2], 0, 4)).toBe(8);
    expect(ringArea2([0, 0, 0, 2, 2, 2, 2, 0], 0, 4)).toBe(-8);
  });
});
