import fs from "node:fs";
import path from "node:path";
import { CITY, DIRS } from "../config.js";
import { makeGeo, makeProjection } from "../projection.js";
import { R } from "../render/palette.js";
import { buildFog, FOG } from "./fog.js";
import { mix } from "./hash.js";
import { Pattern, Roof } from "./kinds.js";
import { disc } from "./medieval.js";
import { LineSink, PolySink } from "./sinks.js";
import { f32, u32, u8, writeScene } from "./store.js";

/**
 * Cities with no map data. A real city's scene is read out of open data; a generated one is laid
 * out by a function (`City.synthetic`) that draws on a small builder, in the same street-grid
 * metres everything else uses: `p` runs up and to the right on screen, `q` down and to the right,
 * so the viewer stands at the +q, −p corner looking towards −q, +p.
 *
 * The generator runs twice, once for the scene and once for the index, so it must be
 * deterministic: hashes of positions and counters, never `Math.random`.
 */

/** Exactly how a volume looks: nothing is guessed for a generated city. */
export interface Look {
  wall: number;
  roof: number;
  /** Window colour (default: dark glass). */
  glass?: number;
  pattern?: Pattern;
  roofShape?: Roof;
  /** Height of the roof form within the total height, metres. */
  roofH?: number;
  /** Volume flags from scene/kinds.ts. */
  flags?: number;
}

export type SyntheticPlaceType =
  "borough" | "hood" | "landmark" | "park" | "bridge" | "museum" | "station" | "street" | "place";

export interface SyntheticPlace {
  n: string;
  t: SyntheticPlaceType;
  p: number;
  q: number;
  /** context line */
  b?: string;
  /** rank, higher first */
  r: number;
  /** zoom to arrive at */
  s?: number;
}

/** What a generator draws with. Rings and paths are flat `[p0, q0, p1, q1, …]` in metres. */
export interface SyntheticBuilder {
  /** A ground polygon of one kind (scene/kinds.ts): one ring, or an outer ring followed by holes. */
  ground(kind: number, rings: number[] | number[][]): void;
  /** A road, wall-walk, stream or quay: a path with a kind and a true width. `overWater` lets it cross water (a bridge). */
  line(kind: number, width: number, path: number[], overWater?: boolean): void;
  /** An extruded footprint from `base` to `height` metres above ground, the roof form included. */
  volume(corners: number[], height: number, base: number, look: Look): void;
  /** A regular prism: round towers, columns, tree trunks. */
  prism(p: number, q: number, radius: number, sides: number, height: number, base: number, look: Look): void;
  tree(p: number, q: number): void;
  /** What counts as the city: the fog (the edge of the map) is measured from these polygons. */
  limits(ring: number[]): void;
  /** Something to search for. */
  place(place: SyntheticPlace): void;
  /** An area the viewer can outline, also searchable. */
  hood(name: string, district: string, ring: number[]): void;
  /** A route a ship sails, there and back. */
  route(name: string, path: number[]): void;
}

interface Generated {
  ground: { kind: number; rings: number[][] }[];
  lines: { kind: number; width: number; path: number[]; overWater: boolean }[];
  volumes: { corners: number[]; height: number; base: number; look: Look }[];
  trees: number[];
  limits: number[][];
  places: SyntheticPlace[];
  hoods: { name: string; district: string; ring: number[] }[];
  routes: { name: string; path: number[] }[];
}

