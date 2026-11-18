import { describe, expect, it } from "vitest";
import { CITIES } from "./cities/index.js";
import { dataDirs, pickView } from "./config.js";

const real = { id: "tinylas" };
const generated = { id: "tinywinterfell", view: "grid" as const, synthetic: () => {} };

it("generates Street Walk data in the standard build for every real city", () => {
  const disabled = Object.values(CITIES)
    .filter((city) => !city.synthetic && city.walk !== true)
    .map((city) => city.id);
  expect(disabled).toEqual([]);
});

it("generates the landmark and quiz indexes in the standard build for every real city", () => {
  const disabled = Object.values(CITIES).filter((city) => !city.synthetic && !city.sights);
  expect(disabled.map((city) => city.id)).toEqual([]);
});

describe("pickView", () => {
  it("draws a city its own way unless asked otherwise", () => {
    expect(pickView([], {}, real)).toBe("north");
    expect(pickView([], {}, { ...real, view: "grid" })).toBe("grid");
    expect(pickView([], {}, generated)).toBe("grid");
  });

  it("takes --view, --view= or TINY_VIEW, the flag first", () => {
    expect(pickView(["node", "cli", "--view", "grid", "all"], {}, real)).toBe("grid");
    expect(pickView(["--view=grid"], {}, real)).toBe("grid");
    expect(pickView([], { TINY_VIEW: "grid" }, real)).toBe("grid");
    expect(pickView(["--view", "north"], { TINY_VIEW: "grid" }, real)).toBe("north");
  });

  it("refuses a view it does not know, and any other view of a generated place", () => {
    expect(() => pickView(["--view", "south"], {}, real)).toThrow(/south/);
    expect(() => pickView(["--view", "north"], {}, generated)).toThrow(/tinywinterfell/);
    expect(pickView(["--view", "grid"], {}, generated)).toBe("grid");
  });
});

describe("dataDirs", () => {
  it("keeps the city's own view where it always was", () => {
    expect(dataDirs("/p", "/out", real, "north")).toEqual({
      raw: "/p/data/tinylas/raw",
      scene: "/p/data/tinylas/scene",
      out: "/out/tinylas",
    });
  });

  it("puts the other view beside it: its own scene, and a folder inside the city's data", () => {
    expect(dataDirs("/p", "/out", real, "grid")).toEqual({
      raw: "/p/data/tinylas/raw",
      scene: "/p/data/tinylas/scene-grid",
      out: "/out/tinylas/grid",
    });
  });
});
