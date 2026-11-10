import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHash, parseHash, writeHash } from "../hash";

describe("hash", () => {
  it("writes lat,lon to 5 places and scale to 2", () => {
    expect(formatHash({ lat: 40.758, lon: -73.9855, scale: 1.5 })).toBe("#40.75800,-73.98550,1.50");
  });

  it("reads what it writes", () => {
    const h = formatHash({ lat: 40.689247, lon: -74.044502, scale: 0.375 });
    expect(parseHash(h)).toEqual({ lat: 40.68925, lon: -74.0445, scale: 0.38 });
  });

  it("accepts a spot without a scale", () => {
    expect(parseHash("#40.7,-74")).toEqual({ lat: 40.7, lon: -74 });
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "#",
      "#abc",
      "#40.7",
      "#40.7,-74,0",
      "#40.7,-74,-2",
      "#91,0,1",
      "#0,181,1",
      "#1,2,3,4",
      "#40.7,,1",
      "#40.7,-74,x",
    ])
      expect(parseHash(bad), bad).toBeNull();
  });
});

describe("writeHash", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("changes the URL without going through a wrapped history.replaceState", () => {
    const calls: unknown[][] = [];
    class FakeHistory {
      replaceState(...args: unknown[]) {
        calls.push(args);
      }
    }
    const history = new FakeHistory();
    // what an analytics script does to see single-page navigation
    const wrapper = vi.fn();
    (history as { replaceState: unknown }).replaceState = wrapper;
    vi.stubGlobal("History", FakeHistory);
    vi.stubGlobal("window", { history });

    writeHash("#40.75800,-73.98550,1.50");

    expect(calls).toEqual([[null, "", "#40.75800,-73.98550,1.50"]]);
    expect(wrapper).not.toHaveBeenCalled();
  });
});
