import { describe, expect, it, vi } from "vitest";
import {
  checkoutInput,
  chosenCity,
  CITY_LIMIT,
  CITY_MAX,
  donateMode,
  donateUrl,
  formatUsd,
  isCheckoutUrl,
  listCities,
  parseMilestones,
  paymentLinkFor,
  progress,
  readDonated,
  returnUrlOf,
  withTimeout,
  type CityMilestone,
} from "../donate";

const LINK = "https://donate.stripe.com/test_example";
const NO_LINKS = { "en-US": "", "pt-BR": "", "es-ES": "" };

describe("donateUrl", () => {
  it("says which world sent the donor and which language to speak", () => {
    expect(donateUrl(LINK, "tinynyc", "en-US")).toBe(
      `${LINK}?client_reference_id=tinynyc&locale=en`,
    );
    expect(donateUrl(LINK, "tinyrao", "pt-BR")).toBe(
      `${LINK}?client_reference_id=tinyrao&locale=pt-BR`,
    );
    expect(donateUrl(LINK, "home", "es-ES")).toBe(`${LINK}?client_reference_id=home&locale=es`);
  });

  it("keeps what the link already carries, and does not repeat its own parameters", () => {
    const url = new URL(
      donateUrl(`${LINK}?prefilled_promo_code=CITY&locale=fr#pay`, "tinyrao", "pt-BR")!,
    );
    expect(url.origin + url.pathname).toBe(LINK);
    expect(url.searchParams.get("prefilled_promo_code")).toBe("CITY");
    expect(url.searchParams.getAll("locale")).toEqual(["pt-BR"]);
    expect(url.searchParams.get("client_reference_id")).toBe("tinyrao");
    expect(url.hash).toBe("#pay");
  });

  it("is null when there is no link, or it is not an https address", () => {
    for (const bad of [
      undefined,
      "",
      "   ",
      "donate.stripe.com/test_example",
      "http://donate.stripe.com/x",
      "javascript:alert(1)",
    ])
      expect(donateUrl(bad, "tinynyc", "en-US"), String(bad)).toBeNull();
  });
});

describe("paymentLinkFor", () => {
  const links = { "en-US": `${LINK}_en`, "pt-BR": `${LINK}_pt`, "es-ES": "" };

  it("uses the language's own link", () => {
    expect(paymentLinkFor("pt-BR", "tinyrao", links)).toBe(
      `${LINK}_pt?client_reference_id=tinyrao&locale=pt-BR`,
    );
    expect(paymentLinkFor("en-US", "tinyrao", links)).toBe(
      `${LINK}_en?client_reference_id=tinyrao&locale=en`,
    );
  });

  it("falls back to the default link, still asking for the visitor's language", () => {
    expect(paymentLinkFor("es-ES", "tinynyc", links)).toBe(
      `${LINK}_en?client_reference_id=tinynyc&locale=es`,
    );
  });

  it("is null when no link would do", () => {
    expect(paymentLinkFor("en-US", "tinynyc", NO_LINKS)).toBeNull();
    // a link for another language is no use without a default
    expect(paymentLinkFor("en-US", "tinynyc", { ...NO_LINKS, "pt-BR": LINK })).toBeNull();
    expect(paymentLinkFor("pt-BR", "tinynyc", { ...NO_LINKS, "pt-BR": LINK })).not.toBeNull();
  });
});

const city = (over: Partial<CityMilestone>): CityMilestone => ({
  id: over.name ?? "x",
  slug: "x",
  name: "X",
  raisedCents: 0,
  goalCents: 10000,
  donations: 0,
  status: "PROPOSED",
  worldId: null,
  ...over,
});

