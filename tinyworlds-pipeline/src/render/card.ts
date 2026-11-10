import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CITY, DIRS, PKG_ROOT } from "../config.js";
import { makeProjection } from "../projection.js";
import { binRect } from "./bin.js";
import { ChunkRenderer } from "./chunk.js";
import { toRgba } from "./encode.js";
import { loadScene } from "./scene.js";
import { CARD_SIGN_MARGIN, drawSign, hexRgb, signSize } from "./sign.js";

/**
 * The share card: the picture a link to the map unfurls with (Open Graph, 1200 × 630). A piece
 * of the map is rendered at full size, averaged down, and signed with the wordmark.
 */
export const CARD = { width: 1200, height: 630 } as const;

/** The page background by day: what shows where the map has dissolved into fog. */
const PAPER = "#e9e6df";

/** Draw the wordmark on a dark plate in the lower left: "tiny" in paper white, the city in its accent. */
function sign(rgb: Uint8Array, width: number, height: number): void {
  const put = (x: number, y: number, c: readonly number[]): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    rgb[i] = c[0];
    rgb[i + 1] = c[1];
    rgb[i + 2] = c[2];
  };
  const box = signSize(CITY.id);
  drawSign(put, CITY.id, hexRgb(CITY.accent), CARD_SIGN_MARGIN, height - CARD_SIGN_MARGIN - box.height);
}

export async function renderCard(opts: { out?: string; log?: (m: string) => void } = {}): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(
    opts.out ?? path.join(PKG_ROOT, "../tinyworlds-frontend/public/og", `${CITY.id}.jpg`),
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { lon, lat, shrink } = CITY.card;
  const { scene } = loadScene(DIRS.scene);
  const [cx, cy] = makeProjection(scene.geo).toMap(lon, lat);
  const w = CARD.width * shrink;
  const h = CARD.height * shrink;
  const rect = { x0: Math.round(cx - w / 2), y0: Math.round(cy - h / 2), w, h };
  const indices = new ChunkRenderer(scene).render(binRect(scene, rect));
  const rgba = toRgba(indices);
  if (!rgba) throw new Error("the card's rectangle is entirely in the fog");

  const small = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .flatten({ background: PAPER })
    .resize(CARD.width, CARD.height, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const rgb = new Uint8Array(small.buffer, small.byteOffset, small.length);
  sign(rgb, CARD.width, CARD.height);
  const info = await sharp(rgb, { raw: { width: CARD.width, height: CARD.height, channels: 3 } })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  log(
    `card: ${path.relative(process.cwd(), out)} ${CARD.width}×${CARD.height}, ${(info.size / 1000).toFixed(0)} kB`,
  );
}
