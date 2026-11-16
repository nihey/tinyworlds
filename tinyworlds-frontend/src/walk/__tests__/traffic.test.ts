import { describe, expect, it } from "vitest";
import type { RoadNode, StreetEdge, WalkCell } from "../cell";
import {
  PAINT_RED,
  PAINTS,
  RoadNet,
  SPAWN_FAR,
  SPAWN_NEAR,
  DROP_FAR,
  STOP_LINE,
  Traffic,
  parkedOn,
  pickWay,
  starterCar,
  type Blocker,
} from "../traffic";
import { bodyOf, overlap } from "../collide";
import { CARS, newVehicle, type Vehicle } from "../vehicles";
import type { WalkIndex } from "../walk-index";
import {
  boxVolume,
  fileStreets,
  makeCell,
  roadNode,
  streetEdge,
  waterRect,
  worldOf,
} from "./fixtures";

type Tunnels = WalkIndex["tunnels"];
const EAST = Math.PI / 2;
const DT = 0.1;
const SEDAN_HL = CARS.sedan.length / 2;

const rng = (seed = 1) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A network and its traffic. Unless `spawn`, nothing is brought in by itself: every square is "in view". */
function setup(
  nodes: RoadNode[],
  streets: StreetEdge[],
  opts: { tunnels?: Tunnels; random?: () => number; spawn?: boolean } = {},
) {
  const cells = fileStreets(nodes, streets);
  const net = new RoadNet();
  for (const c of cells) net.add(c);
  const world = worldOf(...cells);
  const traffic = new Traffic(net, world, opts.tunnels ?? [], opts.random ?? rng());
  if (!opts.spawn) traffic.visible = () => true;
  return { cells, net, world, traffic };
}

interface RunOpts {
  t0?: number;
  focus?: { e: number; n: number };
  others?: Vehicle[];
  before?: (t: number) => void;
  each?: (t: number) => void;
}

/** Steps the traffic ten times a second for `seconds` from `t0`; answers the time it ended at. */
function run(traffic: Traffic, seconds: number, o: RunOpts = {}): number {
  let t = o.t0 ?? 0;
  const steps = Math.round(seconds / DT);
  for (let k = 0; k < steps; k++) {
    o.before?.(t);
    traffic.step(DT, t, o.focus ?? { e: 0, n: 0 }, o.others ?? []);
    t += DT;
    o.each?.(t);
  }
  return t;
}

/** A crossing at (300, 300), lights unless told otherwise (bearing north, so east-west runs "across"), arms 200 m long. */
const C = 1;
function cross(opts: { lights?: boolean; oneWay?: boolean; cls?: number; width?: number } = {}) {
  const nodes = [
    roadNode(C, 300, 300, { lights: opts.lights ?? true, bearing: 0 }),
    roadNode(2, 100, 300),
    roadNode(3, 500, 300),
    roadNode(4, 300, 100),
    roadNode(5, 300, 500),
  ];
  const o: Partial<StreetEdge> = {
    width: opts.width ?? 12,
    cls: opts.cls ?? 4,
    ow: opts.oneWay ? 1 : 0,
  };
  const streets = [
    streetEdge(
      2,
      C,
      [
        [100, 300],
        [300, 300],
      ],
      o,
    ),
    streetEdge(
      C,
      3,
      [
        [300, 300],
        [500, 300],
      ],
      o,
    ),
    streetEdge(
      4,
      C,
      [
        [300, 100],
        [300, 300],
      ],
      o,
    ),
    streetEdge(
      C,
      5,
      [
        [300, 300],
        [300, 500],
      ],
      o,
    ),
  ];
  return { nodes, streets };
}

