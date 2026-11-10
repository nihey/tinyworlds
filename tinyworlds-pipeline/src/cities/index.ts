import { tinyfte } from "./tinyfte.js";
import { tinykingslanding } from "./tinykingslanding.js";
import { tinylas } from "./tinylas.js";
import { tinynyc } from "./tinynyc.js";
import { tinyorl } from "./tinyorl.js";
import { tinyrao } from "./tinyrao.js";
import { tinyvlc } from "./tinyvlc.js";
import { tinywinterfell } from "./tinywinterfell.js";
import type { City } from "./types.js";

export type { City } from "./types.js";

export const CITIES: Record<string, City> = {
  tinynyc,
  tinyrao,
  tinyorl,
  tinyfte,
  tinyvlc,
  tinylas,
  tinywinterfell,
  tinykingslanding,
};
export const DEFAULT_CITY = "tinynyc";
