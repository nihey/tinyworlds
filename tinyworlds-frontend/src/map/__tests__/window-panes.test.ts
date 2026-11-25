import { describe, expect, it } from "vitest";
import { windowPaneMask } from "../window-panes";

const size = 96;
function wall() {
  const image = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < image.length; i += 4) image.set([175, 156, 148, 255], i);
  return image;
}
function paint(
  image: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: number[],
) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) image.set(rgb, (j * size + i) * 4);
  }
}

describe("window light masks", () => {
  it.each([1, 2, 4, 8])("lights a stable subset of panes at a %ix downsample", (step) => {
    const image = wall();
    const pane = Math.max(1, 4 / step);
    // The coarser levels introduce small colour shifts during WebP encoding.
    const glass = step === 1 ? [65, 103, 138, 255] : [51, 70, 94, 255];
    for (let y = 8; y < size - 8; y += 8) {
      for (let x = 8; x < size - 8; x += 8) paint(image, x, y, pane, pane, glass);
    }
    const obtain = () => windowPaneMask(image, size, size, -176, 80, step);
    const mask = obtain();
    expect(mask).not.toBeNull();
    expect(mask).toEqual(obtain());
    let on = 0,
      off = 0;
    for (let i = 0; i < size * size; i++) {
      if (mask![i * 4 + 3]) {
        expect(image[i * 4]).toBe(glass[0]);
        on++;
      } else if (image[i * 4] === glass[0]) off++;
    }
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(0);
  });

  it("ignores dark flecks between bright leaves or waves at a compressed zoom level", () => {
    for (const background of [
      [112, 168, 102, 255],
      [61, 140, 181, 255],
    ]) {
      const image = wall();
      paint(image, 0, 0, size, size, background);
      for (let y = 5; y < size - 4; y += 8) {
        for (let x = 5; x < size - 4; x += 8) paint(image, x, y, 2, 2, [45, 63, 80, 255]);
      }
      expect(windowPaneMask(image, size, size, 0, 0, 2)).toBeNull();
    }
  });

  it("leaves broad glass surfaces, transparent pixels and open water dark", () => {
    const image = wall();
    paint(image, 4, 4, 86, 64, [65, 103, 138, 255]);
    paint(image, 4, 76, 4, 4, [65, 103, 138, 0]);
    paint(image, 22, 76, 4, 4, [61, 130, 171, 255]);
    expect(windowPaneMask(image, size, size, 0, 0, 1)).toBeNull();
    expect(windowPaneMask(image, size, size, 0, 0, 2)).toBeNull();
  });
});