/** A straight two-way street 600 m long along n = 100, eastwards from node 10 to node 11. */
function avenue(opts: Partial<StreetEdge> = {}) {
  const nodes = [roadNode(10, 0, 100), roadNode(11, 600, 100)];
  const streets = [
    streetEdge(
      10,
      11,
      [
        [0, 100, opts.elevated ? 6.5 : 0],
        [600, 100, opts.elevated ? 6.5 : 0],
      ],
      opts,
    ),
  ];
  return { nodes, streets };
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
    const net = new RoadNet();
    for (const c of cells) net.add(c);
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
    const { net } = setup(nodes, streets);
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
    return worldOf(...cells);
  };

  it("are the same every time, from the street's key", () => {
    const s = parkStreet();
    const w = worldWith(s);
    const once = parkedOn(s, w);
    expect(once.length).toBeGreaterThan(0);
    expect(parkedOn(s, w)).toEqual(once);
    const other = { ...s, key: "30-31x" };
    expect(parkedOn(other, w)).not.toEqual(once);
  });

  it("line both kerbs, a spot every 6.5 m, about two in three filled, facing the traffic beside them", () => {
    const s = parkStreet();
    const cars = parkedOn(s, worldWith(s));
    const south = cars.filter((c) => c.n < 100);
    const north = cars.filter((c) => c.n > 100);
    expect(south.length).toBeGreaterThan(5);
    expect(north.length).toBeGreaterThan(5);
    // 180 m less the ends: 26 spots a side
    expect(cars.length).toBeGreaterThan(52 * 0.5);
    expect(cars.length).toBeLessThan(52 * 0.85);
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
    for (const c of parkedOn(s, worldWith(s))) {
      const inner = Math.abs(c.n - 100) - CARS[c.kind].width / 2;
      expect(inner).toBeGreaterThanOrEqual(outer + 1.15);
    }
  });

  it("face the one way a one-way street goes, on both kerbs", () => {
    const s = parkStreet({ ow: 1 });
    const cars = parkedOn(s, worldWith(s));
    expect(cars.some((c) => c.n > 100) && cars.some((c) => c.n < 100)).toBe(true);
    for (const c of cars) expect(Math.sin(c.yaw)).toBeCloseTo(1);
    const back = parkStreet({ ow: -1 });
    for (const c of parkedOn(back, worldWith(back))) expect(Math.sin(c.yaw)).toBeCloseTo(-1);
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
    expect(parkedOn(s, worldWith(s)).length).toBeGreaterThan(0);
  });

  it("drop a car that would stand in a wall or in the water", () => {
    const s = parkStreet();
    const walled = worldWith(s, { volumes: [boxVolume(10, 90, 190, 96.5)] });
    const cars = parkedOn(s, walled);
    expect(cars.length).toBeGreaterThan(5);
    expect(cars.every((c) => c.n > 100)).toBe(true);
    const wet = worldWith(s, { mask: waterRect(0, 0, 0, 102, 200, 200) });
    const dry = parkedOn(s, wet);
    expect(dry.length).toBeGreaterThan(5);
    expect(dry.every((c) => c.n < 100)).toBe(true);
    // the same spots otherwise
    const all = parkedOn(s, worldWith(s));
    expect(dry).toEqual(all.filter((c) => c.n < 100));
  });

  it("keep clear of a crossing", () => {
    const { nodes: cn, streets } = cross();
    const w = worldOf(...fileStreets(cn, streets));
    const west = streets[0];
    const cars = parkedOn(west, w);
    expect(cars.length).toBeGreaterThan(0);
    for (const c of cars) expect(c.e + CARS[c.kind].length / 2).toBeLessThanOrEqual(300 - 6 - 5);
  });

  it("leave the red supercar on the kerb nearest to where the walk opens", () => {
    const s = parkStreet();
    const w = worldWith(s);
    const car = starterCar(w, { e: 100, n: 90 });
    expect(car).not.toBeNull();
    expect(car!.kind).toBe("supercar");
    expect(car!.state).toBe("parked");
    expect(car!.color).toBe(PAINT_RED);
    expect(car!.n).toBeLessThan(100);
    expect(Math.abs(car!.e - 100)).toBeLessThan(6.5);
    expect(Math.abs(car!.n - 100)).toBeCloseTo(6 - 0.2 - CARS.supercar.width / 2, 5);
    const narrow = parkStreet({ width: 7 });
    expect(starterCar(worldWith(narrow), { e: 100, n: 90 })).toBeNull();
  });
});

