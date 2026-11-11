import { describe, expect, it } from "vitest";
import { citiesShown, parseWall, wallRequest, wallSides } from "../wall";

const API = "https://example.com";
const lisbon = { slug: "lisbon", name: "Lisbon", worldId: null };
const porto = { slug: "porto", name: "Porto", worldId: "tinyopo" };
const shop = {
  url: "https://shop.example.com/",
  title: "A tiny shop",
  description: null,
  icon: "/api/link-images/a",
  image: null,
};
const answer = (rows: unknown) => ({ data: { benefactorWall: rows } });

describe("parseWall", () => {
  it("reads named donors with their links and unnamed gifts as they are", () => {
    const wall = parseWall(
      answer([
        { name: null, amountCents: 8800, cities: [lisbon], links: [] },
        { name: "Ana", amountCents: 4900, cities: [lisbon, porto], links: [shop] },
      ]),
      API,
    );
    expect(wall).toEqual([
      { name: null, amountCents: 8800, cities: [lisbon], links: [] },
      {
        name: "Ana",
        amountCents: 4900,
        cities: [lisbon, porto],
        links: [{ ...shop, icon: "https://example.com/api/link-images/a" }],
      },
    ]);
  });

  it("shows no link on an unnamed gift, whatever the answer says", () => {
    const [entry] = parseWall(
      answer([{ name: null, amountCents: 500, cities: [lisbon], links: [shop] }]),
      API,
    );
    expect(entry.links).toEqual([]);
  });

  it("leaves out rows that are not the contract's, and keeps the rest", () => {
    const wall = parseWall(
      answer([
        null,
        { name: "", amountCents: 500, cities: [lisbon] },
        { name: "No sum", amountCents: "500", cities: [lisbon] },
        { name: "Nothing", amountCents: 0, cities: [lisbon] },
        { name: "Nowhere", amountCents: 500, cities: [] },
        { name: "Odd city", amountCents: 500, cities: [{ slug: "", name: "?" }] },
        { name: "Bo", amountCents: 500, cities: [lisbon] },
      ]),
      API,
    );
    expect(wall.map((entry) => entry.name)).toEqual(["Bo"]);
  });

  it("throws on an answer with no wall in it", () => {
    expect(() => parseWall({ errors: [{ message: "no" }] }, API)).toThrow();
    expect(() => parseWall(null, API)).toThrow();
    expect(() => parseWall(answer("x"), API)).toThrow();
  });

  it("asks for what it reads", () => {
    const { query } = wallRequest();
    for (const field of ["name", "amountCents", "cities", "links", "icon", "image"])
      expect(query).toContain(field);
  });
});

describe("wallSides", () => {
  it("deals the wall out left and right in turn", () => {
    expect(wallSides([1, 2, 3, 4, 5])).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(wallSides([1])).toEqual([[1], []]);
    expect(wallSides([])).toEqual([[], []]);
  });
});

describe("citiesShown", () => {
  it("names the first two and counts the rest", () => {
    const more = { slug: "faro", name: "Faro", worldId: null };
    expect(citiesShown([lisbon])).toEqual({ named: [lisbon], more: 0 });
    expect(citiesShown([lisbon, porto])).toEqual({ named: [lisbon, porto], more: 0 });
    expect(citiesShown([lisbon, porto, more])).toEqual({ named: [lisbon, porto], more: 1 });
  });
});
