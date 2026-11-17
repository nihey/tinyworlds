import { describe, expect, it } from "vitest";
import { buildNetwork } from "./network.js";
import type { Piece } from "./pieces.js";

function line(e0: number, n0: number, e1: number, n1: number, step = 10): number[] {
  const steps = Math.max(1, Math.round(Math.hypot(e1 - e0, n1 - n0) / step));
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) pts.push(e0 + ((e1 - e0) * i) / steps, n0 + ((n1 - n0) * i) / steps);
  return pts;
}

function piece(a: string, b: string, pts: number[], over: Partial<Piece> = {}): Piece {
  const m = pts.length / 2;
  return {
    kind: "street",
    seg: 0,
    a,
    b,
    cls: 5,
    link: false,
    ow: 0,
    width: 10,
    crosswalk: false,
    name: "",
    pts,
    bridge: new Array<boolean>(m).fill(false),
    level: new Array<number>(m).fill(0),
    tunnel: false,
    ...over,
  };
}

const walk = (a: string, b: string, pts: number[], crosswalk = false): Piece =>
  piece(a, b, pts, { kind: "walk", cls: -1, width: crosswalk ? 3 : 2.5, crosswalk });
const flat = (pieces: Piece[]): Float32Array[] => pieces.map((p) => new Float32Array(p.pts.length / 2));
/** The deck under each vertex of every piece, as `decksOf` gives it: NaN off the map's decks. */
const decksWhere = (pieces: Piece[], at: (e: number) => number | null): Float32Array[] =>
  pieces.map((p) => Float32Array.from({ length: p.pts.length / 2 }, (_, k) => at(p.pts[k * 2]) ?? NaN));
const noDecks = (pieces: Piece[]): Float32Array[] => decksWhere(pieces, () => null);

/** Four streets meeting at "c": a narrow one running north and south, a wide one east and west. */
const crossing = (): Piece[] => [
  piece("c", "n1", line(0, 0, 0, 100)),
  piece("c", "e1", line(0, 0, 100, 0), { cls: 2, width: 17 }),
  piece("s1", "c", line(0, -100, 0, 0)),
  piece("w1", "c", line(-100, 0, 0, 0), { cls: 2, width: 17 }),
];

