import path from "node:path";
import { CITIES, DEFAULT_CITY, type City } from "./cities/index.js";
import { viewDeg } from "./cities/view.js";
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

/** Which way a city is drawn: true north up, or turned to its street grid (`City.view`). */
export type View = "north" | "grid";

/**
 * Which way this process draws the city: `--view <north|grid>` on the command line, else the
 * TINY_VIEW environment variable, else the city's own (`City.view`, north by default). A place
 * laid out on its own grid (a generated one) has no other view.
 */
export function pickView(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  city: Pick<City, "id" | "view" | "synthetic">,
): View {
  const flag = argv.findIndex((a) => a === "--view");
  const inline = argv.find((a) => a.startsWith("--view="));
  const asked = (flag >= 0 ? argv[flag + 1] : inline?.slice("--view=".length)) ?? env.TINY_VIEW;
  const own = city.view ?? "north";
  if (!asked) return own;
  if (asked !== "north" && asked !== "grid") throw new Error(`Unknown view "${asked}": north or grid`);
  if (asked !== own && city.synthetic) {
    throw new Error(`${city.id} is laid out on its own grid: it has no other view`);
  }
  return asked;
}

/**
 * Where a city's files are. Its own view keeps the places it always had; the other view has a
 * scene of its own (`scene-grid`) and a data folder inside the city's (`<out>/<city>/grid`),
 * which the viewer turns to.
 */
export function dataDirs(
  root: string,
  outRoot: string,
  city: Pick<City, "id" | "view">,
  view: View,
): { raw: string; scene: string; out: string } {
  const other = view !== (city.view ?? "north");
  return {
    raw: path.join(root, "data", city.id, "raw"),
    scene: path.join(root, "data", city.id, other ? `scene-${view}` : "scene"),
    out: other ? path.join(outRoot, city.id, view) : path.join(outRoot, city.id),
  };
}

export const CITY: City = activeCity();
export const VIEW: View = pickView(process.argv, process.env, CITY);
/** This process draws the city turned the other way from its own. */
export const OTHER_VIEW = VIEW !== (CITY.view ?? "north");
/** The bearing the map is turned to: the projection's β. */
export const VIEW_DEG = viewDeg({ gridDeg: CITY.gridDeg, view: VIEW });
// worker threads get a copy of the environment but not the command line
process.env.TINY_CITY = CITY.id;
process.env.TINY_VIEW = VIEW;

export const DIRS = dataDirs(
  PKG_ROOT,
  path.resolve(PKG_ROOT, process.env.TINY_OUT ?? "../tinyworlds-frontend/public/data"),
  CITY,
  VIEW,
);
