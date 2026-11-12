import { describe, expect, it } from "vitest";
import { CITY_CATALOGUE, type CatalogueCity } from "../city-catalogue";
import {
  defaultGoal,
  GOAL_FALLBACK_CENTS,
  findMilestone,
  fold,
  pickerOptions,
  previewBar,
  withGoal,
  rankCities,
  leading,
  BUILT_LIMIT,
  RANKING_LIMIT,
  regionNames,
  tidyCity,
} from "../city-picker";
import { BUILT_CITIES } from "@/site";
import { CITY_MAX, type CityMilestone } from "../donate";

const city = (over: Partial<CityMilestone> & { name: string }): CityMilestone => ({
  id: over.name,
  slug: fold(over.name).replaceAll(" ", "-"),
  raisedCents: 0,
  goalCents: 10000,
  donations: 0,
  status: "PROPOSED",
  worldId: null,
  waiting: 0,
  ...over,
});

const CATALOGUE: CatalogueCity[] = [
  { name: "London", cc: "GB", alt: ["Londres"] },
  { name: "Lisbon", cc: "PT", alt: ["Lisboa"] },
  { name: "São Paulo", cc: "BR" },
  { name: "San Francisco", cc: "US" },
  { name: "New York", cc: "US", alt: ["Nova York", "NYC"] },
  { name: "Los Angeles", cc: "US", alt: ["LA"] },
];

const MILESTONES = [
  city({ name: "São Paulo", raisedCents: 8200 }),
  city({ name: "Tokyo", raisedCents: 3500 }),
  city({ name: "New York", status: "BUILT", worldId: "tinynyc" }),
];

describe("fold", () => {
  it("compares names without accents, case or punctuation", () => {
    expect(fold("São  Paulo")).toBe("sao paulo");
    expect(fold("Washington, D.C.")).toBe("washington d c");
    expect(fold("  Kraków ")).toBe("krakow");
    expect(fold("東京")).toBe("東京");
    expect(fold(" ?! ")).toBe("");
  });
});

describe("tidyCity", () => {
  it("is what gets sent: single spaces, sixty characters at most", () => {
    expect(tidyCity("  Belo \n Horizonte ")).toBe("Belo Horizonte");
    expect(tidyCity("x".repeat(80))).toHaveLength(CITY_MAX);
    expect(tidyCity("  ...  ")).toBe("");
  });
});