/** Run the active city's generator and collect what it draws. */
export function generate(): Generated {
  if (!CITY.synthetic) throw new Error(`${CITY.id} is not a generated city`);
  const out: Generated = {
    ground: [],
    lines: [],
    volumes: [],
    trees: [],
    limits: [],
    places: [],
    hoods: [],
    routes: [],
  };
  const builder: SyntheticBuilder = {
    ground(kind, rings) {
      const list = (typeof rings[0] === "number" ? [rings as number[]] : (rings as number[][])).filter(
        (ring) => ring.length >= 6,
      );
      if (list.length > 0) out.ground.push({ kind, rings: list });
    },
    line(kind, width, pathPoints, overWater = false) {
      if (pathPoints.length >= 4) out.lines.push({ kind, width, path: pathPoints, overWater });
    },
    volume(corners, height, base, look) {
      if (corners.length >= 6 && height - base >= 0.3) out.volumes.push({ corners, height, base, look });
    },
    prism(p, q, radius, sides, height, base, look) {
      builder.volume(disc(p, q, radius, sides), height, base, look);
    },
    tree(p, q) {
      out.trees.push(p, q);
    },
    limits(ring) {
      out.limits.push(ring);
    },
    place(place) {
      out.places.push(place);
    },
    hood(name, district, ring) {
      out.hoods.push({ name, district, ring });
    },
    route(name, pathPoints) {
      out.routes.push({ name, path: pathPoints });
    },
  };
  CITY.synthetic(builder);
  if (out.limits.length === 0) throw new Error(`${CITY.id}: the generator set no limits`);
  return out;
}

const geoOf = () => makeGeo(CITY.origin.lon, CITY.origin.lat, CITY.betaDeg, CITY.k);