describe("turning", () => {
  it("goes straight three times as often as it takes each turn", () => {
    const counts = [0, 0, 0];
    for (let k = 0; k < 1000; k++)
      counts[pickWay([0, Math.PI / 2, -Math.PI / 2], (k + 0.5) / 1000)]++;
    expect(counts[0]).toBeGreaterThan(580);
    expect(counts[0]).toBeLessThan(620);
    expect(counts[1]).toBeGreaterThan(180);
    expect(counts[2]).toBeGreaterThan(180);
  });

  it("takes the right lane for a right turn, and slows for it", () => {
    const nodes = [roadNode(40, 0, 300), roadNode(41, 300, 300), roadNode(42, 300, 10)];
    const streets = [
      streetEdge(
        40,
        41,
        [
          [0, 300],
          [300, 300],
        ],
        { width: 20, cls: 2 },
      ),
      streetEdge(
        41,
        42,
        [
          [300, 300],
          [300, 10],
        ],
        { width: 20, cls: 2 },
      ),
    ];
    const { net, traffic } = setup(nodes, streets);
    const lanes = net.lanes(streets[0], true);
    const car = traffic.spawnAt(net.edge("40-41")!, true, 50, { kind: "sedan", lane: 0 })!;
    expect(300 - car.n).toBeCloseTo(lanes[0], 1);
    const before: number[] = [];
    let cruising = 0;
    let turning = Infinity;
    run(traffic, 40, {
      focus: { e: 250, n: 250 },
      each: () => {
        if (car.e > 270 && car.e < 286 && car.n > 290) before.push(300 - car.n);
        if (car.e > 190 && car.e < 210) cruising = Math.max(cruising, car.v);
        // the turn runs within 12.1 m of the node: lanes stop 11 m short of it, 4.95 m off
        if (Math.hypot(car.e - 300, car.n - 300) < 12) turning = Math.min(turning, car.v);
      },
    });
    expect(before.length).toBeGreaterThan(0);
    for (const x of before) expect(x).toBeCloseTo(lanes[lanes.length - 1], 1);
    expect(cruising).toBeGreaterThan(8);
    expect(turning).toBeLessThan(5.5);
    expect(car.n).toBeLessThan(250);
    expect(car.e).toBeLessThan(300);
  });
});

describe("changing lanes", () => {
  it("waits for a car keeping level with it in the lane it goes to", () => {
    const nodes = [roadNode(40, 0, 300), roadNode(41, 300, 300), roadNode(42, 300, 10)];
    const streets = [
      streetEdge(
        40,
        41,
        [
          [0, 300],
          [300, 300],
        ],
        { width: 20, cls: 2 },
      ),
      streetEdge(
        41,
        42,
        [
          [300, 300],
          [300, 10],
        ],
        { width: 20, cls: 2 },
      ),
    ];
    const { net, traffic } = setup(nodes, streets);
    const lanes = net.lanes(streets[0], true);
    const car = traffic.spawnAt(net.edge("40-41")!, true, 50, { kind: "sedan", lane: 0 })!;
    // in the right lane, level with it, keeping up with it and never slowing down
    const beside = newVehicle(902, "sedan", car.e, 300 - lanes[1], EAST, "driven");
    let touched = false;
    const before: number[] = [];
    run(traffic, 40, {
      focus: { e: 250, n: 250 },
      others: [beside],
      before: () => {
        beside.v = Math.max(beside.v, car.v);
        beside.e += beside.v * DT;
      },
      each: () => {
        touched ||= overlap(bodyOf(car), bodyOf(beside)) !== null;
        if (car.e > 270 && car.e < 286 && car.n > 290) before.push(300 - car.n);
      },
    });
    expect(touched).toBe(false);
    expect(before.length).toBeGreaterThan(0);
    for (const x of before) expect(x).toBeCloseTo(lanes[1], 1);
  });
});