describe("pickerOptions", () => {
  it("lists the cities being funded in the API's order, and never a built one", () => {
    const { funding } = pickerOptions(MILESTONES, CATALOGUE, "");
    expect(funding.map((c) => c.name)).toEqual(["São Paulo", "Tokyo"]);
  });

  it("offers each city once: the catalogue loses whatever is funded or built", () => {
    const { more } = pickerOptions(MILESTONES, CATALOGUE, "");
    expect(more.map((c) => c.name)).toEqual(["Lisbon", "London", "Los Angeles", "San Francisco"]);
  });

  it("also leaves out this site's own worlds, whatever the API says", () => {
    const { more } = pickerOptions([], CATALOGUE, "", ["New York", "São Paulo"]);
    expect(more.map((c) => c.name)).toEqual(["Lisbon", "London", "Los Angeles", "San Francisco"]);
  });

  it("never offers a city this site already has, going by the worlds registry", () => {
    const offered = pickerOptions([], CITY_CATALOGUE, "", BUILT_CITIES).more.map((c) => c.name);
    for (const built of [
      "New York",
      "Orlando",
      "Valencia",
      "Las Vegas",
      "Los Angeles",
      "Dallas",
      "Pittsburgh",
      "Philadelphia",
    ])
      expect(offered).not.toContain(built);
    expect(offered).toContain("Barcelona");
    // by another spelling it is recognised as built rather than offered as a new city
    expect(pickerOptions([], CITY_CATALOGUE, "valência", BUILT_CITIES).typed).toBeNull();
    expect(pickerOptions([], CITY_CATALOGUE, "valencia", BUILT_CITIES).more).toEqual([]);
    expect(pickerOptions([], CITY_CATALOGUE, "el calafate", BUILT_CITIES).typed).toBeNull();
    expect(pickerOptions([], CITY_CATALOGUE, "las vegas", BUILT_CITIES).more).toEqual([]);
    expect(pickerOptions([], CITY_CATALOGUE, "las vegas", BUILT_CITIES).typed).toBeNull();
    // and so is Los Angeles, under its Spanish name as well
    expect(pickerOptions([], CITY_CATALOGUE, "los angeles", BUILT_CITIES).more).toEqual([]);
    expect(pickerOptions([], CITY_CATALOGUE, "los ángeles", BUILT_CITIES).typed).toBeNull();
    // Dallas came from the catalogue, Cincinnati was typed in by its donors: both are built now
    expect(pickerOptions([], CITY_CATALOGUE, "dallas", BUILT_CITIES).more).toEqual([]);
    expect(pickerOptions([], CITY_CATALOGUE, "dallas", BUILT_CITIES).typed).toBeNull();
    expect(pickerOptions([], CITY_CATALOGUE, "cincinnati", BUILT_CITIES).more).toEqual([]);
    expect(pickerOptions([], CITY_CATALOGUE, "cincinnati", BUILT_CITIES).typed).toBeNull();
    // Pittsburgh and Philadelphia came from the catalogue; Philadelphia under its Portuguese and
    // Spanish names as well
    for (const name of ["pittsburgh", "philadelphia", "filadélfia", "filadelfia"]) {
      expect(pickerOptions([], CITY_CATALOGUE, name, BUILT_CITIES).more, name).toEqual([]);
      expect(pickerOptions([], CITY_CATALOGUE, name, BUILT_CITIES).typed, name).toBeNull();
    }
    // Colorado Springs was typed in by its donor
    for (const name of ["colorado springs", "Colorado Springs"]) {
      expect(pickerOptions([], CITY_CATALOGUE, name, BUILT_CITIES).more, name).toEqual([]);
      expect(pickerOptions([], CITY_CATALOGUE, name, BUILT_CITIES).typed, name).toBeNull();
    }
    // Truckee was typed in by its donor, like Cincinnati: built now, it is not taken as a new city
    expect(pickerOptions([], CITY_CATALOGUE, "truckee", BUILT_CITIES).more).toEqual([]);
    expect(pickerOptions([], CITY_CATALOGUE, "truckee", BUILT_CITIES).typed).toBeNull();
    // the made-up places are worlds too: not to be funded again, under any of their names
    for (const name of [
      "Winterfell",
      "invernalia",
      "King's Landing",
      "kings landing",
      "porto real",
    ]) {
      const options = pickerOptions([], CITY_CATALOGUE, name, BUILT_CITIES);
      expect(options.typed, name).toBeNull();
      expect(options.more, name).toEqual([]);
    }
    for (const fictional of ["Winterfell", "King's Landing"])
      expect(offered).not.toContain(fictional);
  });

  it("finds a city by the start of any word, accents or not", () => {
    expect(pickerOptions(MILESTONES, CATALOGUE, "sao").funding.map((c) => c.name)).toEqual([
      "São Paulo",
    ]);
    expect(pickerOptions(MILESTONES, CATALOGUE, "PAULO").funding.map((c) => c.name)).toEqual([
      "São Paulo",
    ]);
    expect(pickerOptions(MILESTONES, CATALOGUE, "fran").more.map((c) => c.name)).toEqual([
      "San Francisco",
    ]);
    expect(pickerOptions(MILESTONES, CATALOGUE, "s f").more.map((c) => c.name)).toEqual([
      "San Francisco",
    ]);
    expect(pickerOptions(MILESTONES, CATALOGUE, "isbon").more).toEqual([]);
  });

  it("finds a city by the name another language gives it", () => {
    expect(pickerOptions([], CATALOGUE, "londres").more.map((c) => c.name)).toEqual(["London"]);
    expect(pickerOptions([], CATALOGUE, "Lisboa").more.map((c) => c.name)).toEqual(["Lisbon"]);
  });

  it("puts names that start with the search before those that only contain it", () => {
    expect(pickerOptions([], CATALOGUE, "l").more.map((c) => c.name)).toEqual([
      "Lisbon",
      "London",
      "Los Angeles",
    ]);
    expect(pickerOptions([], CATALOGUE, "san").more[0].name).toBe("San Francisco");
  });

  it("finds a city being funded by its other spellings too", () => {
    const funded = [city({ name: "London", raisedCents: 500 }), ...MILESTONES];
    const options = pickerOptions(funded, CATALOGUE, "londres");
    expect(options.funding.map((c) => c.name)).toEqual(["London"]);
    expect(options.more).toEqual([]);
    expect(options.typed).toBeNull();
  });

  it("offers what was typed as a new city only when nothing on the list matches", () => {
    expect(pickerOptions(MILESTONES, CATALOGUE, "  Ouro   Preto ").typed).toBe("Ouro Preto");
    // something matches: choose from the list
    expect(pickerOptions(MILESTONES, CATALOGUE, "Lis").typed).toBeNull();
    for (const known of ["tokyo", "São Paulo", "sao paulo", "London", "londres"])
      expect(pickerOptions(MILESTONES, CATALOGUE, known).typed, known).toBeNull();
    expect(pickerOptions(MILESTONES, CATALOGUE, "").typed).toBeNull();
    expect(pickerOptions(MILESTONES, CATALOGUE, " ?? ").typed).toBeNull();
  });

  it("does not offer a built city under another of its spellings", () => {
    const options = pickerOptions(MILESTONES, CATALOGUE, "nyc");
    expect(options.typed).toBeNull();
    expect(options.built?.name).toBe("New York");
    expect(pickerOptions([], CATALOGUE, "nova york", ["New York"]).typed).toBeNull();
  });

  it("says so when the search names a city that is already built", () => {
    const options = pickerOptions(MILESTONES, CATALOGUE, "new york");
    expect(options.built?.name).toBe("New York");
    expect(options.typed).toBeNull();
    expect(options.funding).toEqual([]);
    expect(options.more).toEqual([]);
    expect(pickerOptions(MILESTONES, CATALOGUE, "new").built).toBeNull();
  });
});

