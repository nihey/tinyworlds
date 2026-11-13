import { describe, expect, it } from "vitest";
import type { CityMilestone } from "../donate";
import { guessAddress } from "../not-found";

const city = (over: Partial<CityMilestone> & { name: string }): CityMilestone => ({
  id: over.name,
  slug: over.name.toLowerCase().replaceAll(" ", "-"),
  raisedCents: 0,
  goalCents: 3000,
  donations: 0,
  status: "PROPOSED",
  worldId: null,
  waiting: 0,
  ...over,
});

const funding = [
  city({ name: "Paris", raisedCents: 500, donations: 1 }),
  city({ name: "Buenos Aires" }),
  city({ name: "Dallas", status: "BUILT", worldId: "tinydal" }),
];

const kindOf = (path: string, list = funding) => {
  const guess = guessAddress(path, list);
  if (!guess) return null;
  return guess.kind === "world" ? `world ${guess.world.id}` : `city ${guess.name}`;
};

describe("guessAddress", () => {
  it("reads a city that is not built from a world's kind of address", () => {
    expect(kindOf("/tinyparis/")).toBe("city Paris");
    expect(kindOf("/tinyparis")).toBe("city Paris");
    expect(kindOf("/TinyParis/index.html")).toBe("city Paris");
    expect(kindOf("/paris/")).toBe("city Paris");
    expect(kindOf("/tinybuenosaires/")).toBe("city Buenos Aires");
    expect(kindOf("/tinybuenos-aires/")).toBe("city Buenos Aires");
  });

  it("carries the city's standing when people are funding it", () => {
    const guess = guessAddress("/tinyparis/", funding);
    expect(guess?.kind === "city" && guess.milestone?.raisedCents).toBe(500);
  });

  it("knows a city nobody has given to yet from the catalogue, by any spelling", () => {
    expect(kindOf("/tinylondon/")).toBe("city London");
    expect(kindOf("/tinylondres/")).toBe("city London");
    expect(kindOf("/tinys%C3%A3opaulo/")).toBe("city São Paulo");
    expect(kindOf("/tinysaopaulo/", [])).toBe("city São Paulo");
    const guess = guessAddress("/tinylondon/", funding);
    expect(guess?.kind === "city" && guess.milestone).toBeNull();
  });

  it("sends a built city, or a page under a world, to the world", () => {
    expect(kindOf("/tinynyc/old-page/")).toBe("world tinynyc");
    expect(kindOf("/tinynewyork/")).toBe("world tinynyc");
    expect(kindOf("/tinynuevayork/")).toBe("world tinynyc");
    expect(kindOf("/tinydallas/")).toBe("world tinydal");
    expect(kindOf("/tinywinterfell/x")).toBe("world tinywinterfell");
  });

  it("guesses nothing from an address that names no city", () => {
    expect(kindOf("/")).toBeNull();
    expect(kindOf("/tiny/")).toBeNull();
    expect(kindOf("/wp-admin/")).toBeNull();
    expect(kindOf("/tinyxyzzy/")).toBeNull();
    expect(kindOf("/%E0%A4%A/")).toBeNull();
  });
});
