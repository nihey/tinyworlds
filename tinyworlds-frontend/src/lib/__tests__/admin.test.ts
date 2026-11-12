import { describe, expect, it } from "vitest";
import {
  authUrl,
  dayDate,
  formatShare,
  funnelSteps,
  normalizeCode,
  niceMax,
  parseFunnel,
  parseListCounts,
  parseNames,
  parseSession,
  rangeOf,
  rankWorlds,
  sessionOf,
  share,
  tokenFromHash,
  type FunnelCounts,
} from "../admin";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const counts = (over: Partial<FunnelCounts> = {}): FunnelCounts => ({
  visits: 0,
  donateOpened: 0,
  checkoutStarted: 0,
  checkoutCancelled: 0,
  donations: 0,
  raisedCents: 0,
  ...over,
});

describe("the admin's session", () => {
  const stored = { accessToken: "a.b.c", expiresAt: "2026-11-17T12:00:00.000Z", email: "a@b.co" };

  it("is kept while it has time left", () => {
    expect(parseSession(JSON.stringify(stored), NOW)).toEqual(stored);
    expect(parseSession(JSON.stringify(stored), Date.parse("2026-11-17T12:00:00Z"))).toBeNull();
  });

  it("is dropped when what is stored is not one", () => {
    for (const raw of [
      null,
      "",
      "not json",
      "null",
      "[]",
      JSON.stringify({ ...stored, accessToken: "" }),
      JSON.stringify({ ...stored, expiresAt: "soon" }),
      JSON.stringify({ accessToken: "a.b.c", expiresAt: stored.expiresAt }),
    ])
      expect(parseSession(raw, NOW), String(raw)).toBeNull();
  });

  it("is read from what the API answers a sign-in link with", () => {
    expect(
      sessionOf({
        accessToken: "a.b.c",
        expiresAt: stored.expiresAt,
        admin: { id: "1", email: "a@b.co" },
      }),
    ).toEqual(stored);
    expect(sessionOf(null)).toBeNull();
    expect(sessionOf({ accessToken: "a.b.c", expiresAt: stored.expiresAt })).toBeNull();
  });
});

describe("a donor's session", () => {
  const answer = {
    accessToken: "a.b.c",
    expiresAt: "2026-11-17T12:00:00.000Z",
    donor: { id: "1", email: "a@example.com" },
  };

  it("is read from a donor's answer, and only as a donor's", () => {
    expect(sessionOf(answer, "donor")).toEqual({
      accessToken: "a.b.c",
      expiresAt: answer.expiresAt,
      email: "a@example.com",
    });
    expect(sessionOf(answer, "admin")).toBeNull();
    expect(sessionOf(answer)).toBeNull();
  });
});

describe("a sign-in code", () => {
  it("is the six digits, however they were typed or pasted", () => {
    for (const text of ["482913", "482 913", "482-913", " 482913 ", "482\u00a0913", "482 - 913"])
      expect(normalizeCode(text), text).toBe("482913");
  });

  it("is nothing when it is not six digits", () => {
    for (const text of ["", "48291", "4829131", "48291a", "abcdef"])
      expect(normalizeCode(text), text).toBeNull();
  });
});

describe("a sign-in link", () => {
  it("carries its token in the hash", () => {
    const token = "Zm9vYmFyLWJhel9xdXgtMTIzNDU2Nzg5MA";
    expect(tokenFromHash(`#token=${token}`)).toBe(token);
    expect(tokenFromHash(`token=${token}`)).toBe(token);
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#12.5/-73.98/40.75")).toBeNull();
    expect(tokenFromHash("#token=short")).toBeNull();
    expect(tokenFromHash("#token=<script>alert(1)</script>-padding")).toBeNull();
  });

  it("is checked where the API is", () => {
    expect(authUrl("/api/graphql", "verify")).toBe("/api/auth/verify");
    expect(authUrl("http://localhost:4000/api/graphql/", "magic-link")).toBe(
      "http://localhost:4000/api/auth/magic-link",
    );
    expect(authUrl("", "verify")).toBeNull();
    expect(authUrl("https://example.com/somewhere", "verify")).toBeNull();
  });
});

