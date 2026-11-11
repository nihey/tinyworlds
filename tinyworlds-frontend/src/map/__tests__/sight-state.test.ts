import { describe, expect, it } from "vitest";
import {
  HOLD_MS,
  hold,
  hover,
  keepInView,
  leave,
  press,
  release,
  shown,
  tap,
  type SightState,
} from "../sight-state";

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

describe("a sight the view leaves behind", () => {
  const only =
    (...ids: string[]) =>
    (id: string) =>
      ids.includes(id);

  it("lets a pinned sight go once it is wholly off screen", () => {
    const pinned = press(idle, "a");
    expect(keepInView(pinned, only("a"))).toBe(pinned);
    expect(shown(keepInView(pinned, only()))).toBeNull();
  });

  it("lets a hovered sight go too, held or not", () => {
    const onA = hover(idle, "a", 0);
    expect(shown(keepInView(onA, only()))).toBeNull();
    const held = hover(onA, null, 1000);
    expect(keepInView(held, only())).toEqual(idle);
  });

  it("keeps whatever is still on screen", () => {
    const both = hover(press(idle, "a"), "b");
    expect(shown(keepInView(both, only("b")))).toEqual({ id: "b", pinned: false });
    expect(shown(keepInView(both, only("a")))).toEqual({ id: "a", pinned: true });
  });

  it("does not ask about anything when nothing is lit", () => {
    expect(keepInView(idle, () => false)).toBe(idle);
  });
});

describe("a sight held lit (Guess the building)", () => {
  const busy: SightState = { hovered: "a", pinned: "c", leftAt: null };

  it("lights only the held sight, as a pinned one", () => {
    expect(shown(hold(busy, "b"))).toEqual({ id: "b", pinned: true });
  });

  it("ignores the pointer, the taps, Esc and the view while it holds", () => {
    const held = hold(busy, "b");
    expect(hover(held, "c", 5)).toBe(held);
    expect(hover(held, null, 5)).toBe(held);
    expect(press(held, "c")).toBe(held);
    expect(tap(held, null)).toBe(held);
    expect(leave(held)).toBe(held);
    expect(release(held)).toBe(held);
    expect(keepInView(held, () => false)).toBe(held);
  });

  it("lets go of everything when the hold ends, and the pointer works again", () => {
    const free = hold(hold(busy, "b"), null);
    expect(shown(free)).toBeNull();
    expect(shown(hover(free, "c"))).toEqual({ id: "c", pinned: false });
  });
});
