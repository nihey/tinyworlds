import { describe, expect, it } from "vitest";
import { WASTED, wastedAt } from "../wasted";

describe("wasted", () => {
  it("slows time to a quarter for 1.5 s, then runs at full rate", () => {
    expect(wastedAt(0.5, false).timeRate).toBe(0.25);
    expect(wastedAt(1.6, false).timeRate).toBe(1);
  });

  it("drains the colours and lifts the camera", () => {
    expect(wastedAt(0, false).grey).toBe(0);
    expect(wastedAt(WASTED.slowFor, false).grey).toBe(1);
    expect(wastedAt(0, false).lift).toBe(0);
    expect(wastedAt(3, false).lift).toBeGreaterThan(0.5);
  });

  it("brings the word up by wordAt + 0.3 and it can be skipped only then", () => {
    expect(wastedAt(WASTED.wordAt - 0.01, false).word).toBe(0);
    expect(wastedAt(WASTED.wordAt + 0.3, false).word).toBe(1);
    expect(wastedAt(WASTED.wordAt + 0.1, false).skippable).toBe(false);
    expect(wastedAt(WASTED.wordAt + 0.3, false).skippable).toBe(true);
  });

  it("ends after the hold and the fade", () => {
    const end = WASTED.wordAt + WASTED.holdFor + WASTED.fadeFor;
    expect(wastedAt(end - 0.01, false).done).toBe(false);
    expect(wastedAt(end - 0.01, false).word).toBeLessThan(0.1);
    expect(wastedAt(end, false).done).toBe(true);
  });

  it("keeps only the word and the fade under reduced motion", () => {
    const r = wastedAt(0.5, true);
    expect(r.timeRate).toBe(1);
    expect(r.lift).toBe(0);
    expect(r.grey).toBe(0);
    expect(wastedAt(2, true).word).toBe(1);
  });
});