describe("buildNetwork", () => {
  it("puts lights where four streets meet, along the widest one", () => {
    const pieces = crossing();
    const net = buildNetwork(pieces, flat(pieces), noDecks(pieces));
    const c = net.nodes.get("c")!;
    expect(c.flags & 1).toBe(1);
    expect(c.bearing).toBeCloseTo(Math.PI / 2, 9);
    expect(net.nodes.get("n1")!.flags & 1).toBe(0);
    expect(net.streets).toHaveLength(4);
    expect(net.streets[1]).toMatchObject({ a: c.id, b: net.nodes.get("e1")!.id, cls: 2, width: 17 });
    expect(net.streets[1].pts.slice(0, 6)).toEqual([0, 0, 0, 10, 0, 0]);
  });

  it("puts none where motorways and a trunk meet, or on a deck", () => {
    const ramps = [
      piece("m", "a", line(0, 0, 100, 0), { cls: 0 }),
      piece("b", "m", line(-100, 0, 0, 0), { cls: 0 }),
      piece("m", "c", line(0, 0, 0, 100), { cls: 1 }),
    ];
    expect(buildNetwork(ramps, flat(ramps), noDecks(ramps)).nodes.get("m")!.flags & 1).toBe(0);
    const pieces = crossing();
    const z = flat(pieces);
    z[0][0] = z[1][0] = z[2][10] = z[3][10] = 6.5;
    expect(buildNetwork(pieces, z, noDecks(pieces)).nodes.get("c")!.flags & 1).toBe(0);
  });

  it("gives a crosswalk near lights the phase it crosses with", () => {
    const pieces = [
      ...crossing(),
      walk("x0", "x1", line(-8, 12, 8, 12), true), // along the wide street: crosses the narrow one
      walk("y0", "y1", line(12, -8, 12, 8), true), // across it
      walk("z0", "z1", line(-8, 60, 8, 60), true), // too far from the lights
      walk("v0", "v1", line(-8, 14, 8, 14)), // a sidewalk, not a crosswalk
    ];
    const net = buildNetwork(pieces, flat(pieces), noDecks(pieces));
    expect(net.walks.map((w) => w.flags)).toEqual([1 | 2, 1 | 4, 1, 0]);
    expect(net.walks[0].a).toBe(net.nodes.get("x0")!.id);
  });

  it("flags links and one-way streets", () => {
    const pieces = [
      piece("a", "b", line(0, 0, 100, 0), { ow: 1 }),
      piece("b", "c", line(100, 0, 200, 0), { ow: -1 }),
      piece("c", "d", line(200, 0, 300, 0), { link: true }),
    ];
    expect(buildNetwork(pieces, flat(pieces), noDecks(pieces)).streets.map((s) => s.flags)).toEqual([
      2, 4, 1,
    ]);
  });

  it("files elevated ways where they are off the ground, with what the map holds up", () => {
    const pieces = [
      piece("a", "b", line(0, 0, 100, 0)),
      walk("c", "d", line(0, 50, 100, 50)),
      piece("e", "f", line(0, 90, 100, 90), { kind: "rail", cls: -1, width: 3.4 }),
    ];
    const z = flat(pieces);
    z[0].set([0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0]);
    z[2].set([0, 0, 0, 0, 0, 6.5, 0, 0, 0, 0, 0]);
    const net = buildNetwork(
      pieces,
      z,
      decksWhere(pieces, (e) => (e >= 50 ? 30 : null)),
    );
    expect(net.streets[0].flags & 8).toBe(8);
    expect(net.walks[0].flags & 8).toBe(0);
    expect(net.elevated).toHaveLength(2);
    const [road, rail] = net.elevated;
    expect(road.kind).toBe(0);
    expect(road.width).toBe(10);
    // one ground vertex either side of the stretch off the ground
    expect(road.pts.filter((_, i) => i % 3 === 0)).toEqual([20, 30, 40, 50, 60, 70, 80, 90]);
    expect(road.pts.filter((_, i) => i % 3 === 2)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect([...road.own]).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
    expect(rail.kind).toBe(2);
    expect(rail.pts.length / 3).toBe(3);
  });

  it("joins a tunnel's two portals", () => {
    const pieces = [
      piece("g0", "p1", line(-100, 0, 0, 0), { name: "Canal Street" }),
      piece("p1", "m", line(0, 0, 200, 0), { tunnel: true, name: "Holland Tunnel" }),
      piece("m", "p2", line(200, 0, 500, 0), { tunnel: true, name: "Holland Tunnel" }),
      piece("p2", "g3", line(500, 0, 600, 0)),
    ];
    const net = buildNetwork(pieces, flat(pieces), noDecks(pieces));
    expect(net.streets).toHaveLength(2);
    expect(net.nodes.has("m")).toBe(false);
    expect(net.tunnels).toHaveLength(1);
    const [t] = net.tunnels;
    expect(t.name).toBe("Holland Tunnel");
    expect(t.length).toBeCloseTo(500, 6);
    expect(t.a[0]).toBe(0);
    expect(t.a[1]).toBe(0);
    expect(t.a[2]).toBeCloseTo(Math.PI / 2, 9);
    expect(t.b![0]).toBe(500);
    expect(t.b![2]).toBeCloseTo((3 * Math.PI) / 2, 9);
    expect(net.nodes.get("p1")!.flags & 2).toBe(2);
    expect(net.nodes.get("p2")!.flags & 2).toBe(2);
    expect(net.nodes.get("g0")!.flags & 2).toBe(0);
  });

  it("closes a tunnel with one portal", () => {
    const pieces = [
      piece("g0", "p1", line(-100, 0, 0, 0)),
      piece("p1", "m", line(0, 0, 0, -200), { tunnel: true }),
      piece("m", "end", line(0, -200, 0, -500), { tunnel: true }),
    ];
    const net = buildNetwork(pieces, flat(pieces), noDecks(pieces));
    expect(net.tunnels).toHaveLength(1);
    expect(net.tunnels[0].b).toBeNull();
    expect(net.tunnels[0].a[2]).toBeCloseTo(Math.PI, 9);
    expect(net.tunnels[0].length).toBeCloseTo(500, 6);
  });

  it("numbers nodes the same way on every run, in the order they are met", () => {
    const pieces = [...crossing(), walk("x0", "c", line(-8, 12, 0, 0))];
    const a = buildNetwork(pieces, flat(pieces), noDecks(pieces));
    const b = buildNetwork(pieces, flat(pieces), noDecks(pieces));
    expect([...a.nodes.entries()]).toEqual([...b.nodes.entries()]);
    expect([...a.nodes.keys()]).toEqual(["c", "n1", "e1", "s1", "w1", "x0"]);
    expect([...a.nodes.values()].map((n) => n.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(a.walks[0].b).toBe(0);
  });
});