describe("giving way at a crossing", () => {
  it("lets the car that gets there first go, and the other wait for it", () => {
    const { nodes, streets } = cross({ lights: false, oneWay: true });
    const { net, traffic } = setup(nodes, streets, { random: () => 0.5 });
    // the older one further away
    const late = traffic.spawnAt(net.edge(`4-${C}`)!, true, 147, { kind: "sedan", lane: 1 })!;
    const early = traffic.spawnAt(net.edge(`2-${C}`)!, true, 150, { kind: "sedan", lane: 1 })!;
    late.v = 9.6;
    early.v = 9.6;
    let touched = false;
    let earlyCrossed = Infinity;
    let lateCrossed = Infinity;
    run(traffic, 30, {
      focus: { e: 300, n: 300 },
      each: (t) => {
        touched ||= overlap(bodyOf(early), bodyOf(late)) !== null;
        if (early.e > 306 && earlyCrossed === Infinity) earlyCrossed = t;
        if (late.n > 306 && lateCrossed === Infinity) lateCrossed = t;
      },
    });
    expect(touched).toBe(false);
    expect(earlyCrossed).toBeLessThan(lateCrossed);
    expect(lateCrossed).toBeLessThan(30);
    expect(traffic.squeezing(late)).toBe(false);
  });
});

describe("lights at a crossing", () => {
  const westCar = (s: number, v: number) => {
    const { nodes, streets } = cross();
    const { net, traffic } = setup(nodes, streets);
    const west = net.edge(`2-${C}`)!;
    const car = traffic.spawnAt(west, true, s, { kind: "sedan" })!;
    car.v = v;
    const line = 100 + west.length - net.junction(C, west) - STOP_LINE;
    return { traffic, car, line, net, west };
  };

  it("stop a car at red before the node, and let it go on green", () => {
    const { traffic, car, line } = westCar(100, 5);
    let front = -Infinity;
    // east-west runs across the node's bearing: red until 17 s
    const t = run(traffic, 16, {
      focus: { e: 300, n: 300 },
      each: () => (front = Math.max(front, car.e + SEDAN_HL)),
    });
    expect(front).toBeLessThanOrEqual(line + 0.05);
    expect(front).toBeGreaterThan(line - 1);
    expect(car.v).toBeLessThan(0.05);
    expect(car.state).toBe("traffic");
    let nearest = Infinity;
    run(traffic, 14, {
      t0: t,
      focus: { e: 300, n: 300 },
      each: () => (nearest = Math.min(nearest, Math.hypot(car.e - 300, car.n - 300))),
    });
    expect(nearest).toBeLessThan(6);
  });

  it("let a car 2 m from the line at yellow go through", () => {
    const { line } = westCar(0, 0);
    const { traffic, car } = westCar(line - 100 - 2 - SEDAN_HL, 10);
    let slowest = Infinity;
    // yellow from 30 s to 33 s for this phase
    run(traffic, 2.5, {
      t0: 30,
      focus: { e: 300, n: 300 },
      each: () => (slowest = Math.min(slowest, car.v)),
    });
    expect(car.e + SEDAN_HL).toBeGreaterThan(line + 5);
    expect(slowest).toBeGreaterThan(3);
  });

  it("stop a car far enough from the line at yellow", () => {
    const { line } = westCar(0, 10);
    const { traffic, car } = westCar(line - 100 - 40 - SEDAN_HL, 10);
    let front = -Infinity;
    run(traffic, 8, {
      t0: 30,
      focus: { e: 300, n: 300 },
      each: () => (front = Math.max(front, car.e + SEDAN_HL)),
    });
    expect(front).toBeLessThanOrEqual(line + 0.05);
    expect(car.v).toBeLessThan(0.05);
  });

  it("let the older of two waiting on each other go", () => {
    const { nodes, streets } = cross({ lights: false, oneWay: true });
    const { net, traffic } = setup(nodes, streets, { random: () => 0.5 });
    // each nose just inside the other's way (its lane, and 0.15 m), not touching it
    const a = traffic.spawnAt(net.edge(`2-${C}`)!, true, 300.7 - SEDAN_HL - 100, {
      kind: "sedan",
      lane: 1,
    })!;
    const b = traffic.spawnAt(net.edge(`4-${C}`)!, true, 297.4 - SEDAN_HL - 100, {
      kind: "sedan",
      lane: 1,
    })!;
    a.v = 0;
    b.v = 0;
    expect(a.id).toBeLessThan(b.id);
    let aCrossed = Infinity;
    let bCrossed = Infinity;
    let passing = false;
    run(traffic, 8, {
      focus: { e: 300, n: 300 },
      each: (t) => {
        if (a.e > 306 && aCrossed === Infinity) aCrossed = t;
        if (b.n > 306 && bCrossed === Infinity) bCrossed = t;
        passing ||= traffic.squeezing(a);
      },
    });
    expect(aCrossed).toBeLessThan(bCrossed);
    expect(bCrossed).toBeLessThan(8);
    expect(passing).toBe(true);
    expect(traffic.squeezing(a)).toBe(false);
  });
});

