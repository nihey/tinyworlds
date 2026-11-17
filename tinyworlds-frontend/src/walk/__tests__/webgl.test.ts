import { describe, expect, it } from "vitest";
import { canDrawWalk } from "../webgl";

/** A canvas whose contexts are these. */
const canvas = (contexts: Record<string, unknown>) => () => ({
  getContext: (id: string) => contexts[id] ?? null,
});

describe("canDrawWalk", () => {
  it("is false when the browser gives neither WebGL 2 nor WebGL", () => {
    expect(canDrawWalk(canvas({}))).toBe(false);
  });

  it("is false with WebGL 1 alone: the renderer needs WebGL 2", () => {
    expect(canDrawWalk(canvas({ webgl: {} }))).toBe(false);
  });

  it("is true with WebGL 2, and lets the test context go", () => {
    let lost = false;
    const gl = {
      getExtension: (name: string) =>
        name === "WEBGL_lose_context" ? { loseContext: () => (lost = true) } : null,
    };
    expect(canDrawWalk(canvas({ webgl2: gl }))).toBe(true);
    expect(lost).toBe(true);
  });

  it("is false, without throwing, when asking throws or there is no canvas", () => {
    expect(
      canDrawWalk(() => ({
        getContext: () => {
          throw new Error("blocked");
        },
      })),
    ).toBe(false);
    expect(canDrawWalk(() => null)).toBe(false);
    expect(
      canDrawWalk(() => {
        throw new Error("no document");
      }),
    ).toBe(false);
  });
});
