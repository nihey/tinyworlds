import { describe, expect, it } from "vitest";
import { findWorlds } from "../other-worlds";

const ids = (query: string, here: string) => findWorlds(query, here).map((hit) => hit.world.id);

describe("findWorlds", () => {
  it("offers the detailed map of a place the continent only shows", () => {
    expect(ids("Winterfell", "tinywesteros")).toEqual(["tinywinterfell"]);
    expect(ids("King's Landing", "tinywesteros")).toEqual(["tinykingslanding"]);
  });

  it("goes the other way too: the map a place belongs to", () => {
    expect(ids("King's Landing", "tinywinterfell")).toEqual(["tinykingslanding"]);
    expect(ids("westeros", "tinywinterfell")).toEqual(["tinywesteros"]);
  });

  it("never offers the map it is on", () => {
    expect(ids("Winterfell", "tinywinterfell")).toEqual([]);
  });

  it("knows a map by any of its names, typed loosely", () => {
    expect(ids("Invernalia", "tinynyc")).toEqual(["tinywinterfell"]);
    expect(ids("porto real", "tinynyc")).toEqual(["tinykingslanding"]);
    expect(ids("kingslanding", "tinynyc")).toEqual(["tinykingslanding"]);
    expect(ids("nueva york", "tinyorl")).toEqual(["tinynyc"]);
    expect(ids("dall", "tinynyc")).toEqual(["tinydal"]);
    expect(ids("colorado", "tinynyc")).toEqual(["tinycos"]);
  });

  it("rates a whole name above a start", () => {
    const [hit] = findWorlds("dallas", "tinynyc");
    expect(hit.tier).toBe(6);
    expect(findWorlds("dal", "tinynyc")[0].tier).toBe(5);
    expect(findWorlds("springs colorado", "tinynyc")[0].tier).toBe(4);
  });

  it("needs three letters, and a name that answers every word", () => {
    expect(ids("la", "tinynyc")).toEqual([]);
    expect(ids("orlando magic", "tinynyc")).toEqual([]);
    expect(ids("central park", "tinyorl")).toEqual([]);
  });
});
