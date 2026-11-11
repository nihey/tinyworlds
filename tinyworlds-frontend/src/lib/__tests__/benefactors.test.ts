import { describe, expect, it } from "vitest";
import {
  NAME_MAX,
  STONE_CENTS,
  cleanName,
  collapseFounders,
  parseCityBenefactors,
  stoneLooks,
  stonePreview,
  stoneRanges,
  type FounderRow,
} from "../benefactors";

const row = (number: number, extra: Partial<FounderRow> = {}): FounderRow => ({
  number,
  name: `F${number}`,
  amountCents: 1000,
  stones: 10,
  firstStone: number === 1,
  keystone: false,
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
      { number: 1, name: "Ana", amountCents: 200, stones: 2, firstStone: true, keystone: false },
    ],
    benefactors: [{ rank: 1, name: null, amountCents: 200 }],
  };
  it("keeps a valid payload", () => {
    expect(parseCityBenefactors(valid)).toEqual(valid);
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
