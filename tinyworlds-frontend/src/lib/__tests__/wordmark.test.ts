import { describe, expect, it } from "vitest";
import { WORLDS } from "@/worlds";
import { wordmarkScale } from "../wordmark";

describe("wordmarkScale", () => {
  it("leaves an airport code, and the site's own name, at full size", () => {
    for (const suffix of ["nyc", "rao", "orl", "fte", "vlc", "las", "worlds"])
      expect(wordmarkScale(suffix)).toBe(1);
  });

  it("sets a long name smaller, in proportion to its length", () => {
    expect(wordmarkScale("winterfell")).toBeCloseTo(10 / 14, 5);
    expect(wordmarkScale("kingslanding")).toBeCloseTo(10 / 16, 5);
    expect(wordmarkScale("kingslanding")).toBeLessThan(wordmarkScale("winterfell"));
  });

  it("never sets a name too small to read", () => {
    expect(wordmarkScale("a".repeat(40))).toBe(0.6);
  });

  it("keeps every world's wordmark as wide as ten letters at most", () => {
    for (const world of Object.values(WORLDS)) {
      const letters = 4 + world.wordmark.length;
      expect(letters * wordmarkScale(world.wordmark), world.id).toBeLessThanOrEqual(10.0001);
    }
  });
});