describe("keeping a gap", () => {
  it("stops a car 2 m behind a stopped car", () => {
    const { nodes, streets } = avenue();
    const { net, traffic } = setup(nodes, streets);
    const edge = net.edge("10-11")!;
    const lead = traffic.spawnAt(edge, true, 300, { kind: "sedan" })!;
    lead.v = 0;
    lead.stopFor = 100;
    const car = traffic.spawnAt(edge, true, 250, { kind: "sedan" })!;
    let least = Infinity;
    run(traffic, 14, {
      focus: { e: 300, n: 100 },
      each: () => (least = Math.min(least, lead.e - car.e - 2 * SEDAN_HL)),
    });
    expect(least).toBeGreaterThanOrEqual(1.95);
    expect(lead.e - car.e - 2 * SEDAN_HL).toBeLessThan(2.6);
    expect(car.v).toBeLessThan(0.05);
    expect(lead.e).toBeCloseTo(300, 1);
  });

  it("follows a slower car 2 + 1.2·v behind it", () => {
    const { nodes, streets } = avenue();
    const { net, traffic } = setup(nodes, streets);
    const lanes = net.lanes(streets[0], true);
    const lead = newVehicle(900, "sedan", 230, 100 - lanes[0], EAST, "driven");
    lead.v = 5;
    const car = traffic.spawnAt(net.edge("10-11")!, true, 150, { kind: "sedan" })!;
    run(traffic, 45, {
      focus: { e: 300, n: 100 },
      others: [lead],
      before: () => (lead.e += lead.v * DT),
    });
    const gap = lead.e - car.e - 2 * SEDAN_HL;
    expect(gap).toBeGreaterThan(2 + 1.2 * 5 - 0.6);
    expect(gap).toBeLessThan(2 + 1.2 * 5 + 0.6);
    expect(car.v).toBeCloseTo(5, 0);
  });

  it("stops for you on foot, but not for someone on a deck above the street", () => {
    for (const z of [undefined, 0, 6.5]) {
      const { nodes, streets } = avenue();
      const { net, traffic } = setup(nodes, streets);
      const lane = net.lanes(streets[0], true)[0];
      const you: Blocker = { e: 300, n: 100 - lane, r: 0.3, z };
      traffic.blockers = [you];
      const car = traffic.spawnAt(net.edge("10-11")!, true, 200, { kind: "sedan" })!;
      run(traffic, 25, { focus: { e: 300, n: 100 } });
      if (z === 6.5) expect(car.e).toBeGreaterThan(320);
      else {
        expect(car.e + SEDAN_HL).toBeLessThanOrEqual(300 - 0.3 - 1.9);
        expect(car.e + SEDAN_HL).toBeGreaterThan(300 - 0.3 - 4);
        expect(traffic.squeezing(car)).toBe(false);
      }
    }
  });

  it("squeezes past something that has not moved for 10 s", () => {
    const { nodes, streets } = avenue();
    const { net, traffic } = setup(nodes, streets);
    const lane = net.lanes(streets[0], true)[0];
    const wreck = newVehicle(901, "sedan", 300, 100 - lane, EAST, "wrecked");
    const car = traffic.spawnAt(net.edge("10-11")!, true, 240, { kind: "sedan" })!;
    let stoppedAt = Infinity;
    let behindLater = true;
    let passing = false;
    run(traffic, 40, {
      focus: { e: 300, n: 100 },
      others: [wreck],
      each: (t) => {
        if (stoppedAt === Infinity && car.v < 0.05 && car.e < 300) stoppedAt = t;
        if (t > stoppedAt && t < stoppedAt + 8) behindLater &&= car.e + SEDAN_HL < 300 - SEDAN_HL;
        passing ||= traffic.squeezing(car);
      },
    });
    expect(stoppedAt).toBeLessThan(20);
    expect(behindLater).toBe(true);
    expect(passing).toBe(true);
    expect(car.e).toBeGreaterThan(310);
    expect(traffic.squeezing(car)).toBe(false);
  });
});

