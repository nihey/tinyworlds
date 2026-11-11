import { describe, expect, it } from "vitest";
import {
  NAME_MAX,
  STONE_CENTS,
  cleanName,
  collapseFounders,
  earnedBadges,
  earnedWhere,
  givingSummary,
  namedSomewhere,
  parseGiving,
  moreLine,
  parseCityBenefactors,
  stoneLooks,
  stonePreview,
  stoneRanges,
  type FounderRow,
  type MyCity,
} from "../benefactors";

const row = (number: number, extra: Partial<FounderRow> = {}): FounderRow => ({
  number,
  name: `F${number}`,
  amountCents: 1000,
  stones: 10,
  firstStone: number === 1,
  keystone: false,
  links: [],
  ...extra,
});

describe("constants", () => {
  it("one stone is a dollar and names are 40 long", () => {
    expect(STONE_CENTS).toBe(100);
    expect(NAME_MAX).toBe(40);
  });
});

describe("stonePreview", () => {
  it("previews the stones a gift would lay", () => {
    expect(stonePreview(6200, 10000, 2000)).toEqual({
      from: 63,
      to: 82,
      firstStone: false,
      keystone: false,
    });
  });
  it("marks the keystone", () => {
    expect(stonePreview(8000, 10000, 5000)).toEqual({
      from: 81,
      to: 100,
      firstStone: false,
      keystone: true,
    });
  });
  it("marks the first stone", () => {
    expect(stonePreview(0, 10000, 100)).toEqual({
      from: 1,
      to: 1,
      firstStone: true,
      keystone: false,
    });
  });
  it("gives the final partial stone to the gift that reaches the goal", () => {
    expect(stonePreview(0, 10050, 10050)).toEqual({
      from: 1,
      to: 101,
      firstStone: true,
      keystone: true,
    });
    expect(stonePreview(10010, 10050, 40)).toEqual({
      from: 101,
      to: 101,
      firstStone: false,
      keystone: true,
    });
    expect(stonePreview(0, 10050, 10000)).toEqual({
      from: 1,
      to: 100,
      firstStone: true,
      keystone: false,
    });
  });
  it("is null when the goal is reached or the gift is under a stone", () => {
    expect(stonePreview(10000, 10000, 500)).toBeNull();
    expect(stonePreview(150, 10000, 40)).toBeNull();
  });
});

describe("stoneRanges", () => {
  it("joins runs with an en dash", () => {
    expect(stoneRanges([1, 2, 3, 7])).toEqual(["1–3", "7"]);
    expect(stoneRanges(Array.from({ length: 20 }, (_, i) => 63 + i))).toEqual(["63–82"]);
    expect(stoneRanges([])).toEqual([]);
  });
});

describe("collapseFounders", () => {
  it("keeps everything when it fits", () => {
    const rows = [row(1), row(2), row(3)];
    expect(collapseFounders(rows)).toEqual({ shown: rows, hidden: null });
  });
  it("hides the middle, keeping first stone and keystone, summary counted in the limit", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row(i + 1, {
        keystone: i === 8,
        name: i === 5 ? null : `F${i + 1}`,
        amountCents: 100 * (i + 1),
      }),
    );
    const out = collapseFounders(rows, 6);
    expect(out.shown.map((r) => r.number)).toEqual([1, 2, 3, 4, 9]);
    expect(out.hidden).toEqual({
      count: 4,
      anonymous: 1,
      amountCents: 500 + 600 + 700 + 800,
      after: 4,
    });
  });
});

describe("stoneLooks", () => {
  it("alternates named runs, marks anonymous and empty", () => {
    const founders = [row(1), row(2, { name: null }), row(3)];
    expect(stoneLooks([1, 1, 2, 3, null], founders)).toEqual([
      "gold",
      "gold",
      "anon",
      "gold-alt",
      "empty",
    ]);
  });
});

describe("cleanName", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanName("  Ana   from\tRecife ")).toBe("Ana from Recife");
  });
  it("keeps at most NAME_MAX characters", () => {
    expect(cleanName("é".repeat(41))).toBe("é".repeat(40));
  });
  it("cuts by code points", () => {
    expect(cleanName("a" + "𝒜".repeat(40))).toBe("a" + "𝒜".repeat(39));
  });
  it("is null when only invisible characters remain", () => {
    expect(cleanName("​‍ ")).toBeNull();
  });
  it("drops control characters", () => {
    expect(cleanName("Ana\u0000\u001f")).toBe("Ana");
  });
  it("is null without a letter or digit", () => {
    expect(cleanName("👍🏽")).toBeNull();
  });
  it("leaves underscores alone", () => {
    expect(cleanName("the_cartographer")).toBe("the_cartographer");
  });
});

