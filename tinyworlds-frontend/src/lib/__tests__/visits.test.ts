import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byVisits,
  everyWhileShown,
  LIVE_SHOWN_ABOVE,
  parseWorldVisits,
  presenceRequest,
  siteTotals,
  visitsLine,
  watchHidden,
  visitsRequest,
  type ShownPage,
  type WorldCounts,
} from "../visits";

const VISIT = "0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10";

const words = {
  visits: { one: "{n} visit", other: "{n} visits" },
  exploringNow: "{n} exploring now",
};

describe("presenceRequest", () => {
  it("says which visit's map is still open", () => {
    expect(presenceRequest(VISIT, "tinynyc", "pt-BR")).toEqual({
      query: expect.stringContaining("trackPresence(input: $input)"),
      variables: { input: { visitId: VISIT, world: "tinynyc", locale: "pt-BR" } },
    });
  });
});

describe("visitsRequest", () => {
  it("asks for the worlds' visits", () => {
    expect(visitsRequest(["tinynyc", "tinyrao"])).toEqual({
      query: expect.stringContaining("worldVisits(input: $input) { world visits live }"),
      variables: { input: { worlds: ["tinynyc", "tinyrao"] } },
    });
  });
});

describe("parseWorldVisits", () => {
  it("reads the answer by world", () => {
    const counts = parseWorldVisits({
      data: {
        worldVisits: [
          { world: "tinynyc", visits: 41203, live: 23 },
          { world: "tinyrao", visits: 48, live: 0 },
        ],
      },
    });
    expect(counts.get("tinynyc")).toEqual({ visits: 41203, live: 23 });
    expect(counts.get("tinyrao")).toEqual({ visits: 48, live: 0 });
  });

  it("refuses an answer that is not one", () => {
    for (const body of [
      null,
      { errors: [{ message: "Bad Request" }] },
      { data: { worldVisits: [{ world: "tinynyc", visits: "many", live: 0 }] } },
      { data: { worldVisits: [{ world: "tinynyc", visits: -1, live: 0 }] } },
    ])
      expect(() => parseWorldVisits(body)).toThrow();
  });
});

describe("byVisits", () => {
  const worlds = [{ id: "tinynyc" }, { id: "tinyrao" }, { id: "tinyorl" }, { id: "tinyfte" }];

  it("puts the most visited first, keeping the list's order on a tie", () => {
    const counts: WorldCounts = new Map([
      ["tinynyc", { visits: 10, live: 0 }],
      ["tinyrao", { visits: 30, live: 0 }],
      ["tinyorl", { visits: 10, live: 0 }],
    ]);
    // tinyfte has no count: none yet
    expect(byVisits(worlds, counts).map((w) => w.id)).toEqual([
      "tinyrao",
      "tinynyc",
      "tinyorl",
      "tinyfte",
    ]);
  });

  it("keeps the list's own order until the counts are there", () => {
    expect(byVisits(worlds, null)).toEqual(worlds);
  });

  it("leaves the list it was given as it was", () => {
    const counts: WorldCounts = new Map([["tinyfte", { visits: 1, live: 0 }]]);
    byVisits(worlds, counts);
    expect(worlds[0].id).toBe("tinynyc");
  });
});

describe("visitsLine", () => {
  it("writes the visits in the visitor's language", () => {
    expect(visitsLine({ visits: 41203, live: 3 }, "en-US", words)).toEqual({
      visits: "41,203 visits",
      live: null,
    });
    expect(visitsLine({ visits: 41203, live: 3 }, "pt-BR", words).visits).toBe("41.203 visits");
    expect(visitsLine({ visits: 1, live: 0 }, "en-US", words).visits).toBe("1 visit");
  });

  it(`says who is exploring only above ${LIVE_SHOWN_ABOVE}`, () => {
    expect(visitsLine({ visits: 500, live: LIVE_SHOWN_ABOVE }, "en-US", words).live).toBeNull();
    expect(visitsLine({ visits: 500, live: LIVE_SHOWN_ABOVE + 1 }, "en-US", words).live).toBe(
      "11 exploring now",
    );
    expect(visitsLine({ visits: 5000, live: 1234 }, "en-US", words).live).toBe(
      "1,234 exploring now",
    );
  });

  it("says nothing for a world nobody has visited, or one not counted", () => {
    expect(visitsLine({ visits: 0, live: 0 }, "en-US", words)).toEqual({
      visits: null,
      live: null,
    });
    expect(visitsLine(undefined, "en-US", words)).toEqual({ visits: null, live: null });
  });
});

