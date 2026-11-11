import { tinycos } from "./tinycos.js";
import { tinycvg } from "./tinycvg.js";
import { tinydal } from "./tinydal.js";
import { tinyfte } from "./tinyfte.js";
import { tinykingslanding } from "./tinykingslanding.js";
import { tinylas } from "./tinylas.js";
import { tinylax } from "./tinylax.js";
import { tinynyc } from "./tinynyc.js";
import { tinyphl } from "./tinyphl.js";
import { tinypit } from "./tinypit.js";
import { tinyorl } from "./tinyorl.js";
import { tinyrao } from "./tinyrao.js";
import { tinytkf } from "./tinytkf.js";
import { tinyvlc } from "./tinyvlc.js";
import { tinywesteros } from "./tinywesteros.js";
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
  tinylax,
  tinydal,
  tinycvg,
  tinypit,
  tinyphl,
  tinycos,
  tinytkf,
  tinywinterfell,
  tinykingslanding,
  tinywesteros,
};
export const DEFAULT_CITY = "tinynyc";
