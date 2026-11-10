import { tinynyc } from "./tinynyc.js";
import { tinyrao } from "./tinyrao.js";
import type { City } from "./types.js";

export type { City } from "./types.js";

export const CITIES: Record<string, City> = { tinynyc, tinyrao };
export const DEFAULT_CITY = "tinynyc";