describe("knocks and the game's cars", () => {
  it("stops a knocked car for 2.5 s, and lets a hard knock send it loose", () => {
    const { nodes, streets } = avenue();
    const { net, traffic } = setup(nodes, streets);
    const edge = net.edge("10-11")!;
    const car = traffic.spawnAt(edge, true, 100, { kind: "sedan" })!;
    run(traffic, 3, { focus: { e: 200, n: 100 } });
    expect(car.v).toBeGreaterThan(1);
    expect(traffic.hit(car, 1.5)).toBe(false);
    expect(car.v).toBe(0);
    expect(car.stopFor).toBeCloseTo(2.5);
    const at = car.e;
    run(traffic, 2.3, { focus: { e: 200, n: 100 } });
    expect(car.e).toBeCloseTo(at, 5);
    run(traffic, 2, { focus: { e: 200, n: 100 } });
    expect(car.e).toBeGreaterThan(at + 1);

    expect(traffic.hit(car, 3)).toBe(true);
    expect(car.state).toBe("loose");
    expect(traffic.cars).not.toContain(car);
    const e = car.e;
    run(traffic, 1, { focus: { e: 200, n: 100 } });
    expect(car.e).toBe(e);
  });

  it("lets go of a car the game has taken", () => {
    const { nodes, streets } = avenue();
    const { net, traffic } = setup(nodes, streets);
    const car = traffic.spawnAt(net.edge("10-11")!, true, 100, { kind: "taxi" })!;
    car.state = "driven";
    const e = car.e;
    run(traffic, 1, { focus: { e: 100, n: 100 } });
    expect(traffic.cars).not.toContain(car);
    expect(car.e).toBe(e);
  });

  it("drops a car beyond 380 m", () => {
    const { nodes, streets } = avenue();
    const { net, traffic } = setup(nodes, streets);
    traffic.spawnAt(net.edge("10-11")!, true, 500, { kind: "sedan" });
    run(traffic, 0.1, { focus: { e: 500 - DROP_FAR - 5, n: 100 } });
    expect(traffic.cars).toHaveLength(0);
  });

  it("drives along an elevated way at its height", () => {
    const { nodes, streets } = avenue({ elevated: true });
    const { net, traffic } = setup(nodes, streets);
    const car = traffic.spawnAt(net.edge("10-11")!, true, 100, { kind: "sedan" })!;
    run(traffic, 3, { focus: { e: 100, n: 100 } });
    expect(car.z).toBeCloseTo(6.5, 3);
    expect(car.e).toBeGreaterThan(110);
    expect(Math.sin(car.yaw)).toBeCloseTo(1);
  });
});

