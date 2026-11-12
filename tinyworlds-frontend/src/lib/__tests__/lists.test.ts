import { afterEach, describe, expect, it, vi } from "vitest";
import { DICTIONARIES } from "@/i18n";
import { en } from "@/i18n/en";
import { ptBR } from "@/i18n/pt-BR";
import { parseMilestones } from "../donate";
import {
  beginOp,
  cityListState,
  dropPendingJoin,
  finishOp,
  isBusy,
  joinReturnOf,
  joinStep,
  joinWords,
  leaveState,
  leaveTokenFromHash,
  type LeaveState,
  linkNoticeOf,
  homeReturnUrl,
  NO_OPS,
  listParam,
  NEW_CITIES,
  parseMyLists,
  PENDING_JOIN_KEY,
  pendingKeptOnClose,
  savePendingJoin,
  takePendingJoin,
  waitingLine,
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
    expect(() => dropPendingJoin()).not.toThrow();
  });

  it("is dropped when the sign closes", () => {
    const data = storage();
    savePendingJoin({ kind: "new" });
    dropPendingJoin();
    expect(data.has(PENDING_JOIN_KEY)).toBe(false);
    expect(takePendingJoin()).toBeNull();
  });
});

describe("pendingKeptOnClose", () => {
  const lisbon = { kind: "city", slug: "lisbon", name: "Lisbon" } as const;
  it("keeps the join while a link asked for its list may still come back", () => {
    expect(pendingKeptOnClose(lisbon, new Set(["lisbon"]))).toBe(true);
    expect(pendingKeptOnClose({ kind: "new" }, new Set([NEW_CITIES]))).toBe(true);
  });
  it("drops it when the sign closes before a link was asked for that list", () => {
    expect(pendingKeptOnClose(lisbon, new Set())).toBe(false);
    expect(pendingKeptOnClose(lisbon, new Set([NEW_CITIES]))).toBe(false);
  });
});

describe("linkNoticeOf", () => {
  it("says a refused link has expired or was used", () => {
    expect(linkNoticeOf({ kind: "unauthorized" })).toBe("expired");
  });
  it("says to wait when there were too many tries", () => {
    expect(linkNoticeOf({ kind: "too-many" })).toBe("tooMany");
  });
  it("says the server could not be reached otherwise", () => {
    expect(linkNoticeOf({ kind: "network" })).toBe("failed");
    expect(linkNoticeOf(new Error("boom"))).toBe("failed");
    expect(linkNoticeOf(null)).toBe("failed");
  });
});

