import { afterEach, describe, expect, it, vi } from "vitest";
import { dataUrl, loadSights, loadSightTexts, parseFlights, resolveDataBase } from "../data";
import { parseManifest } from "../manifest";

describe("loading the sights", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const answer = (status: number, body: unknown) =>
    vi.fn(async (url: string) => {
      void url;
      return new Response(JSON.stringify(body), { status });
    });

  it("reads a data set without sights as none", async () => {
    vi.stubGlobal("fetch", answer(404, {}));
    await expect(loadSights("b1")).resolves.toEqual([]);
    await expect(loadSightTexts("b1", "pt-BR")).resolves.toEqual({});
  });

  it("asks for the language's own file, with the build id", async () => {
    const fetchMock = answer(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await loadSightTexts("b7", "es-ES");
    expect(fetchMock.mock.calls[0][0]).toBe("/data/tinynyc/sights.es-ES.json?v=b7");
  });
});

describe("resolveDataBase", () => {
  it("defaults to the world's folder under the base path", () => {
    expect(resolveDataBase({ world: "tinynyc" })).toBe("/data/tinynyc");
    expect(resolveDataBase({ world: "tinyrao", basePath: "/tinyrao/" })).toBe(
      "/tinyrao/data/tinyrao",
    );
    expect(resolveDataBase({ world: "tinyrao", dataBase: "  " })).toBe("/data/tinyrao");
  });

  it("lets NEXT_PUBLIC_DATA_BASE put the data anywhere", () => {
    expect(
      resolveDataBase({ world: "tinyrao", basePath: "/tinyrao", dataBase: "/tinyrao/data/" }),
    ).toBe("/tinyrao/data");
    expect(resolveDataBase({ world: "tinyrao", dataBase: "https://cdn.example.com/rao" })).toBe(
      "https://cdn.example.com/rao",
    );
  });
});

describe("dataUrl", () => {
  it("sits in the data folder and carries the build id", () => {
    expect(dataUrl("tiles/2/3_4.webp", "b17", "/tinynyc/data")).toBe(
      "/tinynyc/data/tiles/2/3_4.webp?v=b17",
    );
    expect(dataUrl("/places.json", "a b", "/data/tinynyc")).toBe(
      "/data/tinynyc/places.json?v=a%20b",
    );
  });

  it("uses the active world's folder by default", () => {
    expect(dataUrl("manifest.json")).toBe("/data/tinynyc/manifest.json");
  });
});

describe("parseFlights", () => {
  const path = [-47.8, -21.1, 300, -47.77, -21.13, 0];

  it("treats a file without flights as having none", () => {
    expect(parseFlights(undefined)).toEqual([]);
    expect(parseFlights("nope")).toEqual([]);
  });

  it("keeps what can be flown and drops the rest", () => {
    const flights = parseFlights([
      { kind: "plane", path, loop: false, speed: 80, pause: 12 },
      { kind: "helicopter", path, loop: true },
      { kind: "zeppelin", path, loop: true },
      { kind: "plane", path: [1, 2, 3], loop: false },
      { kind: "plane", path: [1, 2, 3, 4, 5], loop: false },
      { kind: "plane", path: [1, 2, 3, 4, "5", 6], loop: false },
      null,
    ]);
    expect(flights).toEqual([
      { kind: "plane", path, loop: false, speed: 80, pause: 12 },
      { kind: "helicopter", path, loop: true, speed: undefined, pause: undefined },
    ]);
  });

  it("ignores a speed or pause that makes no sense", () => {
    const [flight] = parseFlights([{ kind: "plane", path, loop: "yes", speed: -3, pause: -1 }]);
    expect(flight).toEqual({
      kind: "plane",
      path,
      loop: false,
      speed: undefined,
      pause: undefined,
    });
  });
});

const valid = {
  name: "tinynyc",
  build: "t1",
  tileSize: 512,
  origin: { x: 0, y: 0 },
  levels: [
    { z: 1, cols: 1, rows: 1, tiles: "AQ==" },
    { z: 0, cols: 2, rows: 2, tiles: "Dw==" },
  ],
  bounds: { minX: 0, minY: 0, maxX: 1024, maxY: 1024 },
  start: { lon: -73.98, lat: 40.75, scale: 1 },
  maxScale: 3,
  northDeg: 30,
  geo: { lon0: -73.98, lat0: 40.75, betaDeg: 28.9, k: 2, kz: 2.45 },
  overview: { src: "overview.webp", width: 256, height: 256 },
  attribution: ["© OpenStreetMap contributors"],
};

describe("parseManifest", () => {
  it("accepts a manifest and sorts its levels finest first", () => {
    const m = parseManifest(valid);
    expect(m.levels.map((l) => l.z)).toEqual([0, 1]);
    expect(m.attribution).toEqual(["© OpenStreetMap contributors"]);
  });

  it("names what is wrong with a broken one", () => {
    expect(() => parseManifest(null)).toThrow(/not an object/);
    expect(() => parseManifest({ ...valid, tileSize: 0 })).toThrow(/tileSize/);
    expect(() => parseManifest({ ...valid, levels: [] })).toThrow(/levels/);
    expect(() =>
      parseManifest({ ...valid, bounds: { minX: 5, minY: 0, maxX: 5, maxY: 9 } }),
    ).toThrow(/bounds/);
    expect(() => parseManifest({ ...valid, geo: { ...valid.geo, k: 0 } })).toThrow(/geo/);
    expect(() => parseManifest({ ...valid, start: {} })).toThrow(/start/);
  });

  it("versions the indexes on their own when it says so, else with the tiles", () => {
    expect(parseManifest({ ...valid, build: "t1" }).indexes).toBe("t1");
    expect(parseManifest({ ...valid, build: "t1", indexes: "i2" }).indexes).toBe("i2");
    expect(parseManifest({ ...valid, build: "t1", indexes: "" }).indexes).toBe("t1");
    expect(parseManifest({ ...valid, build: "t1", indexes: 7 }).indexes).toBe("t1");
  });
});