describe("progress", () => {
  it("is the share of the goal that is in", () => {
    expect(progress({ raisedCents: 0, goalCents: 10000 })).toBe(0);
    expect(progress({ raisedCents: 3500, goalCents: 10000 })).toBeCloseTo(0.35);
    expect(progress({ raisedCents: 10000, goalCents: 10000 })).toBe(1);
  });

  it("never overflows the bar, and never runs backwards", () => {
    expect(progress({ raisedCents: 25000, goalCents: 10000 })).toBe(1);
    expect(progress({ raisedCents: -500, goalCents: 10000 })).toBe(0);
  });

  it("copes with a city that has no goal", () => {
    expect(progress({ raisedCents: 0, goalCents: 0 })).toBe(0);
    expect(progress({ raisedCents: 100, goalCents: 0 })).toBe(1);
  });
});

describe("formatUsd", () => {
  it("writes whole dollars the way each language does", () => {
    expect(formatUsd(3500, "en-US")).toBe("$35");
    expect(formatUsd(10000, "en-US")).toBe("$100");
    expect(formatUsd(3500, "pt-BR").replace(/\s/g, " ")).toBe("US$ 35");
    expect(formatUsd(3500, "es-ES").replace(/\s/g, " ")).toBe("35 US$");
    // cents are rounded away, not shown
    expect(formatUsd(3549, "en-US")).toBe("$35");
  });
});

describe("parseMilestones", () => {
  it("keeps well-formed cities and tidies the rest", () => {
    const parsed = parseMilestones([
      {
        id: "1",
        slug: "sao-paulo",
        name: " São Paulo ",
        raisedCents: 3500,
        goalCents: 10000,
        donations: 4,
        status: "PROPOSED",
        worldId: null,
      },
      {
        id: "2",
        slug: "nyc",
        name: "New York",
        raisedCents: 10000,
        goalCents: 10000,
        donations: 9,
        status: "BUILT",
        worldId: "tinynyc",
      },
      {
        id: "3",
        name: "Lisboa",
        raisedCents: "x",
        goalCents: null,
        status: "WHATEVER",
        worldId: "../evil",
      },
      { id: "4", name: "  " },
      null,
      "nope",
    ]);
    expect(parsed.map((c) => c.name)).toEqual(["São Paulo", "New York", "Lisboa"]);
    expect(parsed[1]).toMatchObject({ status: "BUILT", worldId: "tinynyc" });
    expect(parsed[2]).toMatchObject({
      raisedCents: 0,
      goalCents: 0,
      status: "PROPOSED",
      worldId: null,
      slug: "",
    });
  });

  it("answers an empty list for anything that is not one", () => {
    expect(parseMilestones(null)).toEqual([]);
    expect(parseMilestones({ cityMilestones: [] })).toEqual([]);
  });
});

describe("listCities", () => {
  const open = Array.from({ length: 8 }, (_, i) =>
    city({ name: `City ${i}`, raisedCents: 8000 - i * 1000 }),
  );
  const built = city({ name: "New York", status: "BUILT", worldId: "tinynyc", raisedCents: 10000 });

  it("shows the first few cities that can still be funded", () => {
    const { rows, more } = listCities([built, ...open], false);
    expect(rows).toHaveLength(CITY_LIMIT);
    expect(rows.map((c) => c.name)).toEqual(open.slice(0, CITY_LIMIT).map((c) => c.name));
    expect(more).toBe(true);
  });

  it("shows them all when expanded, the built ones last", () => {
    const { rows } = listCities([built, ...open], true);
    expect(rows).toHaveLength(9);
    expect(rows[8].name).toBe("New York");
  });

  it("offers nothing more when everything already shows", () => {
    expect(listCities(open.slice(0, 3), false)).toEqual({ rows: open.slice(0, 3), more: false });
    expect(listCities([], false)).toEqual({ rows: [], more: false });
    // a built city is something more to see
    expect(listCities([built], false)).toEqual({ rows: [], more: true });
  });
});

