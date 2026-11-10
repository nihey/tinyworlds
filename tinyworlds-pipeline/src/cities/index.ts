import { tinyfte } from "./tinyfte.js";
import { tinynyc } from "./tinynyc.js";
import { tinyorl } from "./tinyorl.js";
import { tinyrao } from "./tinyrao.js";
import { tinyvlc } from "./tinyvlc.js";
import type { City } from "./types.js";

export type { City } from "./types.js";

export const CITIES: Record<string, City> = { tinynyc, tinyrao, tinyorl, tinyfte, tinyvlc };
export const DEFAULT_CITY = "tinynyc";
