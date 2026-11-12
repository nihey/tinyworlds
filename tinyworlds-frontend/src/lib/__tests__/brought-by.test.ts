import { describe, expect, it } from "vitest";
import { broughtBy, broughtByWorld } from "../brought-by";
import type { CityMilestone } from "../donate";

const city = (extra: Partial<CityMilestone> = {}): CityMilestone => ({
  id: "1",
  slug: "dallas",
  name: "Dallas",
  raisedCents: 3500,
  goalCents: 3000,
  donations: 2,
  benefactorCount: 2,
  status: "BUILT",
  worldId: "tinydal",
  waiting: 0,
  ...extra,
});

describe("broughtBy", () => {
  it("is who brought a city to the map, and what they gave: built, its goal met by gifts", () => {
    expect(broughtBy(city())).toEqual({ people: 2, cents: 3500 });
  });

  it("is nobody for a city built before anyone gave, or with less than its goal", () => {
    expect(broughtBy(city({ raisedCents: 0, donations: 0, benefactorCount: 0 }))).toBeNull();
    expect(broughtBy(city({ raisedCents: 500, donations: 1, benefactorCount: 1 }))).toBeNull();
  });

  it("is nobody yet for a city that is funded and not on the map", () => {
    expect(broughtBy(city({ status: "FUNDED", worldId: null }))).toBeNull();
    expect(broughtBy(city({ status: "BUILDING", worldId: null }))).toBeNull();
  });

  it("counts the gifts when an older API does not say how many people gave", () => {
    expect(broughtBy(city({ benefactorCount: undefined, donations: 3 }))).toEqual({
      people: 3,
      cents: 3500,
    });
  });
});

describe("broughtByWorld", () => {
  it("is, for each world on the map, its city and who brought it", () => {
    const worlds = broughtByWorld([
      city(),
      city({ id: "2", slug: "new-york", name: "New York", worldId: "tinynyc", raisedCents: 0 }),
      city({ id: "3", slug: "lisbon", name: "Lisbon", worldId: null, status: "FUNDED" }),
    ]);
    expect([...worlds]).toEqual([
      ["tinydal", { slug: "dallas", name: "Dallas", people: 2, cents: 3500 }],
    ]);
  });
});
