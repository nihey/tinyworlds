import { describe, expect, it } from "vitest";
import {
  FADE_MS,
  lastSeen,
  mayAdvance,
  SLIDE_MS,
  stepSlide,
  tileSpan,
  type AdvanceState,
} from "../home";

describe("stepSlide", () => {
  it("goes round the slides both ways", () => {
    expect(stepSlide(0, 1, 12)).toBe(1);
    expect(stepSlide(11, 1, 12)).toBe(0);
    expect(stepSlide(0, -1, 12)).toBe(11);
    expect(stepSlide(5, -13, 12)).toBe(4);
  });

  it("stays on the first when there is nothing to go round", () => {
    expect(stepSlide(3, 1, 0)).toBe(0);
    expect(stepSlide(0, 1, 1)).toBe(0);
  });
});

describe("tileSpan", () => {
  it("gives the tile what is left of the last row, or a row of its own", () => {
    expect(tileSpan(7, 3)).toBe(2);
    expect(tileSpan(7, 2)).toBe(1);
    expect(tileSpan(8, 3)).toBe(1);
    expect(tileSpan(9, 3)).toBe(3);
    expect(tileSpan(9, 2)).toBe(1);
    expect(tileSpan(4, 1)).toBe(1);
    expect(tileSpan(0, 3)).toBe(3);
  });
});

describe("mayAdvance", () => {
  const watching: AdvanceState = {
    slides: 12,
    calm: false,
    saveData: false,
    hidden: false,
    inView: true,
    hovered: false,
    focused: false,
    chosen: false,
  };

  it("moves on while someone is watching and nobody is choosing", () => {
    expect(mayAdvance(watching)).toBe(true);
    expect(mayAdvance({ ...watching, slides: 2 })).toBe(true);
  });

  it("stands still for one slide, less motion, less data, a hidden page, a hero out of view, a pointer or the focus", () => {
    const changes: Partial<AdvanceState>[] = [
      { slides: 1 },
      { slides: 0 },
      { calm: true },
      { saveData: true },
      { hidden: true },
      { inView: false },
      { hovered: true },
      { focused: true },
    ];
    for (const change of changes) expect(mayAdvance({ ...watching, ...change })).toBe(false);
  });
});

describe("the carousel's measures", () => {
  it("waits eight seconds on a slide and fades for 600 ms", () => {
    expect(SLIDE_MS).toBe(8000);
    expect(FADE_MS).toBe(600);
  });
});

describe("a slide chosen by hand", () => {
  it("holds the hero: it is the visitor's from then on, pointer or finger or keys", () => {
    const watching: AdvanceState = {
      slides: 12,
      calm: false,
      saveData: false,
      hidden: false,
      inView: true,
      hovered: false,
      focused: false,
      chosen: false,
    };
    expect(mayAdvance(watching)).toBe(true);
    expect(mayAdvance({ ...watching, chosen: true })).toBe(false);
  });
});

describe("lastSeen", () => {
  it("believes the last thing an observer says in one delivery, not the first", () => {
    expect(lastSeen([{ isIntersecting: false }, { isIntersecting: true }], false)).toBe(true);
    expect(lastSeen([{ isIntersecting: true }, { isIntersecting: false }], true)).toBe(false);
  });

  it("keeps what it knew when told nothing", () => {
    expect(lastSeen([], true)).toBe(true);
    expect(lastSeen([], false)).toBe(false);
  });
});