describe("parseCityBenefactors", () => {
  const valid = {
    slug: "rio",
    name: "Rio",
    status: "PROPOSED",
    worldId: null,
    goalCents: 10000,
    raisedCents: 300,
    stones: [1, 1, 2, null],
    founders: [
      {
        number: 1,
        name: "Ana",
        amountCents: 200,
        stones: 2,
        firstStone: true,
        keystone: false,
        links: [],
      },
    ],
    benefactors: [{ rank: 1, name: null, amountCents: 200, links: [] }],
  };
  const shop = {
    url: "https://shop.example.com/",
    title: "A tiny shop",
    description: null,
    icon: "/api/link-images/a",
    image: "/api/link-images/b",
  };
  it("keeps a valid payload", () => {
    expect(parseCityBenefactors(valid)).toEqual(valid);
  });
  it("reads an answer without links (an older API) as rows with none", () => {
    const bare = <T extends { links: unknown }>(row: T): Omit<T, "links"> => {
      const copy: Partial<T> = { ...row };
      delete copy.links;
      return copy as Omit<T, "links">;
    };
    const older = {
      ...valid,
      founders: valid.founders.map(bare),
      benefactors: valid.benefactors.map(bare),
    };
    expect(parseCityBenefactors(older)).toEqual(valid);
  });
  it("reads a named row's links, their pictures at the API's address", () => {
    const city = parseCityBenefactors(
      { ...valid, founders: [{ ...valid.founders[0], links: [shop] }] },
      "https://example.com",
    );
    expect(city?.founders[0].links).toEqual([
      {
        ...shop,
        icon: "https://example.com/api/link-images/a",
        image: "https://example.com/api/link-images/b",
      },
    ]);
  });
  it("shows no link on an unnamed row, whatever the answer says", () => {
    const city = parseCityBenefactors(
      { ...valid, benefactors: [{ ...valid.benefactors[0], links: [shop] }] },
      "https://example.com",
    );
    expect(city?.benefactors[0].links).toEqual([]);
  });
  it("drops a payload without stones", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.stones;
    expect(parseCityBenefactors(rest)).toBeNull();
  });
  it("drops junk", () => {
    expect(parseCityBenefactors(null)).toBeNull();
    expect(parseCityBenefactors({ ...valid, status: "NOPE" })).toBeNull();
    expect(parseCityBenefactors({ ...valid, founders: [{ number: "x" }] })).toBeNull();
  });
});

const myCity = (extra: Record<string, unknown> = {}) => ({
  slug: "lisbon",
  name: "Lisbon",
  status: "FUNDED",
  worldId: null,
  goalCents: 10000,
  raisedCents: 4200,
  givenCents: 4200,
  founderNumber: 1,
  stones: [1, 2, 3],
  firstStone: true,
  keystone: false,
  listed: true,
  ...extra,
});

