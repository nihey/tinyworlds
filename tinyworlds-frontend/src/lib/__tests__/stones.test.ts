import { describe, expect, it } from "vitest";
import { cityStones, STONES_PER_ROW, WALL_MAX_STONES, wallLooks } from "../stones";

describe("cityStones", () => {
  it("lays a stone per whole dollar, and all of them once the goal is reached", () => {
    expect(cityStones(1000, 3000)).toEqual({ total: 30, laid: 10 });
    expect(cityStones(0, 3000)).toEqual({ total: 30, laid: 0 });
    expect(cityStones(150, 3000)).toEqual({ total: 30, laid: 1 });
    expect(cityStones(2999, 3000)).toEqual({ total: 30, laid: 29 });
    expect(cityStones(3500, 3000)).toEqual({ total: 30, laid: 30 });
  });

  it("counts a last, partial stone in the goal", () => {
    expect(cityStones(2500, 2550)).toEqual({ total: 26, laid: 25 });
    expect(cityStones(2550, 2550)).toEqual({ total: 26, laid: 26 });
  });

  it("has no stones for a goal that is none", () => {
    expect(cityStones(500, 0)).toEqual({ total: 0, laid: 0 });
    expect(cityStones(500, -100)).toEqual({ total: 0, laid: 0 });
  });

  it("never lays a stone that is not paid for", () => {
    expect(cityStones(-500, 3000)).toEqual({ total: 30, laid: 0 });
  });
});

describe("wallLooks", () => {
  it("tells the donor's stones from the others', among the laid ones only", () => {
    const stones = { total: 5, laid: 3 };
    expect(wallLooks(stones)).toEqual(["laid", "laid", "laid", "empty", "empty"]);
    expect(wallLooks(stones, [3, 1, 5, 9])).toEqual(["mine", "laid", "mine", "empty", "empty"]);
  });

  it("draws nothing for a city with no stones", () => {
    expect(wallLooks({ total: 0, laid: 0 }, [1])).toEqual([]);
  });
});

describe("the wall's measures", () => {
  it("sets fifteen stones to a row, and gives way to a plain bar above sixty", () => {
    expect(STONES_PER_ROW).toBe(15);
    expect(WALL_MAX_STONES).toBe(60);
  });
});
