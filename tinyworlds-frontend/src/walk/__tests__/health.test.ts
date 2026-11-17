import { describe, expect, it } from "vitest";
import { fallDamage, fireDamage, hitDamage, LIFE_MAX, regen } from "../health";

describe("damage", () => {
  it("hurts from 4 m, kills at 15 m, never in water", () => {
    expect(fallDamage(3.9, "ground")).toBe(0);
    expect(fallDamage(15, "ground")).toBe(100);
    expect(fallDamage(30, "deck")).toBe(100);
    expect(fallDamage(9.5, "ground")).toBeCloseTo(50);
    expect(fallDamage(30, "water")).toBe(0);
  });

  it("makes a car at 30 mph lethal and a nudge harmless", () => {
    expect(hitDamage(13.41)).toBeGreaterThanOrEqual(100);
    expect(hitDamage(2)).toBe(0);
    expect(hitDamage(0)).toBe(0);
  });

  it("burns by distance to a wreck", () => {
    expect(fireDamage(0)).toBe(80);
    expect(fireDamage(5)).toBe(40);
    expect(fireDamage(5.1)).toBe(0);
  });
});

describe("regen", () => {
  it("waits 5 s, then gives 2 a second, up to 100", () => {
    expect(regen(50, 0, 1)).toBe(50);
    expect(regen(50, 4.5, 1)).toBeCloseTo(51);
    expect(regen(50, 5, 1)).toBeCloseTo(52);
    expect(regen(99, 10, 1)).toBe(LIFE_MAX);
    expect(regen(100, 10, 1)).toBe(LIFE_MAX);
  });
});