describe("the donor's choice", () => {
  it("names a city from the list as it is", () => {
    expect(chosenCity({ kind: "city", name: "São Paulo" })).toBe("São Paulo");
  });

  it("tidies a typed city and cuts it at sixty characters", () => {
    expect(chosenCity({ kind: "other", text: "  Belo \n  Horizonte  " })).toBe("Belo Horizonte");
    const long = chosenCity({ kind: "other", text: "x".repeat(59) + " yz" });
    expect(long).toBe("x".repeat(59));
    expect(long!.length).toBeLessThanOrEqual(CITY_MAX);
  });

  it("is no city for nothing typed, or none chosen", () => {
    expect(chosenCity({ kind: "other", text: "   " })).toBeNull();
    expect(chosenCity({ kind: "none" })).toBeNull();
  });

  it("becomes the checkout's input", () => {
    expect(
      checkoutInput(
        { kind: "city", name: "Lisboa" },
        "tinyrao",
        "pt-BR",
        "https://example.com/tinyrao/",
      ),
    ).toEqual({
      city: "Lisboa",
      world: "tinyrao",
      locale: "pt-BR",
      returnUrl: "https://example.com/tinyrao/",
    });
    expect(
      checkoutInput({ kind: "none" }, "home", "en-US", "https://example.com/").city,
    ).toBeNull();
  });

  it("returns to the page without its query or hash", () => {
    expect(returnUrlOf({ origin: "https://example.com", pathname: "/tinynyc/" })).toBe(
      "https://example.com/tinynyc/",
    );
  });

  it("only follows a checkout address that is a web address", () => {
    expect(isCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_1")).toBe(true);
    expect(isCheckoutUrl("http://localhost:4000/pay")).toBe(true);
    for (const bad of ["javascript:alert(1)", "/relative", "", null, undefined, 7])
      expect(isCheckoutUrl(bad)).toBe(false);
  });
});

describe("donateMode", () => {
  const base = { api: true, link: true, list: "ready" as const, checkoutFailed: false };

  it("takes no donations when the build names neither an API nor a link", () => {
    expect(donateMode({ ...base, api: false, link: false })).toBe("none");
  });

  it("uses the payment link when there is no API", () => {
    expect(donateMode({ ...base, api: false, list: "idle" })).toBe("link");
  });

  it("uses the API while it works, loading included", () => {
    expect(donateMode(base)).toBe("api");
    expect(donateMode({ ...base, list: "loading" })).toBe("api");
  });

  it("falls back to the link when the list or the checkout fails", () => {
    expect(donateMode({ ...base, list: "failed" })).toBe("link");
    expect(donateMode({ ...base, checkoutFailed: true })).toBe("link");
  });

  it("stays with the API when there is no link to fall back on", () => {
    expect(donateMode({ ...base, link: false, list: "failed" })).toBe("api");
    expect(donateMode({ ...base, link: false, checkoutFailed: true })).toBe("api");
  });
});

describe("withTimeout", () => {
  it("passes an answer that comes in time, and a failure too", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
    await expect(withTimeout(Promise.reject(new Error("down")), 50)).rejects.toThrow("down");
  });

  it("gives up on one that does not", async () => {
    vi.useFakeTimers();
    const waiting = withTimeout(new Promise(() => {}), 5000);
    const outcome = expect(waiting).rejects.toThrow(/5000 ms/);
    await vi.advanceTimersByTimeAsync(5000);
    await outcome;
    vi.useRealTimers();
  });
});

describe("readDonated", () => {
  it("knows a donor who paid from one who gave up", () => {
    expect(readDonated("?donated=1")).toEqual({ donated: true, search: "" });
    expect(readDonated("?donated=0")).toEqual({ donated: false, search: "" });
  });

  it("leaves the rest of the query alone", () => {
    expect(readDonated("?a=1&donated=1&b=2")).toEqual({ donated: true, search: "?a=1&b=2" });
  });

  it("says nothing when the page was not arrived at from a checkout", () => {
    expect(readDonated("")).toEqual({ donated: null, search: "" });
    expect(readDonated("?a=1")).toEqual({ donated: null, search: "?a=1" });
  });
});
