import { describe, expect, it } from "vitest";
import { DAY, NIGHT } from "../daylight";
import { CONDITIONS, weatherLight } from "../weather";

describe("weather lighting", () => {
  it("leaves a clear scene and its window lamps intact", () => {
    for (const light of [DAY, NIGHT]) expect(weatherLight(light, "clear")).toBe(light);
  });

  it.each(CONDITIONS)("keeps %s legible at both times of day", (condition) => {
    const day = weatherLight(DAY, condition);
    const night = weatherLight(NIGHT, condition);
    expect(day.lamps).toBe(0);
    expect(night.lamps).toBe(1);
    expect(night.curve[10]).toBeLessThan(day.curve[10]);
    for (const sample of [day, night]) {
      for (let i = 3; i < 15; i++) expect(sample.curve[i]).toBeGreaterThan(sample.curve[i - 3]);
    }
  });
});
