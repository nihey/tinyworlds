import { describe, expect, it } from "vitest";
import {
  cityAsked,
  hallCities,
  hallTotals,
  hasPeople,
  parseCityHall,
  parseHall,
  type HallData,
} from "../hall";
import { buildEndpoint } from "../hall-build";
import { hallCityUrl } from "../../site";

const API = "https://example.com";
const lisbon = { slug: "lisbon", name: "Lisbon", worldId: null };
const porto = { slug: "porto", name: "Porto", worldId: "tinyopo" };
const milestone = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: slug,
  slug,
  name,
  raisedCents: 0,
  goalCents: 3000,
  donations: 0,
  status: "PROPOSED",
  worldId: null,
  ...extra,
});

describe("parseHall", () => {
  it("reads the wall and the cities of one answer", () => {
    const hall = parseHall(
      {
        data: {
          benefactorWall: [{ name: "Ana", amountCents: 1200, cities: [lisbon], links: [] }],
          cityMilestones: [milestone("lisbon", "Lisbon", { raisedCents: 1200 })],
        },
      },
      API,
    );
    expect(hall.wall).toEqual([{ name: "Ana", amountCents: 1200, cities: [lisbon], links: [] }]);
    expect(hall.cities[0]).toMatchObject({ slug: "lisbon", raisedCents: 1200 });
  });

  it("throws without a wall, and goes without the cities when they are missing", () => {
    expect(() => parseHall({ data: { cityMilestones: [] } }, API)).toThrow();
    expect(parseHall({ data: { benefactorWall: [] } }, API)).toEqual({ wall: [], cities: [] });
  });
});

describe("parseCityHall", () => {
  const city = {
    slug: "lisbon",
    name: "Lisbon",
    status: "PROPOSED",
    worldId: null,
    goalCents: 3000,
    raisedCents: 500,
    stones: [1, null],
    founders: [
      {
        number: 1,
        name: "Ana",
        amountCents: 500,
        stones: 5,
        firstStone: true,
        keystone: false,
        links: [
          {
            url: "https://shop.example.com/",
            title: "A tiny shop",
            description: null,
            icon: "/api/link-images/a",
            image: null,
          },
        ],
      },
    ],
    benefactors: [],
  };

  it("reads a city, its links' pictures at the API's address", () => {
    const hall = parseCityHall({ data: { cityBenefactors: city } }, API);
    expect(hall?.founders[0].links[0]).toMatchObject({
      url: "https://shop.example.com/",
      icon: "https://example.com/api/link-images/a",
    });
  });

  it("keeps how many people gave to the city, when the API says", () => {
    expect(
      parseCityHall({ data: { cityBenefactors: { ...city, benefactorCount: 1 } } }, API)
        ?.benefactorCount,
    ).toBe(1);
    expect(parseCityHall({ data: { cityBenefactors: city } }, API)).not.toHaveProperty(
      "benefactorCount",
    );
  });

  it("says null for a city the API does not know, and throws on anything else", () => {
    expect(parseCityHall({ data: { cityBenefactors: null } }, API)).toBeNull();
    expect(() => parseCityHall({ data: {} }, API)).toThrow();
    expect(() => parseCityHall({ errors: [] }, API)).toThrow();
    expect(() => parseCityHall({ data: { cityBenefactors: { slug: 1 } } }, API)).toThrow();
  });

  it("knows a hall with nobody in it", () => {
    expect(hasPeople({ founders: [], benefactors: [] })).toBe(false);
    expect(hasPeople(parseCityHall({ data: { cityBenefactors: city } }, API)!)).toBe(true);
  });
});

