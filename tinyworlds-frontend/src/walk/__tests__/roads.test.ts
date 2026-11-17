import { describe, expect, it } from "vitest";
import type { RoadNode, StreetEdge, WalkCell } from "../cell";
import {
  PAINT_RED,
  PAINTS,
  RoadNet,
  STOP_LINE,
  parkedOn,
  starterCar,
  type ParkedCar,
} from "../roads";
import { CARS } from "../vehicles";
import type { WalkIndex } from "../walk-index";
import { WalkWorld } from "../world";
import {
  boxVolume,
  fileStreets,
  makeCell,
  ringed,
  roadNode,
  streetEdge,
  waterRect,
  worldOf,
} from "./fixtures";

const netOf = (cells: WalkCell[]) => {
  const net = new RoadNet();
  for (const c of cells) net.add(c);
  return net;
};

/** The corners of a parked car's box. */
function corners(c: ParkedCar): [number, number][] {
  const s = CARS[c.kind];
  const sy = Math.sin(c.yaw);
  const cy = Math.cos(c.yaw);
  const out: [number, number][] = [];
  for (const [f, r] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const fe = (f * s.length) / 2;
    const rw = (r * s.width) / 2;
    out.push([c.e + sy * fe + cy * rw, c.n + cy * fe - sy * rw]);
  }
  return out;
}

/** A crossing of two 20 m two-way streets at (300, 300): one east-west, the other `deg` degrees from it. */
function crossing(deg: number) {
  const a = (deg * Math.PI) / 180;
  const ue = Math.cos(a);
  const un = Math.sin(a);
  const nodes: RoadNode[] = [
    roadNode(1, 300, 300, { lights: true, bearing: Math.PI / 2 }),
    roadNode(2, 100, 300),
    roadNode(3, 500, 300),
    roadNode(4, 300 - 190 * ue, 300 - 190 * un),
    roadNode(5, 300 + 190 * ue, 300 + 190 * un),
  ];
  const o: Partial<StreetEdge> = { width: 20, cls: 3 };
  const streets = [
    streetEdge(
      2,
      1,
      [
        [100, 300],
        [300, 300],
      ],
      o,
    ),
    streetEdge(
      1,
      3,
      [
        [300, 300],
        [500, 300],
      ],
      o,
    ),
    streetEdge(
      4,
      1,
      [
        [300 - 190 * ue, 300 - 190 * un],
        [300, 300],
      ],
      o,
    ),
    streetEdge(
      1,
      5,
      [
        [300, 300],
        [300 + 190 * ue, 300 + 190 * un],
      ],
      o,
    ),
  ];
  /** How far a point is from the slanted street's centreline. */
  const offSlant = (e: number, n: number) => Math.abs((e - 300) * un - (n - 300) * ue);
  return { nodes, streets, offSlant };
}

