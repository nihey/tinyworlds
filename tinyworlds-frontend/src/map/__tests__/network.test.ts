import { describe, expect, it } from "vitest";
import {
  addSample,
  aheadTiles,
  CRAWL_POLICY,
  emptyEstimate,
  FAST_POLICY,
  initialPolicy,
  isLocalHost,
  policyFor,
  SLOW_POLICY,
} from "../network";

describe("isLocalHost", () => {
  it("recognises loopback names", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("[::1]")).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
    expect(isLocalHost(undefined)).toBe(false);
  });
});

describe("initialPolicy", () => {
  it("starts generous on localhost, before any sample", () => {
    expect(initialPolicy("localhost")).toEqual(FAST_POLICY);
  });
  it("uses the browser's connection hint when not local", () => {
    expect(initialPolicy("cdn.example", { effectiveType: "2g" })).toEqual(CRAWL_POLICY);
    expect(initialPolicy("cdn.example", { effectiveType: "3g" })).toEqual(SLOW_POLICY);
    expect(initialPolicy("cdn.example", { effectiveType: "4g" }).maxLoads).toBe(6);
  });
});

describe("addSample and policyFor", () => {
  it("ignores a tiny tile, which is mostly latency", () => {
    const est = addSample(emptyEstimate(), 6_000, 400);
    expect(est.samples).toBe(0);
  });
  it("moves to a fast policy after a quick local download", () => {
    let est = emptyEstimate();
    est = addSample(est, 200_000, 40); // 5 MB/s
    const p = policyFor(SLOW_POLICY, est, false, 0);
    expect(p.maxLoads).toBe(FAST_POLICY.maxLoads);
    expect(p.ring).toBe(1);
    expect(p.deferNative).toBe(false);
  });
  it("defers native tiles on a slow link while the view is moving quickly", () => {
    let est = emptyEstimate();
    est = addSample(est, 20_000, 800); // 25 KB/s
    const still = policyFor(CRAWL_POLICY, est, false, 0);
    expect(still.deferNative).toBe(false);
    const moving = policyFor(CRAWL_POLICY, est, true, 1200);
    expect(moving.deferNative).toBe(true);
    expect(moving.ring).toBe(0);
    expect(moving.maxLoads).toBeLessThanOrEqual(3);
  });
  it("does not defer native tiles on a fast link, even while panning", () => {
    const p = policyFor(FAST_POLICY, addSample(emptyEstimate(), 400_000, 30), true, 2000);
    expect(p.deferNative).toBe(false);
    expect(p.ring).toBe(1);
  });
});

describe("aheadTiles", () => {
  it("is still when the ring is off or the pan is slow", () => {
    expect(aheadTiles(0, 2000, 0)).toEqual({ aheadTx: 0, aheadTy: 0 });
    expect(aheadTiles(1, 50, 0)).toEqual({ aheadTx: 0, aheadTy: 0 });
  });
  it("adds tiles in the direction of a brisk pan", () => {
    expect(aheadTiles(1, 800, 0)).toEqual({ aheadTx: 1, aheadTy: 0 });
    expect(aheadTiles(1, 0, -900)).toEqual({ aheadTx: 0, aheadTy: -1 });
    expect(aheadTiles(1, 2000, 0)).toEqual({ aheadTx: 2, aheadTy: 0 });
  });
});
