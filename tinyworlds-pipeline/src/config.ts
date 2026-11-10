import path from "node:path";
import { CITIES, DEFAULT_CITY, type City } from "./cities/index.js";
import { PKG_ROOT } from "./env.js";

export { CHUNK_TILES, OVERTURE_RELEASE, PKG_ROOT, TILE, USER_AGENT } from "./env.js";

/**
 * Which city this process draws. One process, one city: it is settled here, before anything else
 * runs, from `--city <id>` on the command line or the TINY_CITY environment variable, so the rest
 * of the code can treat the city as a constant (render workers see the same argv and environment).
 */
function activeCity(): City {
  const argv = process.argv;
  const flag = argv.findIndex((a) => a === "--city" || a === "-c");
  const inline = argv.find((a) => a.startsWith("--city="));
  const id =
    (flag >= 0 ? argv[flag + 1] : inline?.slice("--city=".length)) ?? process.env.TINY_CITY ?? DEFAULT_CITY;
  const city = CITIES[id];
  if (!city) throw new Error(`Unknown city "${id}". Known: ${Object.keys(CITIES).join(", ")}`);
  return city;
}

export const CITY: City = activeCity();
// worker threads get a copy of the environment but not the command line
process.env.TINY_CITY = CITY.id;

export const DIRS = {
  raw: path.join(PKG_ROOT, "data", CITY.id, "raw"),
  scene: path.join(PKG_ROOT, "data", CITY.id, "scene"),
  /** The viewer's data for this city. */
  out: path.resolve(PKG_ROOT, process.env.TINY_OUT ?? "../tinyworlds-frontend/public/data", CITY.id),
};