describe("the road network", () => {
  it("keeps a street filed under two squares once, until both squares are gone", () => {
    const nodes = [roadNode(1, 100, 100), roadNode(2, 300, 100)];
    const s = streetEdge(1, 2, [
      [100, 100],
      [300, 100],
    ]);
    const cells = fileStreets(nodes, [s]);
    expect(cells.map((c) => c.key).sort()).toEqual(["0_0", "1_0"]);
    const net = netOf(cells);
    expect(net.edge("1-2")).toBeDefined();
    expect(net.outOf(1)).toHaveLength(1);
    expect(net.node(2)?.e).toBe(300);
    net.remove("0_0");
    expect(net.edge("1-2")).toBeDefined();
    net.remove("nowhere");
    net.remove("1_0");
    expect(net.edge("1-2")).toBeUndefined();
    expect(net.outOf(1)).toEqual([]);
    expect(net.node(2)).toBeUndefined();
  });

  it("answers the ways out of a node: one-way streets only their way, never the way it came", () => {
    const nodes = [
      roadNode(1, 100, 100),
      roadNode(2, 0, 100),
      roadNode(3, 180, 100),
      roadNode(4, 100, 20),
      roadNode(5, 100, 180),
    ];
    const streets = [
      streetEdge(2, 1, [
        [0, 100],
        [100, 100],
      ]),
      streetEdge(
        1,
        3,
        [
          [100, 100],
          [180, 100],
        ],
        { ow: 1 },
      ),
      streetEdge(
        4,
        1,
        [
          [100, 20],
          [100, 100],
        ],
        { ow: 1 },
      ),
      streetEdge(
        1,
        5,
        [
          [100, 100],
          [100, 180],
        ],
        { ow: -1 },
      ),
    ];
    const net = netOf(fileStreets(nodes, streets));
    expect(
      net
        .outOf(1)
        .map((s) => s.key)
        .sort(),
    ).toEqual(["1-3", "2-1"]);
    expect(net.outOf(1, "2-1").map((s) => s.key)).toEqual(["1-3"]);
    expect(net.outOf(4).map((s) => s.key)).toEqual(["4-1"]);
    expect(net.outOf(5).map((s) => s.key)).toEqual(["1-5"]);
    expect(net.outOf(3)).toEqual([]);
  });

  it("puts a two-way street's lanes right of the middle each way, and a one-way street's centred", () => {
    const net = new RoadNet();
    const two = streetEdge(
      1,
      2,
      [
        [0, 0],
        [100, 0],
      ],
      { width: 20 },
    );
    for (const forward of [true, false]) {
      const lanes = net.lanes(two, forward);
      expect(lanes.length).toBe(2);
      for (const x of lanes) expect(x).toBeGreaterThan(0);
      expect(lanes[1]).toBeGreaterThan(lanes[0]);
    }
    const one = streetEdge(
      1,
      2,
      [
        [0, 0],
        [100, 0],
      ],
      { width: 20, ow: 1 },
    );
    const lanes = net.lanes(one, true);
    expect(lanes.length).toBe(4);
    expect(lanes.reduce((s, x) => s + x, 0)).toBeCloseTo(0);
    expect(net.lanes(one, false)).toEqual([]);
    const back = streetEdge(
      1,
      2,
      [
        [0, 0],
        [100, 0],
      ],
      { width: 20, ow: -1 },
    );
    expect(net.lanes(back, true)).toEqual([]);
    expect(net.lanes(back, false)).toHaveLength(4);
  });

  it("counts max(1, floor(width / 3.3)) lanes where nothing parks", () => {
    const net = new RoadNet();
    const deck = (width: number, ow: 0 | 1) =>
      streetEdge(
        1,
        2,
        [
          [0, 0, 7],
          [100, 0, 7],
        ],
        { width, ow, elevated: true },
      );
    expect(net.lanes(deck(13.3, 1), true)).toHaveLength(4);
    expect(net.lanes(deck(6.7, 1), true)).toHaveLength(2);
    expect(net.lanes(deck(3, 1), true)).toHaveLength(1);
    expect(net.lanes(deck(6, 0), true)).toHaveLength(1);
    expect(net.lanes(deck(13.3, 0), false)).toHaveLength(2);
  });

  it("leaves the kerbs to parked cars where they park", () => {
    const net = new RoadNet();
    const side = streetEdge(
      1,
      2,
      [
        [0, 0],
        [100, 0],
      ],
      { width: 10, ow: 1 },
    );
    const lanes = net.lanes(side, true);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toBeCloseTo(0);
  });
});

