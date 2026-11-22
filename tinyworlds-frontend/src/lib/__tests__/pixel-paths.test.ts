import { describe, expect, it } from "vitest";
import { PIXEL_ART } from "@/components/benefactors/pixel-art";
import { pixelPaths } from "../pixel-paths";

/** Paints the paths back into rows of fills, one cell per pixel. */
function paint(rows: readonly string[], paths: { fill: string; d: string }[]): (string | null)[][] {
  const grid = rows.map((row) => Array.from(row, () => null as string | null));
  for (const { fill, d } of paths)
    for (const [, x, y, n] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g))
      for (let i = 0; i < Number(n); i++) {
        expect(grid[Number(y)][Number(x) + i]).toBeNull();
        grid[Number(y)][Number(x) + i] = fill;
      }
  return grid;
}

describe("pixelPaths", () => {
  it("draws every pixel of every badge in its colour, once, and nothing where it is clear", () => {
    for (const { rows, palette } of Object.values(PIXEL_ART)) {
      const grid = paint(rows, pixelPaths(rows, palette));
      rows.forEach((row, y) =>
        Array.from(row).forEach((c, x) => expect(grid[y][x]).toBe(palette[c] ?? null)),
      );
    }
  });

  it("makes one path per colour, a run of a colour one rectangle", () => {
    const paths = pixelPaths(["aab.", ".bba"], { a: "#111", b: "#222" });
    expect(paths).toEqual([
      { fill: "#111", d: "M0 0h2v1h-2zM3 1h1v1h-1z" },
      { fill: "#222", d: "M2 0h1v1h-1zM1 1h2v1h-2z" },
    ]);
  });

  it("joins neighbours of one colour written with different letters", () => {
    expect(pixelPaths(["ab"], { a: "#111", b: "#111" })).toEqual([
      { fill: "#111", d: "M0 0h2v1h-2z" },
    ]);
  });
});