/** The scene of a generated city: the same arrays a real city's scene has, straight from the generator. */
export async function buildSyntheticScene(opts: { log?: (msg: string) => void } = {}): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const started = Date.now();
  const geo = geoOf();
  const proj = makeProjection(geo);
  const k = geo.k;
  const gen = generate();

  const lonLat = (p: number, q: number): [number, number] => proj.toLonLat(...proj.gridToMap(p, q));
  const toPairs = (ring: number[]): number[][] => {
    const pairs: number[][] = [];
    for (let i = 0; i < ring.length; i += 2) pairs.push(lonLat(ring[i], ring[i + 1]));
    return pairs;
  };
  const fog = buildFog(
    gen.limits.map((ring) => [toPairs(ring)]),
    proj,
  );

  const toMap = (flat: number[]): Float64Array => {
    const map = new Float64Array(flat.length);
    for (let i = 0; i < flat.length; i += 2) {
      map[i] = (flat[i] + flat[i + 1]) * k;
      map[i + 1] = ((flat[i + 1] - flat[i]) * k) / 2;
    }
    return map;
  };

  const ground = new PolySink();
  const groundKind = u8();
  for (const g of gen.ground) {
    ground.begin();
    for (const ring of g.rings) ground.ring(toMap(ring), ring.length / 2);
    ground.end();
    groundKind.push(g.kind);
  }

  const lines = new LineSink();
  for (const l of gen.lines)
    lines.add(toMap(l.path), l.path.length / 2, l.kind, l.width, l.overWater ? 1 : 0);

  const volumes = new PolySink();
  const vol = {
    base: f32(),
    top: f32(),
    roofH: f32(),
    roofShape: u8(),
    wall: u8(),
    roof: u8(),
    glass: u8(),
    pattern: u8(),
    flags: u8(),
    seed: u32(),
    ridge: f32(),
    center: f32(),
    area: f32(),
  };
  gen.volumes.forEach((v, index) => {
    const n = v.corners.length / 2;
    const map = toMap(v.corners);
    let cx = 0;
    let cy = 0;
    let area = 0;
    let longest = 0;
    let ridgeX = 1;
    let ridgeY = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      cx += map[i * 2] / n;
      cy += map[i * 2 + 1] / n;
      area += v.corners[i * 2] * v.corners[j * 2 + 1] - v.corners[j * 2] * v.corners[i * 2 + 1];
      const len =
        (v.corners[j * 2] - v.corners[i * 2]) ** 2 + (v.corners[j * 2 + 1] - v.corners[i * 2 + 1]) ** 2;
      if (len > longest) {
        longest = len;
        ridgeX = map[j * 2] - map[i * 2];
        ridgeY = map[j * 2 + 1] - map[i * 2 + 1];
      }
    }
    const look = v.look;
    const roofShape = look.roofShape ?? Roof.Flat;
    const roofH = roofShape === Roof.Flat || roofShape === Roof.Deck ? 0 : Math.max(0, look.roofH ?? 0);
    const wallTop = Math.max(v.base + 0.3, v.height - roofH);
    volumes.begin();
    volumes.ring(map, n);
    volumes.end();
    vol.base.push(proj.rise(v.base));
    vol.top.push(proj.rise(wallTop));
    vol.roofH.push(proj.rise(v.height - wallTop));
    vol.roofShape.push(roofShape);
    vol.wall.push(look.wall);
    vol.roof.push(look.roof);
    vol.glass.push(look.glass ?? R.glassDark);
    vol.pattern.push(look.pattern ?? Pattern.None);
    vol.flags.push(look.flags ?? 0);
    vol.seed.push(mix(index, 0x51ed270b));
    const ridgeLen = Math.hypot(ridgeX, ridgeY) || 1;
    vol.ridge.push2(ridgeX / ridgeLen, ridgeY / ridgeLen);
    vol.center.push2(cx, cy);
    vol.area.push(Math.max(4.1, Math.abs(area / 2)));
  });

  const treeXY = f32();
  const treeKind = u8();
  for (let i = 0; i < gen.trees.length; i += 2) {
    const p = gen.trees[i];
    const q = gen.trees[i + 1];
    treeXY.push2((p + q) * k, ((q - p) * k) / 2);
    treeKind.push(mix(i, 99) & 0xff);
  }

  // bounds: everything the fog keeps
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let gy = 0; gy < fog.rows; gy++) {
    for (let gx = 0; gx < fog.cols; gx++) {
      if (fog.d[gy * fog.cols + gx] >= FOG.end) continue;
      const [x, y] = proj.gridToMap(fog.p0 + (gx + 0.5) * fog.cell, fog.q0 + (gy + 0.5) * fog.cell);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pad = fog.cell * k * 2;
  let bounds = {
    minX: Math.floor(minX - pad),
    minY: Math.floor(minY - pad),
    maxX: Math.ceil(maxX + pad),
    maxY: Math.ceil(maxY + pad),
  };
  // a framed world ends exactly at the rectangle its limits span on screen
  let clip: typeof bounds | undefined;
  if (CITY.framed) {
    clip = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const ring of gen.limits) {
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = proj.gridToMap(ring[i], ring[i + 1]);
        clip.minX = Math.min(clip.minX, Math.round(x));
        clip.maxX = Math.max(clip.maxX, Math.round(x));
        clip.minY = Math.min(clip.minY, Math.round(y));
        clip.maxY = Math.max(clip.maxY, Math.round(y));
      }
    }
    bounds = clip;
  }

  const none32 = u32();
  none32.push(0);
  writeScene(
    DIRS.scene,
    {
      ...ground.arrays("ground"),
      "ground.kind": groundKind.finish(),
      ...lines.arrays("lines"),
      ...volumes.arrays("vol"),
      "vol.base": vol.base.finish(),
      "vol.top": vol.top.finish(),
      "vol.roofH": vol.roofH.finish(),
      "vol.roofShape": vol.roofShape.finish(),
      "vol.wall": vol.wall.finish(),
      "vol.roof": vol.roof.finish(),
      "vol.glass": vol.glass.finish(),
      "vol.pattern": vol.pattern.finish(),
      "vol.flags": vol.flags.finish(),
      "vol.seed": vol.seed.finish(),
      "vol.ridge": vol.ridge.finish(),
      "vol.center": vol.center.finish(),
      "vol.area": vol.area.finish(),
      // no bridges with cables in a generated city
      "cab.start": none32.finish(),
      "cab.xyz": f32().finish(),
      "cab.kind": u8().finish(),
      "cab.bbox": f32().finish(),
      "trees.xy": treeXY.finish(),
      "trees.kind": treeKind.finish(),
      "fog.d": fog.d,
    },
    {
      geo,
      bounds,
      ...(clip ? { clip } : {}),
      flora: CITY.flora,
      fog: {
        p0: fog.p0,
        q0: fog.q0,
        cell: fog.cell,
        cols: fog.cols,
        rows: fog.rows,
        start: FOG.start,
        end: FOG.end,
      },
      counts: {
        ground: ground.count,
        lines: lines.count,
        volumes: volumes.count,
        trees: treeKind.length,
      },
    },
  );
  log(
    `scene: generated ${ground.count} ground polygons, ${lines.count} lines, ${volumes.count} volumes, ` +
      `${treeKind.length} trees (${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  log(
    `scene: written to ${path.relative(process.cwd(), DIRS.scene)} — map is ${bounds.maxX - bounds.minX} × ${bounds.maxY - bounds.minY} px`,
  );
}

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/** The viewer's indexes for a generated city: its places, outlined areas and ship routes, as the generator named them. */
export async function buildSyntheticIndex(
  opts: { out?: string; log?: (m: string) => void } = {},
): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(opts.out ?? DIRS.out);
  fs.mkdirSync(out, { recursive: true });
  const proj = makeProjection(geoOf());
  const gen = generate();
  const lonLat = (p: number, q: number): [number, number] => {
    const [lon, lat] = proj.toLonLat(...proj.gridToMap(p, q));
    return [round5(lon), round5(lat)];
  };
  const flat = (points: number[]): number[] => {
    const res: number[] = [];
    for (let i = 0; i < points.length; i += 2) res.push(...lonLat(points[i], points[i + 1]));
    return res;
  };

  const seen = new Set<string>();
  const places: { n: string; t: string; lon: number; lat: number; b?: string; r: number; s?: number }[] = [];
  const add = (place: SyntheticPlace): void => {
    const key = `${place.n.toLowerCase()}|${place.b ?? ""}`;
    if (!place.n || seen.has(key)) return;
    seen.add(key);
    const [lon, lat] = lonLat(place.p, place.q);
    places.push({
      n: place.n,
      t: place.t,
      lon,
      lat,
      ...(place.b ? { b: place.b } : {}),
      r: place.r,
      ...(place.s !== undefined ? { s: place.s } : {}),
    });
  };
  for (const place of gen.places) add(place);

  const hoods = gen.hoods.map((hood) => {
    let p = 0;
    let q = 0;
    const n = hood.ring.length / 2;
    for (let i = 0; i < n; i++) {
      p += hood.ring[i * 2] / n;
      q += hood.ring[i * 2 + 1] / n;
    }
    add({ n: hood.name, t: "hood", p, q, b: hood.district, r: 60 });
    const [lon, lat] = lonLat(p, q);
    return { name: hood.name, borough: hood.district, lon, lat, rings: [flat(hood.ring)] };
  });

  const ferries = gen.routes.map((route) => ({ name: route.name, path: flat(route.path) }));
  const flights = CITY.flights.map((flight) => ({
    kind: flight.kind,
    loop: flight.loop,
    ...(flight.speed !== undefined ? { speed: flight.speed } : {}),
    ...(flight.pause !== undefined ? { pause: flight.pause } : {}),
    path: flight.path.flatMap(([lon, lat, alt]) => [round5(lon), round5(lat), alt]),
  }));

  places.sort((a, b) => b.r - a.r || a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(out, "places.json"), JSON.stringify({ places }));
  fs.writeFileSync(path.join(out, "hoods.json"), JSON.stringify({ hoods }));
  fs.writeFileSync(path.join(out, "life.json"), JSON.stringify({ ferries, flights }));
  log(
    `index: ${places.length} places, ${hoods.length} outlined areas, ${ferries.length} ship routes (generated)`,
  );
}