describe("hallCities", () => {
  const data: HallData = {
    wall: [
      { name: "Ana", amountCents: 4900, cities: [lisbon, porto], links: [] },
      { name: null, amountCents: 2500, cities: [porto], links: [] },
      { name: "Bo", amountCents: 600, cities: [lisbon], links: [] },
      { name: "Cy", amountCents: 500, cities: [lisbon], links: [] },
      { name: "Dee", amountCents: 400, cities: [lisbon], links: [] },
    ],
    cities: [
      milestone("lisbon", "Lisbon", { raisedCents: 5100 }),
      milestone("porto", "Porto", {
        raisedCents: 3200,
        status: "BUILT",
        worldId: "tinyopo",
        benefactorCount: 2,
      }),
      milestone("faro", "Faro"),
    ] as HallData["cities"],
  };

  it("lists the cities someone gave to, with who is in each hall", () => {
    expect(hallCities(data)).toEqual([
      {
        slug: "lisbon",
        name: "Lisbon",
        worldId: null,
        status: "PROPOSED",
        raisedCents: 5100,
        goalCents: 3000,
        people: 4,
        // the first three who are named there, as the wall has them
        names: ["Ana", "Bo", "Cy"],
        broughtBy: null,
      },
      {
        slug: "porto",
        name: "Porto",
        worldId: "tinyopo",
        status: "BUILT",
        raisedCents: 3200,
        goalCents: 3000,
        people: 2,
        names: ["Ana"],
        // built because it met its goal: its benefactors brought it
        broughtBy: { people: 2, cents: 3200 },
      },
    ]);
  });

  it("counts a city's people as the API does, when it says", () => {
    const cities = data.cities.map((city) =>
      city.slug === "lisbon" ? { ...city, benefactorCount: 3 } : city,
    );
    // the wall has four entries for Lisbon; the API knows one of them gave twice, unnamed
    expect(hallCities({ ...data, cities })[0]).toMatchObject({ slug: "lisbon", people: 3 });
  });

  it("still lists a city the list of cities does not have", () => {
    expect(hallCities({ wall: data.wall, cities: [] })[0]).toMatchObject({
      status: null,
      raisedCents: null,
      people: expect.any(Number) as number,
    });
  });

  it("is empty before anyone has given", () => {
    expect(hallCities({ wall: [], cities: data.cities })).toEqual([]);
  });
});

describe("hallTotals", () => {
  const data: HallData = {
    wall: [
      { name: "Ana", amountCents: 4900, cities: [lisbon, porto], links: [] },
      { name: null, amountCents: 2500, cities: [porto], links: [] },
    ],
    cities: [
      milestone("lisbon", "Lisbon", { raisedCents: 3600 }),
      milestone("porto", "Porto", { raisedCents: 3800, status: "BUILT", worldId: "tinyopo" }),
      // built by hand, before anyone gave: not one of theirs
      milestone("new-york", "New York", { status: "BUILT", worldId: "tinynyc" }),
    ] as HallData["cities"],
  };

  it("is everything given, everyone on the wall, and the cities they built", () => {
    expect(hallTotals(data)).toEqual({ cents: 7400, people: 2, built: 1 });
  });

  it("is nothing before anyone has given", () => {
    expect(hallTotals({ wall: [], cities: [] })).toEqual({ cents: 0, people: 0, built: 0 });
  });
});

describe("cityAsked", () => {
  it("is the city an address asks for, if any", () => {
    expect(cityAsked("?city=sao-paulo")).toBe("sao-paulo");
    expect(cityAsked("?donated=1&city=%E6%9D%B1%E4%BA%AC")).toBe("東京");
    expect(cityAsked("")).toBeNull();
    expect(cityAsked("?city=")).toBeNull();
    expect(cityAsked("?city=%20")).toBeNull();
  });
});

describe("hallCityUrl", () => {
  it("is a page of its own for a plain slug, and a question to the hall for any other", () => {
    expect(hallCityUrl("sao-paulo", "/hall-of-fame/")).toBe("/hall-of-fame/sao-paulo/");
    expect(hallCityUrl("東京", "/hall-of-fame/")).toBe("/hall-of-fame/?city=%E6%9D%B1%E4%BA%AC");
    expect(hallCityUrl("a/b", "/hall-of-fame/")).toBe("/hall-of-fame/?city=a%2Fb");
  });
});

describe("buildEndpoint", () => {
  it("is the API's own address, or its path on the site", () => {
    expect(buildEndpoint("https://api.example.com/api/graphql", "")).toBe(
      "https://api.example.com/api/graphql",
    );
    expect(buildEndpoint("/api/graphql", "https://example.com")).toBe(
      "https://example.com/api/graphql",
    );
    expect(buildEndpoint(" /api/graphql ", "https://example.com/")).toBe(
      "https://example.com/api/graphql",
    );
  });

  it("is nothing without an API, or with a path and no site to hang it on", () => {
    expect(buildEndpoint("", "https://example.com")).toBeNull();
    expect(buildEndpoint(undefined, undefined)).toBeNull();
    expect(buildEndpoint("/api/graphql", "")).toBeNull();
    expect(buildEndpoint("/api/graphql", undefined)).toBeNull();
  });
});
