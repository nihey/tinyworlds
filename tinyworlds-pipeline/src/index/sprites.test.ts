import { describe, expect, it } from "vitest";
import { binVolumes } from "../render/bin.js";
import type { Scene } from "../render/scene.js";
import { spriteRect, spriteSrc, VolumeGrid } from "./sprites.js";

describe("spriteRect", () => {
  it("is the whole-pixel box round every ring, with a margin", () => {
    const rect = spriteRect([
      [10.5, 20, 30, 20.5, 30, 40],
      [5, 25, 6, 26, 5.5, 27.5],
    ]);
    expect(rect).toEqual({ x0: 3, y0: 18, w: 29, h: 24 });
  });
});

describe("spriteSrc", () => {
  it("names a picture by its sight, in a file name that needs no escaping", () => {
    expect(spriteSrc("bridge:queensboro bridge")).toMatch(/^sights\/[0-9a-z]+\.webp$/);
    expect(spriteSrc("b1we5bnh")).toBe(spriteSrc("b1we5bnh"));
    expect(spriteSrc("statue:0")).not.toBe(spriteSrc("statue:1"));
  });
});

/** Boxes standing on a grid of ground boxes, packed the way the scene packs volumes. */
function boxes(list: { x: number; y: number; w: number; h: number; top: number }[]): Scene {
  const bbox: number[] = [];
  for (const b of list) bbox.push(b.x, b.y, b.x + b.w, b.y + b.h);
  return {
    vol: {
      bbox: Float32Array.from(bbox),
      count: list.length,
      top: Float32Array.from(list.map((b) => b.top)),
      roofH: new Float32Array(list.length),
    },
  } as unknown as Scene;
}

describe("VolumeGrid", () => {
  // a city's worth of towers, low and high, spread over several cells of the grid
  const list: { x: number; y: number; w: number; h: number; top: number }[] = [];
  let h = 12345;
  const rand = (): number => (h = (h * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 3000; i++)
    list.push({
      x: rand() * 6000 - 3000,
      y: rand() * 4000 - 2000,
      w: 10 + rand() * 80,
      h: 6 + rand() * 40,
      top: rand() < 0.05 ? 400 + rand() * 900 : rand() * 120,
    });
  const scene = boxes(list);
  const grid = new VolumeGrid(scene);

  it("finds the same volumes and margins for a rectangle as looking at every one", () => {
    for (const rect of [
      { x0: -100, y0: -300, w: 200, h: 600 },
      { x0: 1000, y0: 500, w: 40, h: 40 },
      { x0: -2900, y0: -1900, w: 900, h: 300 },
      { x0: 1023, y0: -1, w: 3, h: 2 },
    ])
      expect(binVolumes(scene, rect, grid.near(rect))).toEqual(binVolumes(scene, rect));
  });

  it("gives each candidate once, in ascending order", () => {
    const near = [...grid.near({ x0: -1500, y0: -1500, w: 3000, h: 3000 })];
    expect(near).toEqual([...new Set(near)].sort((a, b) => a - b));
  });
});
