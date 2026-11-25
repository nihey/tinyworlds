import { tinyaus } from "./tinyaus.js";
import { tinybeth } from "./tinybeth.js";
import { tinycos } from "./tinycos.js";
import { tinycvg } from "./tinycvg.js";
import { tinydal } from "./tinydal.js";
import { tinyfte } from "./tinyfte.js";
import { tinygtaiii } from "./tinygtaiii.js";
import { tinygtaiv } from "./tinygtaiv.js";
import { tinygtav } from "./tinygtav.js";
import { tinykingslanding } from "./tinykingslanding.js";
import { tinylas } from "./tinylas.js";
import { tinylax } from "./tinylax.js";
import { tinymke } from "./tinymke.js";
import { tinynyc } from "./tinynyc.js";
import { tinyphl } from "./tinyphl.js";
import { tinypit } from "./tinypit.js";
import { tinyorl } from "./tinyorl.js";
import { tinyrao } from "./tinyrao.js";
import { tinysfo } from "./tinysfo.js";
import { tinysanandreas } from "./tinysanandreas.js";
import { tinytkf } from "./tinytkf.js";
import { tinyvicecity } from "./tinyvicecity.js";
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
  tinyaus,
  tinysfo,
  tinymke,
  tinybeth,
  tinywinterfell,
  tinykingslanding,
  tinywesteros,
  tinygtaiii,
  tinyvicecity,
  tinysanandreas,
  tinygtaiv,
  tinygtav,
};
export const DEFAULT_CITY = "tinynyc";