describe("crossings at any angle", () => {
  it("keep a right-angle crossing's lanes the crossing street's half width and 1 m back", () => {
    const { nodes, streets } = crossing(90);
    const net = netOf(fileStreets(nodes, streets));
    expect(net.junction(1, net.edge("2-1")!)).toBeCloseTo(11);
  });

  it("keep a 30° crossing's lanes back until the whole width is clear of the other street", () => {
    const { nodes, streets, offSlant } = crossing(30);
    const net = netOf(fileStreets(nodes, streets));
    const west = net.edge("2-1")!;
    const r = net.junction(1, west);
    // (10 + 1 + 10·cos 30°) / sin 30°
    expect(r).toBeCloseTo((11 + 10 * Math.cos(Math.PI / 6)) / 0.5, 5);
    // a car's front corners at the stop line, in every lane: off the slanted street
    const front = 300 - r - STOP_LINE;
    for (const lane of net.lanes(west, true))
      for (const side of [-1, 1]) {
        const n = 300 - lane + side * (CARS.bus.width / 2);
        expect(offSlant(front, n)).toBeGreaterThanOrEqual(10);
      }
    // and the slanted street's lanes as far from the east-west one
    const slant = net.edge("4-1")!;
    expect(net.junction(1, slant)).toBeCloseTo(r, 5);
  });

  it("keep parked cars off the other street at a 30° crossing", () => {
    const { nodes, streets, offSlant } = crossing(30);
    const w = worldOf(...ringed(fileStreets(nodes, streets)));
    for (const s of streets) {
      const cars = parkedOn(s, w)!;
      expect(cars.length).toBeGreaterThan(0);
      const slanted = s.key === "4-1" || s.key === "1-5";
      for (const c of cars)
        for (const [e, n] of corners(c))
          expect(slanted ? Math.abs(n - 300) : offSlant(e, n)).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("parked cars", () => {
  const nodes = [roadNode(30, 10, 100), roadNode(31, 190, 100)];
  const parkStreet = (opts: Partial<StreetEdge> = {}) =>
    streetEdge(
      30,
      31,
      [
        [10, 100, opts.elevated ? 7 : 0],
        [190, 100, opts.elevated ? 7 : 0],
      ],
      { width: 12, ...opts },
    );
  const worldWith = (s: StreetEdge, parts: Partial<WalkCell> = {}) => {
    const cells = fileStreets(nodes, [s]);
    Object.assign(cells[0], parts);
    return worldOf(...ringed(cells));
  };

  it("are the same every time, from the street's key", () => {
    const s = parkStreet();
    const w = worldWith(s);
    const once = parkedOn(s, w)!;
    expect(once.length).toBeGreaterThan(0);
    expect(parkedOn(s, w)).toEqual(once);
    const other = { ...s, key: "30-31x" };
    expect(parkedOn(other, w)).not.toEqual(once);
  });

  it("wait for the squares round the street, and come out the same once they are in", () => {
    const s = parkStreet();
    const cells = fileStreets(nodes, [s]);
    // the street's own square alone: not yet
    expect(parkedOn(s, worldOf(...cells))).toBeNull();
    // one square round it missing: not yet
    const ring = ringed(cells);
    expect(parkedOn(s, worldOf(...ring.filter((c) => c.key !== "1_1")))).toBeNull();
    const ready = parkedOn(s, worldOf(...ring));
    expect(ready).not.toBeNull();
    // everything for 2 squares round: the same
    const wide: WalkCell[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) wide.push(makeCell(i, j));
    wide[wide.findIndex((c) => c.key === "0_0")] = cells[0];
    expect(parkedOn(s, worldOf(...wide))).toEqual(ready);
    // squares the data has no file for count as in
    const index = { i0: 0, j0: 0, cols: 1, rows: 1, cells: "AQ==" } as WalkIndex;
    const edgeOfData = new WalkWorld(index);
    edgeOfData.add(cells[0]);
    expect(parkedOn(s, edgeOfData)).toEqual(ready);
    // a street where nothing parks answers at once
    expect(parkedOn(parkStreet({ width: 7 }), worldOf(...cells))).toEqual([]);
  });

  it("line both kerbs, a spot every 6.5 m, about two in three filled, facing the traffic beside them", () => {
    const s = parkStreet();
    const cars = parkedOn(s, worldWith(s))!;
    const south = cars.filter((c) => c.n < 100);
    const north = cars.filter((c) => c.n > 100);
    expect(south.length).toBeGreaterThan(5);
    expect(north.length).toBeGreaterThan(5);
    // 180 m less the ends: 26 spots a side
    expect(cars.length).toBeGreaterThan(52 * 0.5);
    expect(cars.length).toBeLessThan(52 * 0.85);
    expect(new Set(cars.map((c) => c.spot)).size).toBe(cars.length);
    for (const c of south) expect(Math.sin(c.yaw)).toBeCloseTo(1);
    for (const c of north) expect(Math.sin(c.yaw)).toBeCloseTo(-1);
    for (const c of cars) {
      const spec = CARS[c.kind];
      expect(Math.abs(c.n - 100)).toBeCloseTo(6 - 0.2 - spec.width / 2, 5);
      expect(spec.length).toBeLessThanOrEqual(6.5);
      expect(Number.isInteger(c.color) && c.color >= 0 && c.color < PAINTS).toBe(true);
    }
    for (const side of [south, north]) {
      const es = side.map((c) => c.e).sort((x, y) => x - y);
      for (let k = 1; k < es.length; k++) {
        const steps = (es[k] - es[k - 1]) / 6.5;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-3);
      }
    }
  });

  it("leave the lanes clear", () => {
    const s = parkStreet();
    const net = new RoadNet();
    const outer = Math.max(...net.lanes(s, true), ...net.lanes(s, false));
    for (const c of parkedOn(s, worldWith(s))!) {
      const inner = Math.abs(c.n - 100) - CARS[c.kind].width / 2;
      expect(inner).toBeGreaterThanOrEqual(outer + 1.15);
    }
  });

  it("face the one way a one-way street goes, on both kerbs", () => {
    const s = parkStreet({ ow: 1 });
    const cars = parkedOn(s, worldWith(s))!;
    expect(cars.some((c) => c.n > 100) && cars.some((c) => c.n < 100)).toBe(true);
    for (const c of cars) expect(Math.sin(c.yaw)).toBeCloseTo(1);
    const back = parkStreet({ ow: -1 });
    for (const c of parkedOn(back, worldWith(back))!) expect(Math.sin(c.yaw)).toBeCloseTo(-1);
  });

  it("need a street 9 m wide, on the ground, and not a motorway", () => {
    for (const s of [
      parkStreet({ width: 7 }),
      parkStreet({ width: 8.9 }),
      parkStreet({ elevated: true }),
      parkStreet({ cls: 0, width: 14 }),
      parkStreet({ link: true }),
    ])
      expect(parkedOn(s, worldWith(s))).toEqual([]);
    const s = parkStreet({ width: 9 });
    expect(parkedOn(s, worldWith(s))!.length).toBeGreaterThan(0);
  });

  it("drop a car that would stand in a wall or in the water", () => {
    const s = parkStreet();
    const walled = worldWith(s, { volumes: [boxVolume(10, 90, 190, 96.5)] });
    const cars = parkedOn(s, walled)!;
    expect(cars.length).toBeGreaterThan(5);
    expect(cars.every((c) => c.n > 100)).toBe(true);
    const wet = worldWith(s, { mask: waterRect(0, 0, 0, 102, 200, 200) });
    const dry = parkedOn(s, wet)!;
    expect(dry.length).toBeGreaterThan(5);
    expect(dry.every((c) => c.n < 100)).toBe(true);
    // the same spots otherwise
    const all = parkedOn(s, worldWith(s))!;
    expect(dry).toEqual(all.filter((c) => c.n < 100));
  });

  it("keep clear of a right-angle crossing", () => {
    const { nodes: cn, streets } = crossing(90);
    const w = worldOf(...ringed(fileStreets(cn, streets)));
    const cars = parkedOn(streets[0], w)!;
    expect(cars.length).toBeGreaterThan(0);
    for (const c of cars) expect(c.e + CARS[c.kind].length / 2).toBeLessThanOrEqual(300 - 10 - 5);
  });

  it("leave the red supercar on the kerb nearest to where the walk opens, and its spot", () => {
    const s = parkStreet();
    const w = worldWith(s);
    const starter = starterCar(w, { e: 100, n: 90 });
    expect(starter).not.toBeNull();
    const { car, spot } = starter!;
    expect(car.kind).toBe("supercar");
    expect(car.state).toBe("parked");
    expect(car.color).toBe(PAINT_RED);
    expect(car.n).toBeLessThan(100);
    expect(Math.abs(car.e - 100)).toBeLessThan(6.5);
    expect(Math.abs(car.n - 100)).toBeCloseTo(6 - 0.2 - CARS.supercar.width / 2, 5);
    expect(spot.edge).toBe(s.key);
    // the parked cars leave that spot to it, and only that one
    const all = parkedOn(s, w)!;
    const left = parkedOn(s, w, spot)!;
    expect(left.some((c) => c.spot === spot.spot)).toBe(false);
    expect(left).toEqual(all.filter((c) => c.spot !== spot.spot));
    expect(parkedOn(s, w, { edge: "elsewhere", spot: spot.spot })).toEqual(all);
    const narrow = parkStreet({ width: 7 });
    expect(starterCar(worldWith(narrow), { e: 100, n: 90 })).toBeNull();
    // nor on a street whose squares are not all in yet
    expect(starterCar(worldOf(...fileStreets(nodes, [s])), { e: 100, n: 90 })).toBeNull();
  });
});