describe("spawning", () => {
  /** Streets every 100 m from 50 to 1050 both ways. */
  function grid() {
    const nodes: RoadNode[] = [];
    const streets: StreetEdge[] = [];
    const id = (i: number, j: number) => 100 + i * 11 + j;
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10; j++) nodes.push(roadNode(id(i, j), 50 + 100 * i, 50 + 100 * j));
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10; j++) {
        const e = 50 + 100 * i;
        const n = 50 + 100 * j;
        if (i < 10)
          streets.push(
            streetEdge(id(i, j), id(i + 1, j), [
              [e, n],
              [e + 100, n],
            ]),
          );
        if (j < 10)
          streets.push(
            streetEdge(id(i, j), id(i, j + 1), [
              [e, n],
              [e, n + 100],
            ]),
          );
      }
    return { nodes, streets };
  }

  it("brings cars in out of sight, 170 to 320 m away, and lets them go beyond 380 m", () => {
    const { nodes, streets } = grid();
    const { traffic } = setup(nodes, streets, { random: rng(7), spawn: true });
    const focus = { e: 550, n: 550 };
    traffic.visible = (e) => e > focus.e;
    const seen = new Set<number>();
    let most = 0;
    run(traffic, 40, {
      focus,
      each: () => {
        most = Math.max(most, traffic.cars.length);
        for (const c of traffic.cars) {
          const d = Math.hypot(c.e - focus.e, c.n - focus.n);
          expect(d).toBeLessThanOrEqual(DROP_FAR + 3);
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          expect(d).toBeGreaterThanOrEqual(SPAWN_NEAR - 1.5);
          expect(d).toBeLessThanOrEqual(SPAWN_FAR + 1.5);
          expect(c.e).toBeLessThanOrEqual(focus.e + 1.5);
          expect(c.state).toBe("traffic");
        }
      },
    });
    expect(most).toBeGreaterThan(40);
    expect(most).toBeLessThanOrEqual(traffic.budget);
  });

  it("lets cars out of sight beyond 170 m go when the budget is lowered", () => {
    const { nodes, streets } = grid();
    const { traffic } = setup(nodes, streets, { random: rng(9), spawn: true });
    const focus = { e: 550, n: 550 };
    run(traffic, 20, { focus });
    expect(traffic.cars.length).toBeGreaterThan(20);
    traffic.budget = 10;
    run(traffic, 20, { focus });
    const far = traffic.cars.filter(
      (c) => Math.hypot(c.e - focus.e, c.n - focus.n) > SPAWN_NEAR + 3,
    );
    expect(traffic.cars.length <= 10 || far.length === 0).toBe(true);
  });

  it("brings none while the budget is spent", () => {
    const { nodes, streets } = grid();
    const { traffic } = setup(nodes, streets, { spawn: true });
    traffic.budget = 0;
    run(traffic, 5, { focus: { e: 550, n: 550 } });
    expect(traffic.cars).toHaveLength(0);
  });

  it("only on squares that are in", () => {
    const { nodes, streets } = grid();
    const cells = fileStreets(nodes, streets).filter((c) => c.i <= 2);
    const net = new RoadNet();
    for (const c of cells) net.add(c);
    const traffic = new Traffic(net, worldOf(...cells), [], rng(3));
    const seen = new Set<number>();
    run(traffic, 20, {
      focus: { e: 550, n: 550 },
      each: () => {
        for (const c of traffic.cars) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          expect(c.e).toBeLessThan(600 + 1.5);
        }
      },
    });
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("tunnels", () => {
  const nodes = [
    roadNode(20, 10, 100),
    roadNode(21, 110, 100, { portal: true }),
    roadNode(22, 610, 100, { portal: true }),
    roadNode(23, 710, 100),
  ];
  const streets = [
    streetEdge(
      20,
      21,
      [
        [10, 100],
        [110, 100],
      ],
      { cls: 4 },
    ),
    streetEdge(
      22,
      23,
      [
        [610, 100],
        [710, 100],
      ],
      { cls: 4 },
    ),
  ];
  const tunnel = (open: boolean): Tunnels => [
    { name: "T", a: [110, 100, EAST], b: open ? [610, 100, -EAST] : null, length: 500 },
  ];

  it("takes a car in at one portal and gives it back at the other after length / speed", () => {
    const { net, traffic } = setup(nodes, streets, { tunnels: tunnel(true) });
    const car = traffic.spawnAt(net.edge("20-21")!, true, 20, { kind: "sedan" })!;
    const focus = { e: 360, n: 100 };
    let t = 0;
    let gone = -1;
    let speed = 0;
    while (t < 150) {
      traffic.step(DT, t, focus, []);
      t += DT;
      const here = traffic.cars.includes(car);
      if (!here && gone < 0) {
        gone = t;
        speed = car.v;
      }
      if (here && gone >= 0) break;
    }
    expect(gone).toBeGreaterThan(0);
    expect(speed).toBeGreaterThan(3);
    expect(t - gone).toBeGreaterThan(500 / speed - 0.15);
    expect(t - gone).toBeLessThan(500 / speed + 0.15);
    expect(car.e).toBeGreaterThanOrEqual(610);
    expect(car.e).toBeLessThan(616);
    expect(Math.sin(car.yaw)).toBeCloseTo(1, 2);
    run(traffic, 4, { t0: t, focus });
    expect(car.e).toBeGreaterThan(625);
    expect(Math.abs(car.n - 100)).toBeLessThan(3);
  });

  it("takes a car away into a closed tunnel, or a portal with no tunnel", () => {
    for (const tunnels of [tunnel(false), []]) {
      const { net, traffic } = setup(nodes, streets, { tunnels });
      const car = traffic.spawnAt(net.edge("20-21")!, true, 20, { kind: "sedan" })!;
      let gone = false;
      run(traffic, 60, {
        focus: { e: 360, n: 100 },
        each: () => {
          if (!traffic.cars.includes(car)) gone = true;
          else expect(gone).toBe(false);
        },
      });
      expect(gone).toBe(true);
      expect(traffic.cars).toHaveLength(0);
    }
  });

  it("never gives back a car the game took while it was in the tunnel", () => {
    const { net, traffic } = setup(nodes, streets, { tunnels: tunnel(true) });
    const car = traffic.spawnAt(net.edge("20-21")!, true, 20, { kind: "sedan" })!;
    let gone = false;
    run(traffic, 120, {
      focus: { e: 360, n: 100 },
      each: () => {
        if (!gone && !traffic.cars.includes(car)) {
          gone = true;
          car.state = "loose";
        }
      },
    });
    expect(gone).toBe(true);
    expect(traffic.cars).toHaveLength(0);
  });

  it("needs the far portal's square in to give a car back", () => {
    const cells = fileStreets(nodes, streets).filter((c) => c.i === 0);
    const net = new RoadNet();
    for (const c of cells) net.add(c);
    const traffic = new Traffic(net, worldOf(...cells, makeCell(3, 0)), tunnel(true), rng());
    traffic.visible = () => true;
    traffic.spawnAt(net.edge("20-21")!, true, 20, { kind: "sedan" });
    run(traffic, 120, { focus: { e: 360, n: 100 } });
    expect(traffic.cars).toHaveLength(0);
  });
});