describe("the catalogue", () => {
  it("has a couple of hundred cities, each named once", () => {
    expect(CITY_CATALOGUE.length).toBeGreaterThanOrEqual(190);
    const names = CITY_CATALOGUE.map((c) => fold(c.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every city a name that can be sent and a country code", () => {
    for (const entry of CITY_CATALOGUE) {
      expect(tidyCity(entry.name), entry.name).toBe(entry.name);
      expect(entry.cc, entry.name).toMatch(/^[A-Z]{2}$/);
      for (const alt of entry.alt ?? []) expect(fold(alt), `${entry.name}: ${alt}`).not.toBe("");
    }
  });

  it("never lets another spelling of one city be the name of another", () => {
    const names = new Map(CITY_CATALOGUE.map((c) => [fold(c.name), c.name]));
    for (const entry of CITY_CATALOGUE)
      for (const alt of entry.alt ?? []) {
        const clash = names.get(fold(alt));
        expect(clash === undefined || clash === entry.name, `${entry.name}: ${alt}`).toBe(true);
      }
  });

  it("uses country codes the browser can name", () => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (const entry of CITY_CATALOGUE) {
      const country = names.of(entry.cc);
      expect(country && country !== entry.cc, `${entry.name} (${entry.cc})`).toBe(true);
    }
  });
});

describe("regionNames", () => {
  it("names a country in the visitor's language", () => {
    expect(regionNames("en-US")("GB")).toBe("United Kingdom");
    expect(regionNames("pt-BR")("GB")).toBe("Reino Unido");
    expect(regionNames("es-ES")("US")).toBe("Estados Unidos");
  });
});

describe("findMilestone", () => {
  it("finds the city a name refers to, however it was typed", () => {
    expect(findMilestone(MILESTONES, "sao paulo")?.raisedCents).toBe(8200);
    expect(findMilestone(MILESTONES, "TOKYO")?.name).toBe("Tokyo");
    expect(findMilestone(MILESTONES, "Lisbon")).toBeNull();
    expect(findMilestone(MILESTONES, "  ")).toBeNull();
  });
});

describe("defaultGoal", () => {
  it("is what the other cities have to reach, or thirty dollars", () => {
    expect(GOAL_FALLBACK_CENTS).toBe(3000);
    expect(defaultGoal([])).toBe(3000);
    expect(defaultGoal([city({ name: "A", goalCents: 20000 })])).toBe(20000);
    expect(
      defaultGoal([
        city({ name: "A", goalCents: 10000 }),
        city({ name: "B", goalCents: 10000 }),
        city({ name: "C", goalCents: 50000 }),
        city({ name: "D", goalCents: 0 }),
      ]),
    ).toBe(10000);
  });
});

describe("withGoal", () => {
  it("writes the goal as money in the visitor's language", () => {
    expect(withGoal("about {goal} each", 3000, "en-US")).toBe("about $30 each");
    expect(withGoal("cerca de {goal}", 3000, "pt-BR")).toMatch(/^cerca de US\$\s30$/);
    expect(withGoal("unos {goal}", 3000, "es-ES")).toMatch(/^unos 30\sUS\$$/);
    expect(withGoal("no goal here", 3000, "en-US")).toBe("no goal here");
  });
});

describe("previewBar", () => {
  const at = (raisedCents: number, amount: number, goalCents = 10000) =>
    previewBar({ raisedCents, goalCents }, amount);

  it("adds the donation to what is there", () => {
    expect(at(3500, 1000)).toEqual({
      raised: 0.35,
      added: 0.1,
      totalCents: 4500,
      fills: false,
      overCents: 0,
    });
  });

  it("says when this donation is the one that fills the bar", () => {
    const exact = at(7500, 2500);
    expect(exact).toMatchObject({ raised: 0.75, added: 0.25, fills: true, overCents: 0 });
    expect(at(0, 10000)).toMatchObject({ raised: 0, added: 1, fills: true, overCents: 0 });
  });

  it("never draws past the end, and counts what lands above the goal", () => {
    const over = at(8200, 5000);
    expect(over.raised).toBeCloseTo(0.82);
    expect(over.added).toBeCloseTo(0.18);
    expect(over).toMatchObject({ totalCents: 13200, fills: true, overCents: 3200 });
  });

  it("treats a donation to a city that already made it as all above the goal", () => {
    expect(at(10000, 2500)).toEqual({
      raised: 1,
      added: 0,
      totalCents: 12500,
      fills: false,
      overCents: 2500,
    });
    expect(at(13500, 1000)).toMatchObject({ raised: 1, added: 0, fills: false, overCents: 1000 });
  });

  it("copes with a city that has no goal, and with nonsense amounts", () => {
    expect(at(0, 500, 0)).toMatchObject({ raised: 0, added: 0, fills: false });
    expect(at(3000, -50)).toMatchObject({ raised: 0.3, added: 0, totalCents: 3000 });
  });
});

describe("rankCities", () => {
  const cities = [
    city({ name: "Tokyo", raisedCents: 13500, status: "BUILDING", donations: 9 }),
    city({ name: "Lisbon", raisedCents: 10000, status: "FUNDED", donations: 4 }),
    city({ name: "São Paulo", raisedCents: 8200, donations: 6 }),
    city({ name: "Paris", raisedCents: 0 }),
    city({ name: "Buenos Aires", raisedCents: 3500 }),
    city({ name: "London", raisedCents: 0 }),
    city({ name: "New York", raisedCents: 0, status: "BUILT", worldId: "tinynyc" }),
    city({
      name: "Cincinnati",
      raisedCents: 3000,
      goalCents: 3000,
      status: "BUILT",
      worldId: "tinycvg",
    }),
    city({
      name: "Dallas",
      raisedCents: 3500,
      goalCents: 3000,
      status: "BUILT",
      worldId: "tinydal",
    }),
    city({
      name: "Orlando",
      raisedCents: 2000,
      goalCents: 3000,
      status: "BUILT",
      worldId: "tinyorl",
    }),
  ];

  it("keeps the built cities that were funded in full, the most raised first", () => {
    expect(rankCities(cities).built.map((c) => c.name)).toEqual(["Dallas", "Cincinnati"]);
  });

  it("leads with the funded, then the best funded, and never a built city", () => {
    expect(leading(rankCities(cities), 3).map((c) => c.name)).toEqual([
      "Tokyo",
      "Lisbon",
      "São Paulo",
    ]);
    expect(leading(rankCities(cities), 0)).toEqual([]);
  });

  it("sets apart the cities that reached their goal, the most funded first", () => {
    expect(rankCities(cities).funded.map((c) => c.name)).toEqual(["Tokyo", "Lisbon"]);
  });

  it("ranks the rest by what they have raised, then by name", () => {
    expect(rankCities(cities).ranked.map((c) => c.name)).toEqual([
      "São Paulo",
      "Buenos Aires",
      "London",
      "Paris",
    ]);
  });

  it("keeps built cities out of the funded and the ranked", () => {
    const { funded, ranked } = rankCities(cities);
    const built = ["New York", "Cincinnati", "Dallas", "Orlando"];
    expect([...funded, ...ranked].some((c) => built.includes(c.name))).toBe(false);
  });

  it("knows when nobody has given anything yet", () => {
    expect(rankCities(cities).anyRaised).toBe(true);
    const zero = [city({ name: "Paris" }), city({ name: "London" })];
    expect(rankCities(zero)).toEqual({
      built: [],
      funded: [],
      ranked: [zero[1], zero[0]],
      anyRaised: false,
    });
    expect(rankCities([])).toEqual({ built: [], funded: [], ranked: [], anyRaised: false });
  });

  it("shows eight before asking to show all, and six of the built", () => {
    expect(RANKING_LIMIT).toBe(8);
    expect(BUILT_LIMIT).toBe(6);
  });
});
