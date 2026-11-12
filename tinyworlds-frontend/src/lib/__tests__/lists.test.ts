import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMilestones } from "../donate";
import {
  cityListState,
  listParam,
  NEW_CITIES,
  parseMyLists,
  PENDING_JOIN_KEY,
  savePendingJoin,
  takePendingJoin,
  type MyLists,
} from "../lists";

const lisbon = {
  slug: "lisbon",
  name: "Lisbon",
  status: "PROPOSED",
  raisedCents: 1000,
  goalCents: 3000,
  waiting: 4,
};

describe("listParam", () => {
  it("names new cities by a star and a city by its slug", () => {
    expect(listParam({ kind: "new" })).toBe(NEW_CITIES);
    expect(listParam({ kind: "city", slug: "lisbon", name: "Lisbon" })).toBe("lisbon");
  });
});

describe("parseMyLists", () => {
  it("reads a good answer", () => {
    expect(parseMyLists({ newCities: true, cities: [lisbon], donated: ["porto"] })).toEqual({
      newCities: true,
      cities: [lisbon],
      donated: ["porto"],
    });
  });

  it("refuses what is not the contract's", () => {
    expect(parseMyLists(null)).toBeNull();
    expect(parseMyLists("lists")).toBeNull();
    expect(parseMyLists({ cities: [], donated: [] })).toBeNull();
    expect(parseMyLists({ newCities: "yes", cities: [], donated: [] })).toBeNull();
    expect(parseMyLists({ newCities: false, cities: "x", donated: [] })).toBeNull();
    expect(parseMyLists({ newCities: false, cities: [], donated: [3] })).toBeNull();
  });

  it("drops a city that is malformed and keeps the rest", () => {
    const lists = parseMyLists({
      newCities: false,
      cities: [{ slug: "x" }, lisbon, null],
      donated: [],
    });
    expect(lists?.cities).toEqual([lisbon]);
  });
});

describe("cityListState", () => {
  const lists: MyLists = {
    newCities: false,
    cities: [lisbon, { ...lisbon, slug: "porto", name: "Porto" }] as MyLists["cities"],
    donated: ["porto", "faro"],
  };

  it("offers the join to someone who is not on the list, or not signed in", () => {
    expect(cityListState("rome", lists)).toBe("join");
    expect(cityListState("lisbon", null)).toBe("join");
  });

  it("says joined for a list the donor is on", () => {
    expect(cityListState("lisbon", lists)).toBe("joined");
  });

  it("lets donor win over joined", () => {
    expect(cityListState("porto", lists)).toBe("donor");
    expect(cityListState("faro", lists)).toBe("donor");
  });
});

describe("the pending join", () => {
  afterEach(() => vi.unstubAllGlobals());

  function storage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
    return data;
  }

  it("returns the saved key once", () => {
    const data = storage();
    savePendingJoin({ kind: "city", slug: "lisbon", name: "Lisbon" });
    expect(data.has(PENDING_JOIN_KEY)).toBe(true);
    expect(takePendingJoin()).toEqual({ kind: "city", slug: "lisbon", name: "Lisbon" });
    expect(takePendingJoin()).toBeNull();
  });

  it("keeps new cities too", () => {
    storage();
    savePendingJoin({ kind: "new" });
    expect(takePendingJoin()).toEqual({ kind: "new" });
  });

  it("forgets it after an hour", () => {
    storage();
    savePendingJoin({ kind: "new" });
    expect(takePendingJoin(Date.now() + 61 * 60_000)).toBeNull();
  });

  it("gives none for garbage", () => {
    storage({ [PENDING_JOIN_KEY]: "{not json" });
    expect(takePendingJoin()).toBeNull();
    storage({ [PENDING_JOIN_KEY]: JSON.stringify({ at: Date.now(), key: { kind: "other" } }) });
    expect(takePendingJoin()).toBeNull();
  });

  it("gives none, and does not throw, with storage blocked", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("blocked");
      },
    });
    expect(() => savePendingJoin({ kind: "new" })).not.toThrow();
    expect(takePendingJoin()).toBeNull();
  });
});

describe("parseMilestones and waiting", () => {
  const base = { id: "1", slug: "a", name: "A", raisedCents: 0, goalCents: 3000, donations: 0 };

  it("reads how many are waiting", () => {
    expect(parseMilestones([{ ...base, waiting: 7 }])[0].waiting).toBe(7);
  });

  it("defaults to 0 when an older API leaves it out", () => {
    expect(parseMilestones([base])[0].waiting).toBe(0);
    expect(parseMilestones([{ ...base, waiting: -2 }])[0].waiting).toBe(0);
  });
});