describe("rangeOf", () => {
  it("is whole days on the admin's clock, today included", () => {
    const now = new Date(2026, 10, 10, 15, 30);
    const { from, to } = rangeOf(7, now);
    expect(from).toEqual(new Date(2026, 10, 4));
    expect(to).toEqual(new Date(2026, 10, 11));
    expect(rangeOf(1, now).from).toEqual(new Date(2026, 10, 10));
  });
});

describe("the funnel's arithmetic", () => {
  it("measures each step against the one before, and against the visits", () => {
    const steps = funnelSteps(
      counts({ visits: 1000, donateOpened: 50, checkoutStarted: 10, donations: 4 }),
    );
    expect(steps.map((step) => step.key)).toEqual([
      "visits",
      "donateOpened",
      "checkoutStarted",
      "donations",
    ]);
    expect(steps[0]).toMatchObject({ count: 1000, ofPrevious: null, ofVisits: null });
    expect(steps[1]).toMatchObject({ count: 50, ofPrevious: 0.05, ofVisits: 0.05 });
    expect(steps[2]).toMatchObject({ count: 10, ofPrevious: 0.2, ofVisits: 0.01 });
    expect(steps[3]).toMatchObject({ count: 4, ofPrevious: 0.4, ofVisits: 0.004 });
  });

  it("has no share of nothing, and never more than all", () => {
    expect(share(3, 0)).toBeNull();
    expect(share(0, 10)).toBe(0);
    // a gift through the plain payment link starts no checkout here
    expect(share(2, 1)).toBe(1);
    const quiet = funnelSteps(counts());
    expect(quiet.slice(1).every((step) => step.ofPrevious === null)).toBe(true);
  });

  it("writes a share the way the language does, small ones with a decimal", () => {
    expect(formatShare(0.015, "en-US")).toBe("1.5%");
    expect(formatShare(0.4, "en-US")).toBe("40%");
    expect(formatShare(0, "en-US")).toBe("0%");
    expect(formatShare(1, "en-US")).toBe("100%");
    expect(formatShare(0.015, "pt-BR")).toBe("1,5%");
    expect(formatShare(null, "en-US")).toBe("–");
  });

  it("ranks the maps by visits and sets apart what is not a city", () => {
    const { ranked, frontPage, unnamed } = rankWorlds([
      { world: "home", ...counts({ visits: 300 }) },
      { world: "tinyrao", ...counts({ visits: 20 }) },
      { world: null, ...counts({ donations: 1, raisedCents: 1000 }) },
      { world: "tinynyc", ...counts({ visits: 3000 }) },
      { world: "tinylas", ...counts({ visits: 20, donations: 1 }) },
    ]);
    expect(ranked.map((entry) => entry.world)).toEqual(["tinynyc", "tinylas", "tinyrao"]);
    expect(frontPage?.visits).toBe(300);
    expect(unnamed?.raisedCents).toBe(1000);
    expect(rankWorlds([]).frontPage).toBeNull();
  });

  it("tops a chart's scale at a round number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(18)).toBe(20);
    expect(niceMax(210)).toBe(250);
    expect(niceMax(3233)).toBe(5000);
    expect(niceMax(1000)).toBe(1000);
  });

  it("reads a day as a date that is that day everywhere", () => {
    expect(dayDate("2026-11-10").toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });
});

describe("parseFunnel", () => {
  it("keeps the well-formed parts of the answer", () => {
    const funnel = parseFunnel({
      timeZone: "America/Sao_Paulo",
      totals: counts({ visits: 12, donations: 1, raisedCents: 2500 }),
      worlds: [{ world: "tinynyc", ...counts({ visits: 10 }) }, { world: null }, "nonsense"],
      days: [
        { day: "2026-11-10", ...counts({ visits: 12 }) },
        { day: "tomorrow", visits: 4 },
      ],
      recentDonations: [
        {
          id: "d1",
          createdAt: "2026-11-10T12:00:00.000Z",
          amountCents: 2500,
          currency: "USD",
          city: "Lisbon",
          world: "tinynyc",
          locale: "pt-BR",
        },
        { id: "d2", createdAt: "never", amountCents: 100 },
      ],
    });
    expect(funnel.timeZone).toBe("America/Sao_Paulo");
    expect(funnel.totals).toMatchObject({ visits: 12, donations: 1, raisedCents: 2500 });
    expect(funnel.worlds.map((world) => world.world)).toEqual(["tinynyc", null]);
    expect(funnel.worlds[1].visits).toBe(0);
    expect(funnel.days.map((day) => day.day)).toEqual(["2026-11-10"]);
    expect(funnel.recentDonations).toEqual([
      {
        id: "d1",
        createdAt: "2026-11-10T12:00:00.000Z",
        amountCents: 2500,
        currency: "usd",
        city: "Lisbon",
        world: "tinynyc",
        locale: "pt-BR",
      },
    ]);
  });

  it("makes an empty report of an answer that is not one", () => {
    const funnel = parseFunnel(null);
    expect(funnel.totals).toEqual(counts());
    expect(funnel.worlds).toEqual([]);
    expect(funnel.days).toEqual([]);
    expect(funnel.timeZone).toBe("UTC");
  });
});

