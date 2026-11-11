import { describe, expect, it } from "vitest";
import { HOLD_MS, hover, leave, press, release, shown, tap, type SightState } from "../sight-state";

const idle: SightState = { hovered: null, pinned: null, leftAt: null };

describe("the sight under the pointer", () => {
  it("does not change while the pointer stays on the same sight", () => {
    const onA = hover(idle, "a");
    expect(hover(onA, "a")).toBe(onA);
    expect(hover(idle, null)).toBe(idle);
  });

  it("holds a sight a moment after the pointer leaves it for open ground, then clears", () => {
    const off = hover(hover(idle, "a", 0), null, 1000);
    expect(shown(off)).toEqual({ id: "a", pinned: false });
    expect(shown(hover(off, null, 1000 + HOLD_MS - 1))).toEqual({ id: "a", pinned: false });
    expect(shown(hover(off, null, 1000 + HOLD_MS))).toBeNull();
  });

  it("goes straight to the next sight, and crossing a gap does not let go", () => {
    const off = hover(hover(idle, "a", 0), null, 1000);
    expect(shown(hover(off, "b", 1050))).toEqual({ id: "b", pinned: false });
    const back = hover(hover(off, "a", 1050), null, 1300);
    expect(shown(hover(back, null, 1300 + HOLD_MS - 1))).toEqual({ id: "a", pinned: false });
  });

  it("clears at once when the mouse leaves the map", () => {
    expect(shown(leave(hover(idle, "a", 0)))).toBeNull();
  });

  it("shows the hovered sight, not pinned", () => {
    expect(shown(hover(idle, "a"))).toEqual({ id: "a", pinned: false });
  });

  it("pins a pressed sight, and keeps it while another is hovered", () => {
    const pinned = press(hover(idle, "a"), "a");
    expect(shown(pinned)).toEqual({ id: "a", pinned: true });
    expect(shown(hover(pinned, "b"))).toEqual({ id: "a", pinned: true });
  });

  it("lets a pinned sight go on a press elsewhere, on release, or on a second press", () => {
    const pinned = press(idle, "a");
    expect(shown(press(pinned, null))).toBeNull();
    expect(shown(release(pinned))).toBeNull();
    expect(shown(press(pinned, "a"))).toBeNull();
  });

  it("lets a finger's tap elsewhere clear a hover the mouse left behind", () => {
    const hovered = hover(idle, "a"); // a mouse on a touch-screen laptop
    expect(shown(tap(press(hovered, "a"), null))).toBeNull();
    expect(shown(tap(hovered, "b"))).toEqual({ id: "b", pinned: true });
  });

  it("moves the pin to another sight pressed while one is pinned", () => {
    expect(shown(press(press(idle, "a"), "b"))).toEqual({ id: "b", pinned: true });
  });
});
