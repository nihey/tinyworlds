import { bitAt, decodeBitset } from "../map/bitset";
import { WalkDataError } from "./format";
import { CELL, type WalkGeo } from "./geo";

export interface WalkIndex {
  v: 1;
  cell: number;
  i0: number;
  j0: number;
  cols: number;
  rows: number;
  /** base64 bitset, bit (i − i0) + (j − j0)·cols, LSB-first: the square's file exists */
  cells: string;
  geo: WalkGeo;
  /** the street grid's bearing for paving (the city file's gridDeg, whichever way the map is turned) */
  gridDeg: number;
  sunDeg: number;
  /** RAMP_COUNT × 6 shades × 3 bytes */
  palette: { names: string[]; rgb: number[] };
  paintRank: number[];
  /** portals [e, n, heading into the tunnel (rad, from north, clockwise)]; b null: closed by a barrier */
  tunnels: {
    name: string;
    a: [number, number, number];
    b: [number, number, number] | null;
    length: number;
  }[];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isNums = (x: unknown, n?: number): x is number[] =>
  Array.isArray(x) && (n === undefined || x.length === n) && x.every(isNum);

function num(o: Record<string, unknown>, key: string): number {
  const x = o[key];
  if (!isNum(x)) throw new WalkDataError(`walk.json: ${key} is not a number`);
  return x;
}

function triple(x: unknown, where: string): [number, number, number] {
  if (!isNums(x, 3)) throw new WalkDataError(`walk.json: ${where} is not three numbers`);
  return [x[0], x[1], x[2]];
}

/** Checks the shape of `walk.json`; throws `WalkDataError` saying what is wrong. */
export function parseWalkIndex(json: unknown): WalkIndex {
  if (!isObj(json)) throw new WalkDataError("walk.json: not an object");
  if (json.v !== 1) throw new WalkDataError("walk.json: unknown version");
  if (typeof json.cells !== "string") throw new WalkDataError("walk.json: cells is not a string");

  const g = json.geo;
  if (!isObj(g)) throw new WalkDataError("walk.json: geo is missing");
  const geo: WalkGeo = {
    lon0: num(g, "lon0"),
    lat0: num(g, "lat0"),
    betaDeg: num(g, "betaDeg"),
    k: num(g, "k"),
    kz: num(g, "kz"),
  };

  const p = json.palette;
  if (!isObj(p)) throw new WalkDataError("walk.json: palette is missing");
  if (!Array.isArray(p.names) || !p.names.every((s) => typeof s === "string")) {
    throw new WalkDataError("walk.json: palette names are not strings");
  }
  if (!isNums(p.rgb) || p.rgb.length !== p.names.length * 18) {
    throw new WalkDataError("walk.json: palette rgb is not names x 18 numbers");
  }

  if (!isNums(json.paintRank)) throw new WalkDataError("walk.json: paintRank is not numbers");
  if (!Array.isArray(json.tunnels)) throw new WalkDataError("walk.json: tunnels is not an array");
  const tunnels = json.tunnels.map((t: unknown, n) => {
    if (!isObj(t) || typeof t.name !== "string")
      throw new WalkDataError(`walk.json: tunnel ${n} is malformed`);
    return {
      name: t.name,
      a: triple(t.a, `tunnel ${n} a`),
      b: t.b === null ? null : triple(t.b, `tunnel ${n} b`),
      length: num(t, "length"),
    };
  });

  // the squares' size is the code's as much as the data's (`CELL`): one that disagrees is refused
  if (num(json, "cell") !== CELL)
    throw new WalkDataError(`walk.json: squares of ${json.cell} m, not ${CELL}`);
  return {
    v: 1,
    cell: CELL,
    i0: num(json, "i0"),
    j0: num(json, "j0"),
    cols: num(json, "cols"),
    rows: num(json, "rows"),
    cells: json.cells,
    geo,
    gridDeg: num(json, "gridDeg"),
    sunDeg: num(json, "sunDeg"),
    palette: { names: p.names as string[], rgb: p.rgb },
    paintRank: json.paintRank,
    tunnels,
  };
}

const decoded = new WeakMap<WalkIndex, Uint8Array>();

/** Whether the square (i, j) has a file. False outside the grid. */
export function cellExists(ix: WalkIndex, i: number, j: number): boolean {
  const x = i - ix.i0;
  const y = j - ix.j0;
  if (x < 0 || y < 0 || x >= ix.cols || y >= ix.rows) return false;
  let bits = decoded.get(ix);
  if (!bits) decoded.set(ix, (bits = decodeBitset(ix.cells)));
  return bitAt(bits, x + y * ix.cols);
}