describe("parseGiving", () => {
  it("reads the donor's giving", () => {
    const giving = parseGiving({
      displayName: "Ana from Recife",
      cities: [
        myCity(),
        myCity({ slug: "valencia", founderNumber: null, stones: [], worldId: "tinyvlc" }),
      ],
      projectCents: 500,
    });
    expect(giving?.displayName).toBe("Ana from Recife");
    expect(giving?.cities).toHaveLength(2);
    expect(giving?.cities[1].worldId).toBe("tinyvlc");
    expect(giving?.projectCents).toBe(500);
    // nothing was said of the links
    expect(giving?.links).toBeNull();
  });
  it("carries the links asked with it, and knows when the donor is named somewhere", () => {
    const links = { links: [], max: 3, givenCents: 700, picturesFromCents: 1000, hidden: false };
    const named = parseGiving(
      { displayName: "Ana", cities: [myCity({ listed: true })], projectCents: 0 },
      links,
    );
    expect(named?.links).toBe(links);
    expect(named && namedSomewhere(named)).toBe(true);
    const unlisted = parseGiving({
      displayName: "Ana",
      cities: [myCity({ listed: false })],
      projectCents: 0,
    });
    expect(unlisted && namedSomewhere(unlisted)).toBe(false);
    const nameless = parseGiving({
      displayName: null,
      cities: [myCity({ listed: true })],
      projectCents: 0,
    });
    expect(nameless && namedSomewhere(nameless)).toBe(false);
  });
  it("accepts no name", () => {
    expect(parseGiving({ displayName: null, cities: [], projectCents: 0 })?.displayName).toBeNull();
  });
  it("rejects a malformed answer", () => {
    expect(parseGiving(null)).toBeNull();
    expect(parseGiving({ displayName: null, cities: "x", projectCents: 0 })).toBeNull();
    expect(parseGiving({ displayName: null, cities: [], projectCents: "0" })).toBeNull();
    expect(
      parseGiving({ displayName: null, cities: [myCity({ status: "NOPE" })], projectCents: 0 }),
    ).toBeNull();
    expect(
      parseGiving({ displayName: null, cities: [myCity({ stones: [1, "a"] })], projectCents: 0 }),
    ).toBeNull();
    expect(
      parseGiving({ displayName: null, cities: [myCity({ listed: "yes" })], projectCents: 0 }),
    ).toBeNull();
  });
});

describe("givingSummary", () => {
  it("adds up cities, stones and gifts", () => {
    const giving = parseGiving({
      displayName: null,
      cities: [
        myCity({ stones: Array.from({ length: 12 }, (_, i) => i + 1), givenCents: 4200 }),
        myCity({ slug: "x", stones: [], givenCents: 1500 }),
      ],
      projectCents: 0,
    });
    expect(givingSummary(giving!)).toEqual({ cities: 2, stones: 12, givenCents: 5700 });
  });
});

describe("moreLine", () => {
  const words = {
    more: { one: "{n} more", other: "{n} more" },
    anonymous: { one: "{n} anonymous", other: "{n} anonymous" },
  };
  it("names the anonymous ones only when there are some", () => {
    expect(moreLine(4, 0, words)).toBe("4 more");
    expect(moreLine(4, 3, words)).toBe("4 more, 3 anonymous");
  });
  it("uses each count's own plural form", () => {
    const pt = {
      more: { one: "e mais {n}", other: "e mais {n}" },
      anonymous: { one: "{n} anônimo", other: "{n} anônimos" },
    };
    expect(moreLine(3, 1, pt)).toBe("e mais 3, 1 anônimo");
    expect(moreLine(5, 2, pt)).toBe("e mais 5, 2 anônimos");
  });
});

const givenCity = (over: Partial<MyCity> & { name: string }): MyCity => ({
  slug: over.name.toLowerCase().replaceAll(" ", "-"),
  status: "PROPOSED",
  worldId: null,
  goalCents: 3000,
  raisedCents: 1000,
  givenCents: 500,
  founderNumber: null,
  stones: [],
  firstStone: false,
  keystone: false,
  listed: false,
  ...over,
});

describe("earnedBadges", () => {
  it("says which badges were earned, and in which cities", () => {
    const cities = [
      givenCity({ name: "Los Angeles", founderNumber: 1, firstStone: true }),
      givenCity({ name: "Philadelphia", founderNumber: 2 }),
      givenCity({ name: "Dallas", founderNumber: null }),
      givenCity({ name: "Lisbon", founderNumber: 7, keystone: true }),
    ];
    expect(earnedBadges(cities)).toEqual({
      founding: ["Los Angeles", "Philadelphia", "Lisbon"],
      firstStone: ["Los Angeles"],
      keystone: ["Lisbon"],
    });
  });

  it("has none for someone who has not given", () => {
    expect(earnedBadges([])).toEqual({ founding: [], firstStone: [], keystone: [] });
  });
});

describe("earnedWhere", () => {
  const words = { one: "{n} city", other: "{n} cities" };

  it("names one or two cities, and counts more", () => {
    expect(earnedWhere(["Dallas"], words)).toBe("Dallas");
    expect(earnedWhere(["Dallas", "Lisbon"], words)).toBe("Dallas, Lisbon");
    expect(earnedWhere(["Dallas", "Lisbon", "Paris"], words)).toBe("3 cities");
  });

  it("says nothing of a badge that was not earned", () => {
    expect(earnedWhere([], words)).toBeNull();
  });
});
