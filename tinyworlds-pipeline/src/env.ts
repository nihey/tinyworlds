import path from "node:path";
import { fileURLToPath } from "node:url";

/** Settings that do not depend on which city is being drawn. Nothing here imports the cities. */
const here = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(here, "..");

export const TILE = 512;
/** Tiles are rendered in square blocks of this many tiles, so shadows and outlines cross tile edges. */
export const CHUNK_TILES = 4;

export const OVERTURE_RELEASE = process.env.OVERTURE_RELEASE ?? "2026-10-21.0";

/** Sent with every download. Deliberately generic: no contact details. */
export const USER_AGENT = "tinyworlds-pipeline/0.1";

/** Wikimedia asks API clients to say who they are: the project's public page, still no person. */
export const WIKI_USER_AGENT = "tinyworlds-pipeline/0.1 (https://github.com/nihey/tinyworlds)";
