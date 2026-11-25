import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHash, formatWalkHash, parseHash, parseWalkHash, writeHash } from "../hash";

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

describe("walk links", () => {
  it("reads a walk link", () => {
    expect(parseWalkHash("#walk=40.758,-73.9855,90")).toEqual({
      lat: 40.758,
      lon: -73.9855,
      heading: 90,
    });
  });

  it("rejects bad numbers and missing parts", () => {
    for (const bad of [
      "",
      "#walk=",
      "#walk=40.7,-74",
      "#walk=40.7,-74,x",
      "#walk=40.7,,90",
      "#walk=91,0,0",
      "#walk=0,181,0",
      "#walk=1,2,3,4",
      "#40.7,-74,90",
      "#walk=NaN,0,0",
    ])
      expect(parseWalkHash(bad), bad).toBeNull();
  });

  it("writes 5 places and a whole, normalised heading, and reads it back", () => {
    expect(formatWalkHash({ lat: 40.758, lon: -73.9855, heading: 359.6 })).toBe(
      "#walk=40.75800,-73.98550,0",
    );
    expect(formatWalkHash({ lat: 1, lon: 2, heading: -90 })).toBe("#walk=1.00000,2.00000,270");
    const v = { lat: 40.68925, lon: -74.0445, heading: 135 };
    expect(parseWalkHash(formatWalkHash(v))).toEqual(v);
  });

  it("is not a map link, and map links are unchanged", () => {
    expect(parseHash("#walk=40.758,-73.9855,90")).toBeNull();
    expect(parseHash("#40.7,-73.9,2")).toEqual({ lat: 40.7, lon: -73.9, scale: 2 });
  });
});