describe("joinReturnOf", () => {
  const lisbon = { kind: "city", slug: "lisbon", name: "Lisbon" } as const;
  it("a link that failed, with the join waiting here: the sign on that list, saying why", () => {
    expect(joinReturnOf({ ok: false, notice: "expired" }, lisbon)).toEqual({
      show: "sign",
      list: lisbon,
      notice: "expired",
    });
    expect(joinReturnOf({ ok: false, notice: "failed" }, { kind: "new" })).toEqual({
      show: "sign",
      list: { kind: "new" },
      notice: "failed",
    });
  });
  it("a link that failed, with no join waiting here: a toast saying why", () => {
    expect(joinReturnOf({ ok: false, notice: "expired" }, null)).toEqual({
      show: "toast",
      notice: "expired",
    });
  });
  it("a link that worked, with no join waiting here (opened on another device): signed in", () => {
    expect(joinReturnOf({ ok: true }, null)).toEqual({ show: "signed-in" });
  });
  it("a link that worked, with the join waiting here: the sign, on its last step", () => {
    expect(joinReturnOf({ ok: true }, lisbon)).toEqual({
      show: "sign",
      list: lisbon,
      notice: null,
    });
  });
  it("words every notice it can show, and the signed-in toast, in every language", () => {
    for (const [locale, t] of Object.entries(DICTIONARIES)) {
      for (const notice of ["expired", "tooMany", "failed"] as const)
        expect(t.lists.join.signIn[notice].trim(), locale).not.toBe("");
      // it never promises a welcome mail: that goes once per person, and only on a join
      expect(t.lists.join.signedIn, locale).not.toMatch(/welcome|boas-vindas|bienvenida/i);
    }
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

describe("calls in flight", () => {
  it("drops an older load's answer after a newer write", () => {
    const load = beginOp(NO_OPS);
    const join = beginOp(load.ops);
    const joined = finishOp(join.ops, join.ticket, "change", true);
    expect(joined.apply).toBe(true);
    const late = finishOp(joined.ops, load.ticket, "load", true);
    expect(late.apply).toBe(false);
    expect(late.ops.version).toBe(joined.ops.version);
  });

  it("writes a load that nothing overtook, and a failed one never", () => {
    const load = beginOp(NO_OPS);
    expect(finishOp(load.ops, load.ticket, "load", true).apply).toBe(true);
    expect(finishOp(load.ops, load.ticket, "load", false).apply).toBe(false);
  });

  it("writes a join's answer even if a load was written meanwhile", () => {
    const join = beginOp(NO_OPS);
    const load = beginOp(join.ops);
    const loaded = finishOp(load.ops, load.ticket, "load", true);
    expect(finishOp(loaded.ops, join.ticket, "change", true).apply).toBe(true);
  });

  it("stays busy until the last of two overlapping calls ends", () => {
    const a = beginOp(NO_OPS);
    const b = beginOp(a.ops);
    expect(isBusy(b.ops)).toBe(true);
    const first = finishOp(b.ops, a.ticket, "load", true);
    expect(isBusy(first.ops)).toBe(true);
    expect(isBusy(finishOp(first.ops, b.ticket, "change", true).ops)).toBe(false);
  });
});

describe("joinStep", () => {
  it("asks to sign in until there is a session", () => {
    expect(joinStep({ signedIn: false, joined: false, failed: false })).toBe("sign-in");
  });
  it("joins while signed in and not yet on the list", () => {
    expect(joinStep({ signedIn: true, joined: false, failed: false })).toBe("joining");
  });
  it("is done once on the list", () => {
    expect(joinStep({ signedIn: true, joined: true, failed: false })).toBe("done");
  });
  it("says so when the join failed", () => {
    expect(joinStep({ signedIn: true, joined: false, failed: true })).toBe("failed");
  });
});

describe("joinWords", () => {
  const lisbon = { kind: "city", slug: "lisbon", name: "Lisbon" } as const;
  it("fills a city's name into its title and body, and offers to help build it", () => {
    const w = joinWords(en, lisbon);
    expect(w.title).toBe("Hear when Lisbon is built");
    expect(w.doneTitle).toBe("You're on Lisbon's list");
    expect(w.doneBody("ana@example.com")).toContain("ana@example.com");
    expect(w.doneBody("ana@example.com")).toContain("Lisbon");
    expect(w.help).toBe("Help build Lisbon");
  });
  it("uses the new-cities forms, with nothing to help build", () => {
    const w = joinWords(en, { kind: "new" });
    expect(w.title).toBe("Hear when new cities are built");
    expect(w.doneTitle).toBe("You're on the list for new cities");
    expect(w.doneBody("ana@example.com")).toContain("ana@example.com");
    expect(w.help).toBeNull();
  });
  it("says what each list sends: one mail for a city, one per new city for new cities", () => {
    expect(joinWords(en, lisbon).body).toBe(en.lists.join.body);
    expect(joinWords(en, { kind: "new" }).body).toBe(
      "One email each time a new city is on the map. We promise we'll never spam you. First we check the address is yours: we'll send a code, no password.",
    );
    for (const [locale, t] of Object.entries(DICTIONARIES))
      expect(joinWords(t, { kind: "new" }).body, locale).not.toBe(joinWords(t, lisbon).body);
  });
});

describe("homeReturnUrl", () => {
  it("is the site's root on its origin when the front page is at the root", () => {
    expect(homeReturnUrl("/", "https://example.com")).toBe("https://example.com/");
  });
  it("is the front page's own address when that is absolute", () => {
    expect(homeReturnUrl("https://front.example.com/", "https://example.com")).toBe(
      "https://front.example.com/",
    );
  });
});

describe("waitingLine", () => {
  it("says nothing at zero (or less)", () => {
    expect(waitingLine(0, "en-US", en)).toBeNull();
    expect(waitingLine(-1, "en-US", en)).toBeNull();
  });

  it("says one, and how many", () => {
    expect(waitingLine(1, "en-US", en)).toBe("1 waiting");
    expect(waitingLine(12, "en-US", en)).toBe("12 waiting");
  });

  it("groups thousands as the language does, in its own words", () => {
    expect(waitingLine(1234, "en-US", en)).toBe("1,234 waiting");
    expect(waitingLine(1234, "pt-BR", ptBR)).toBe("1.234 esperando");
  });
});

describe("leaveTokenFromHash", () => {
  const token =
    "0b6e2a4c-1d3f-4e5a-8b7c-9d0e1f2a3b4c.*.q1w2e3r4t5y6u7i8o9p0_-AbCdEfGhIjKlMnOpQrStUvWx";

  it("reads the token of a leave link, a star and dots included", () => {
    expect(leaveTokenFromHash(`#t=${token}`)).toBe(token);
    expect(leaveTokenFromHash(`t=${token}`)).toBe(token);
  });

  it("is null when there is none, or it is not shaped like one", () => {
    expect(leaveTokenFromHash("")).toBeNull();
    expect(leaveTokenFromHash("#")).toBeNull();
    expect(leaveTokenFromHash("#t=")).toBeNull();
    expect(leaveTokenFromHash("#t=short")).toBeNull();
    expect(leaveTokenFromHash(`#token=${token}`)).toBeNull();
    expect(leaveTokenFromHash(`#t=${token}<script>`)).toBeNull();
    expect(leaveTokenFromHash(`#t=${"a".repeat(400)}`)).toBeNull();
  });
});

describe("leaveState", () => {
  const working: LeaveState = { phase: "working", all: false };

  it("starts working, remembering whether it leaves one list or all", () => {
    expect(leaveState({ phase: "left" }, { type: "start", all: true })).toEqual({
      phase: "working",
      all: true,
    });
  });

  it("a good token leaves the list, or every list when asked", () => {
    expect(leaveState(working, { type: "answered", all: false, good: true })).toEqual({
      phase: "left",
    });
    expect(leaveState(working, { type: "answered", all: true, good: true })).toEqual({
      phase: "left-all",
    });
  });

  it("a token that is not ours is bad, whichever was asked", () => {
    expect(leaveState(working, { type: "answered", all: false, good: false })).toEqual({
      phase: "bad",
    });
    expect(leaveState(working, { type: "answered", all: true, good: false })).toEqual({
      phase: "bad",
    });
  });

  it("no token at all is neutral, not bad", () => {
    expect(leaveState(working, { type: "none" })).toEqual({ phase: "none" });
    const left: LeaveState = { phase: "left" };
    expect(leaveState(left, { type: "none" })).toBe(left);
  });

  it("an unreachable API is failed, not bad, and remembers what to retry", () => {
    expect(leaveState({ phase: "working", all: true }, { type: "failed" })).toEqual({
      phase: "failed",
      all: true,
    });
  });

  it("an answer that arrives when nothing is awaited changes nothing", () => {
    const left: LeaveState = { phase: "left" };
    expect(leaveState(left, { type: "answered", all: true, good: false })).toBe(left);
    expect(leaveState(left, { type: "failed" })).toBe(left);
  });
});
