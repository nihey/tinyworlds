import {
  parseManifest,
  type Hood,
  type HoodsFile,
  type Manifest,
  type Place,
  type PlacesFile,
} from "./manifest";

import { activeStrings } from "@/i18n";
import type { Locale } from "@/i18n/locale";
import { WORLD } from "@/worlds";
import type { Flight, LifeFile } from "./life";
import { parseSights, parseSightTexts, type Sight, type SightTexts } from "./sights";
import { parseQuiz, type QuizQuestion } from "./quiz";

const trimSlashes = (value: string | undefined): string => (value ?? "").trim().replace(/\/+$/, "");

/**
 * Where a world's data folder is served from: NEXT_PUBLIC_DATA_BASE when it is set, otherwise
 * `<base path>/data/<world>`, which is where the pipeline writes it under public/.
 */
export function resolveDataBase(env: {
  dataBase?: string;
  basePath?: string;
  world: string;
}): string {
  return trimSlashes(env.dataBase) || `${trimSlashes(env.basePath)}/data/${env.world}`;
}

const DATA_BASE = resolveDataBase({
  dataBase: process.env.NEXT_PUBLIC_DATA_BASE,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
  world: WORLD.id,
});

/** URL of a file in the world's data folder, with the build id as a cache key. */
export function dataUrl(path: string, build?: string, dataBase = DATA_BASE): string {
  const url = `${dataBase}/${path.replace(/^\/+/, "")}`;
  return build ? `${url}?v=${encodeURIComponent(build)}` : url;
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(activeStrings().errors.answered(url, res.status));
  return res.json();
}

/** The manifest names the build, so it is the one file always revalidated with the server. */
export async function loadManifest(signal?: AbortSignal): Promise<Manifest> {
  return parseManifest(await getJson(dataUrl("manifest.json"), { cache: "no-cache", signal }));
}

export async function loadPlaces(build: string, signal?: AbortSignal): Promise<Place[]> {
  const file = (await getJson(dataUrl("places.json", build), { signal })) as Partial<PlacesFile>;
  if (!Array.isArray(file?.places)) throw new Error("places.json has no places");
  return file.places.filter(
    (p) => p && typeof p.n === "string" && Number.isFinite(p.lon) && Number.isFinite(p.lat),
  );
}

/** Keeps the flights of a life.json that can actually be flown; a data set without any is fine. */
export function parseFlights(value: unknown): Flight[] {
  if (!Array.isArray(value)) return [];
  const flights: Flight[] = [];
  for (const f of value as Partial<Flight>[]) {
    if (!f || (f.kind !== "helicopter" && f.kind !== "plane")) continue;
    const path = f.path;
    if (!Array.isArray(path) || path.length < 6 || path.length % 3 !== 0) continue;
    if (!path.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const positive = (n: unknown): number | undefined =>
      typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
    flights.push({
      kind: f.kind,
      path,
      loop: f.loop === true,
      speed: positive(f.speed),
      pause: typeof f.pause === "number" && f.pause >= 0 ? f.pause : undefined,
    });
  }
  return flights;
}

/** Routes for the life layer. Optional: an older data set simply has no ferries or flights. */
export async function loadLife(build: string, signal?: AbortSignal): Promise<LifeFile> {
  const file = (await getJson(dataUrl("life.json", build), { signal })) as Partial<LifeFile>;
  return {
    ferries: Array.isArray(file?.ferries) ? file.ferries.filter((f) => Array.isArray(f?.path)) : [],
    flights: parseFlights(file?.flights),
  };
}

/** A data file that may not exist: null for a 404, the parsed JSON otherwise. */
async function getOptionalJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(activeStrings().errors.answered(url, res.status));
  return res.json();
}

/** The structures that light up under the pointer. A data set without them has none. */
export async function loadSights(build: string, signal?: AbortSignal): Promise<Sight[]> {
  return parseSights(await getOptionalJson(dataUrl("sights.json", build), signal));
}

/** What Wikipedia says of the sights, in one interface language. None when the file is missing. */
export async function loadSightTexts(
  build: string,
  locale: Locale,
  signal?: AbortSignal,
): Promise<SightTexts> {
  return parseSightTexts(await getOptionalJson(dataUrl(`sights.${locale}.json`, build), signal));
}

/** Guess the building's questions in one interface language. None when the file is missing. */
export async function loadQuiz(
  build: string,
  locale: Locale,
  signal?: AbortSignal,
): Promise<QuizQuestion[]> {
  return parseQuiz(await getOptionalJson(dataUrl(`quiz.${locale}.json`, build), signal));
}

export async function loadHoods(build: string, signal?: AbortSignal): Promise<Hood[]> {
  const file = (await getJson(dataUrl("hoods.json", build), { signal })) as Partial<HoodsFile>;
  // an empty list is a legitimate answer: a city with no outlines to draw
  if (!Array.isArray(file?.hoods)) throw new Error("hoods.json has no hoods");
  return file.hoods.filter((h) => h && typeof h.name === "string" && Array.isArray(h.rings));
}
