import { describe, expect, it } from "vitest";
import { CYCLE, GREEN, YELLOW, greenLeft, phaseOf, signal } from "../lights";

describe("the signal cycle", () => {
  it("runs 34 s: 13 green, 3 yellow, the rest red", () => {
    expect([CYCLE, GREEN, YELLOW]).toEqual([34, 13, 3]);
    expect(signal(0, 0)).toBe("green");
    expect(signal(12.9, 0)).toBe("green");
    expect(signal(13.5, 0)).toBe("yellow");
    expect(signal(16, 0)).toBe("red");
    expect(signal(20, 0)).toBe("red");
    expect(signal(33.9, 0)).toBe("red");
    expect(signal(34, 0)).toBe("green");
  });

  it("gives the other phase the same 17 s later, every node in step", () => {
    expect(signal(17, 1)).toBe("green");
    expect(signal(0, 1)).toBe("red");
    for (let t = 0; t < 2 * CYCLE; t += 0.25) expect(signal(t + 17, 1)).toBe(signal(t, 0));
  });

  it("never has both phases going at once", () => {
    for (let t = 0; t < CYCLE; t += 0.1) {
      const both = [signal(t, 0), signal(t, 1)];
      expect(both).toContain("red");
    }
  });

  it("says how much green is left, none on yellow or red", () => {
    expect(greenLeft(10, 0)).toBeCloseTo(3);
    expect(greenLeft(0, 0)).toBeCloseTo(13);
    expect(greenLeft(14, 0)).toBe(0);
    expect(greenLeft(20, 0)).toBe(0);
    expect(greenLeft(27, 1)).toBeCloseTo(3);
  });

  it("wraps times before the start", () => {
    expect(signal(-1, 0)).toBe("red");
    expect(signal(-34, 0)).toBe("green");
  });
});

describe("which phase a way into a crossing runs with", () => {
  it("is along within 45 degrees of the node's bearing, either way, else across", () => {
    const bearing = 0.5;
    expect(phaseOf(bearing, 0.5)).toBe(0);
    expect(phaseOf(bearing, 0.5 + Math.PI)).toBe(0);
    expect(phaseOf(bearing, 0.5 - Math.PI)).toBe(0);
    expect(phaseOf(bearing, 0.5 + 0.7)).toBe(0);
    expect(phaseOf(bearing, 0.5 + 0.9)).toBe(1);
    expect(phaseOf(bearing, 0.5 + Math.PI / 2)).toBe(1);
    expect(phaseOf(bearing, 0.5 - Math.PI / 2)).toBe(1);
  });
});