describe("the benefactor names", () => {
  const row = {
    donorId: "d1",
    name: "Ada",
    hidden: false,
    cities: ["New York", "Orlando"],
    lastGiftAt: "2026-11-10T12:00:00.000Z",
    links: [],
    linksHidden: false,
  };

  it("reads a donor's links and whether they are hidden; none from an older API", () => {
    const shop = {
      url: "https://shop.example.com/",
      title: "A tiny shop",
      description: null,
      icon: null,
      image: "/api/link-images/b",
    };
    const [read] = parseNames(
      [{ ...row, links: [shop], linksHidden: true }],
      "https://example.com",
    );
    expect(read.linksHidden).toBe(true);
    expect(read.links).toEqual([{ ...shop, image: "https://example.com/api/link-images/b" }]);
    const older: Partial<typeof row> = { ...row };
    delete older.links;
    delete older.linksHidden;
    expect(parseNames([older])).toEqual([row]);
  });

  it("keeps valid rows in the order given", () => {
    const second = { ...row, donorId: "d2", name: "Bo", hidden: true, cities: [] };
    expect(parseNames([row, second])).toEqual([row, second]);
  });

  it("drops rows that are malformed", () => {
    expect(
      parseNames([
        row,
        { ...row, donorId: "" },
        { ...row, name: 5 },
        { ...row, name: "  " },
        { ...row, hidden: "yes" },
        { ...row, lastGiftAt: "not a date" },
        null,
        "x",
      ]),
    ).toEqual([row]);
  });

  it("keeps only the text among a row's cities", () => {
    expect(parseNames([{ ...row, cities: ["Rome", 3, null, ""] }])[0].cities).toEqual(["Rome"]);
    expect(parseNames([{ ...row, cities: undefined }])[0].cities).toEqual([]);
  });

  it("is empty for anything that is not a list", () => {
    expect(parseNames(null)).toEqual([]);
    expect(parseNames({})).toEqual([]);
  });
});

describe("the lists' counts", () => {
  const raw = {
    cities: [
      { name: "Austin", slug: "austin", waiting: 12 },
      { name: "Denver", slug: "denver", waiting: 3 },
    ],
    newCities: 40,
  };

  it("keeps the cities in the order given, and the new cities' count", () => {
    expect(parseListCounts(raw)).toEqual(raw);
  });

  it("has no cities and none waiting when the lists are empty", () => {
    expect(parseListCounts({ cities: [], newCities: 0 })).toEqual({ cities: [], newCities: 0 });
  });

  it("drops rows that are malformed", () => {
    const read = parseListCounts({
      cities: [
        raw.cities[0],
        { name: "", slug: "x", waiting: 1 },
        { name: "No slug", waiting: 1 },
        { name: "Bad", slug: "bad", waiting: -1 },
        { name: "Float", slug: "float", waiting: 1.5 },
        { name: "Text", slug: "text", waiting: "4" },
        null,
      ],
      newCities: 2,
    });
    expect(read?.cities).toEqual([raw.cities[0]]);
  });

  it("is null when the answer is not counts at all, never a table that claims nobody waits", () => {
    expect(parseListCounts(null)).toBeNull();
    expect(parseListCounts("x")).toBeNull();
    expect(parseListCounts({ cities: [] })).toBeNull();
    expect(parseListCounts({ cities: [], newCities: -1 })).toBeNull();
    expect(parseListCounts({ cities: "no", newCities: 1 })).toBeNull();
  });
});
