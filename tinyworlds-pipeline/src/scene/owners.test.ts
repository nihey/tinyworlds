import { describe, expect, it } from "vitest";
import { nearestBridge } from "./owners.js";

describe("nearestBridge", () => {
  const brooklyn = { name: "Brooklyn Bridge", xy: [0, 0, 100, 0] };
  const manhattan = { name: "Manhattan Bridge", xy: [0, 80, 100, 80] };

  it("finds the bridge whose deck passes close by", () => {
    expect(nearestBridge(50, 10, [brooklyn], 40)).toBe("Brooklyn Bridge");
  });

  it("finds none when every deck is further than the limit", () => {
    expect(nearestBridge(50, 60, [brooklyn], 40)).toBeNull();
    expect(nearestBridge(160, 0, [brooklyn], 40)).toBeNull();
  });

  it("picks the nearer of two decks", () => {
    expect(nearestBridge(50, 30, [brooklyn, manhattan], 40)).toBe("Brooklyn Bridge");
    expect(nearestBridge(50, 55, [brooklyn, manhattan], 40)).toBe("Manhattan Bridge");
  });
});
