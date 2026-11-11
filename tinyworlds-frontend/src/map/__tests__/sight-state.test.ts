import { describe, expect, it } from "vitest";
import { hover, press, release, shown, type SightState } from "../sight-state";

const idle: SightState = { hovered: null, pinned: null };

describe("the sight under the pointer", () => {
  it("does not change while the pointer stays on the same sight", () => {
    const onA = hover(idle, "a");
    expect(hover(onA, "a")).toBe(onA);
    expect(hover(idle, null)).toBe(idle);
  });

  it("clears when the pointer leaves every sight", () => {
    expect(shown(hover(hover(idle, "a"), null))).toBeNull();
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

  it("moves the pin to another sight pressed while one is pinned", () => {
    expect(shown(press(press(idle, "a"), "b"))).toEqual({ id: "b", pinned: true });
  });
});