describe("everyWhileShown", () => {
  /** A page that can be put out of view and back, the way a tab is. */
  function page(hidden = false) {
    const listeners = new Set<() => void>();
    const shown: ShownPage & { hide(): void; show(): void; listening(): number } = {
      isHidden: () => hidden,
      listen: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      hide: () => {
        hidden = true;
        listeners.forEach((fn) => fn());
      },
      show: () => {
        hidden = false;
        listeners.forEach((fn) => fn());
      },
      listening: () => listeners.size,
    };
    return shown;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says it every so often while the page is in view", () => {
    const say = vi.fn();
    everyWhileShown(say, 30_000, page());
    expect(say).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(say).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(say).toHaveBeenCalledTimes(3);
  });

  it("says it at once when asked to", () => {
    const say = vi.fn();
    everyWhileShown(say, 30_000, page(), { atOnce: true });
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("says it as soon as a page opened out of view comes into view, when asked to say it at once", () => {
    const say = vi.fn();
    const tab = page(true);
    everyWhileShown(say, 30_000, tab, { atOnce: true });
    expect(say).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    tab.show();
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("says nothing while the page is out of view, and says it again on coming back", () => {
    const say = vi.fn();
    const tab = page();
    everyWhileShown(say, 30_000, tab);
    tab.hide();
    vi.advanceTimersByTime(120_000);
    expect(say).not.toHaveBeenCalled();
    tab.show();
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("does not say it again on coming back from a glance away", () => {
    const say = vi.fn();
    const tab = page();
    everyWhileShown(say, 30_000, tab);
    vi.advanceTimersByTime(30_000);
    expect(say).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    tab.hide();
    tab.show();
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("stops for good when told", () => {
    const say = vi.fn();
    const tab = page();
    const stop = everyWhileShown(say, 30_000, tab);
    stop();
    vi.advanceTimersByTime(120_000);
    tab.hide();
    tab.show();
    expect(say).not.toHaveBeenCalled();
    expect(tab.listening()).toBe(0);
  });
});

describe("siteTotals", () => {
  it("knows nothing before the counts come", () => {
    expect(siteTotals(null)).toBeNull();
  });

  it("adds the worlds' visits up, and those exploring now", () => {
    const counts: WorldCounts = new Map([
      ["tinynyc", { visits: 10, live: 2 }],
      ["tinyrao", { visits: 5, live: 0 }],
    ]);
    expect(siteTotals(counts)).toEqual({ visits: 15, live: 2 });
    expect(siteTotals(new Map())).toEqual({ visits: 0, live: 0 });
  });
});

describe("watchHidden", () => {
  function tab(hidden: boolean) {
    const listeners = new Set<() => void>();
    return {
      isHidden: () => hidden,
      listen: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      turn: (to: boolean) => {
        hidden = to;
        listeners.forEach((fn) => fn());
      },
      listening: () => listeners.size,
    };
  }

  it("says at once that a page opened behind another is out of view", () => {
    const said: boolean[] = [];
    watchHidden(tab(true), (hidden) => said.push(hidden));
    expect(said).toEqual([true]);
  });

  it("says so again whenever the page goes out of view or comes back, until told to stop", () => {
    const said: boolean[] = [];
    const page = tab(false);
    const stop = watchHidden(page, (hidden) => said.push(hidden));
    page.turn(true);
    page.turn(false);
    expect(said).toEqual([false, true, false]);
    stop();
    expect(page.listening()).toBe(0);
    page.turn(true);
    expect(said).toEqual([false, true, false]);
  });
});
