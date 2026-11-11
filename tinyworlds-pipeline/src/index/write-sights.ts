import fs from "node:fs";
import path from "node:path";
import { DuckDBBlobValue, DuckDBInstance } from "@duckdb/node-api";
import { CITY, DIRS } from "../config.js";
import { GeomKind, readWkb } from "../geom/wkb.js";
import type { Projection } from "../projection.js";
import { loadScene } from "../render/scene.js";
import { hashString } from "../scene/hash.js";
import type { Owners } from "../scene/owners.js";
import type { Place } from "./build.js";
import { resolveSights, toSightFile, type Candidate } from "./sights.js";
import { writeSprites } from "./sprites.js";
import { makeFinder, type Stands } from "./structures.js";

/**
 * sights.json: the search entries that name one structure, found in the scene, named, and
 * outlined as the map draws them; and each one's picture (`sights/`). `places` is the index in
 * its final order.
 */
export async function writeSights(opts: {
  places: Place[];
  proj: Projection;
  out: string;
  log: (m: string) => void;
}): Promise<void> {
  const { places, proj, out, log } = opts;
  const ownersFile = path.join(DIRS.scene, "owners.json");
  if (!fs.existsSync(ownersFile)) throw new Error("no owners.json beside the scene: run scene first");
  const owners = JSON.parse(fs.readFileSync(ownersFile, "utf8")) as Owners;
  const { scene } = loadScene(DIRS.scene);

  const raw = (name: string): string => path.join(DIRS.raw, name).replaceAll("'", "''");
  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  await conn.run("LOAD spatial;");

  // every named building, by the seed its volumes carry
  const ownNames = new Map<number, string>();
  for (const [id, name] of (
    await conn.runAndReadAll(
      `SELECT id, names."primary" FROM '${raw("building.parquet")}' WHERE names."primary" IS NOT NULL`,
    )
  ).getRows())
    ownNames.set(hashString(String(id)), String(name));

  // each stadium's grounds, and the stands in them
  const stands: Stands[] = [];
  for (const [wkb, ids] of (
    await conn.runAndReadAll(
      `SELECT any_value(ST_AsWKB(u.geometry)), list(b.id ORDER BY b.id)
       FROM '${raw("land_use.parquet")}' u JOIN '${raw("building.parquet")}' b
         ON ST_Contains(u.geometry, ST_PointOnSurface(b.geometry))
       WHERE u.class = 'stadium' AND b.class IN ('grandstand', 'stadium')
       GROUP BY u.id ORDER BY u.id`,
    )
  ).getRows()) {
    if (!(wkb instanceof DuckDBBlobValue)) continue;
    const g = readWkb(wkb.bytes);
    if (!g || g.kind !== GeomKind.Polygon) continue;
    const outer = g.parts[0][0];
    const ring: number[] = [];
    for (let i = 0; i < outer.length; i += 2) ring.push(...proj.toMap(outer[i], outer[i + 1]));
    const list = (ids as { items: unknown[] }).items.map((id) => hashString(String(id)));
    stands.push({ ring, seeds: list });
  }
  conn.closeSync();

  const candidates: Candidate[] = [];
  places.forEach((p, order) => {
    if (!p.src || (p.src === "curated" && !p.sight)) return;
    const { n, t, b, r, lon, lat, src, seed } = p;
    candidates.push({ n, t, b, r, lon, lat, order, src, seed });
  });

  const find = makeFinder(scene, owners, proj, stands, CITY.sights?.bridges ?? {});
  const drafts = resolveSights(candidates, find, (seed) => ownNames.get(seed));
  const file = toSightFile(drafts, scene);
  // each one drawn again on its own, so the viewer can show all of it when it lights up
  const volsOf = new Map(drafts.map((d) => [d.key, d.vols]));
  const sprites = await writeSprites({
    scene,
    sights: file.sights,
    volsOf: (id) => volsOf.get(id),
    out,
    log,
  });
  for (const s of file.sights) {
    const sprite = sprites.get(s.id);
    if (sprite) s.sprite = sprite;
  }
  fs.writeFileSync(path.join(out, "sights.json"), JSON.stringify(file));

  const byType: Record<string, number> = {};
  for (const s of file.sights) byType[s.t] = (byType[s.t] ?? 0) + 1;
  log(
    `index: ${file.sights.length} sights from ${candidates.length} candidates (` +
      Object.entries(byType)
        .map(([t, n]) => `${n} ${t}`)
        .join(", ") +
      ")",
  );
}
