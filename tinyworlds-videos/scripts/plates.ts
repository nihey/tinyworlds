import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  CARD_SIGN_MARGIN,
  GLYPH_ROWS,
  INK,
  drawPlate,
  drawSign,
  drawText,
  hexRgb,
  signSize,
  textUnits,
  type Put,
  type SignLayout,
} from "../../tinyworlds-pipeline/src/render/sign.js";
import { CARD_DRIFT, FLYOVER_DRIFT, plateSize, type Drift } from "./lib/drift.js";
import { siteAddress } from "./lib/site.js";
import { ROOT, WORLD_IDS, cutPlate, loadWorld, type World } from "./lib/world.js";
import { HERO, SHOTS } from "./worlds.js";

/**
 * Cut what the drift compositions show, from the tiles: for each world a plate of map wide
 * enough for the whole lap, and its wordmark on a clear sheet. A card loop's sign is exactly
 * where the share card has it (so the loop opens on the very picture its card is); a flyover's
 * is larger and carries the site's address under it when one is known. Also writes the rows the
 * batch renders read.
 *   npm run plates [-- tinynyc tinyrao]
 */
type Row = Record<string, string | number>;

/** A clear sheet the size of the picture, to draw signs on. */
function sheet(drift: Drift): { put: Put; png: () => Promise<Buffer> } {
  const { width, height } = drift;
  const rgba = new Uint8Array(width * height * 4);
  return {
    put: (x, y, c) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = (y * width + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    },
    png: () =>
      sharp(rgba, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer(),
  };
}

/** The plate of map a lap needs: `centre` is the middle of the ellipse, in map px. */
async function mapPlate(
  world: World,
  drift: Drift,
  centre: { x: number; y: number },
  shrink: number,
  file: string,
) {
  const size = plateSize(drift);
  // never finer than the tiles: a plate of a close framing is simply less dense
  const density = Math.min(drift.density, shrink);
  const plate = await cutPlate(world, {
    cx: centre.x,
    cy: centre.y,
    width: Math.round(size.width * density),
    height: Math.round(size.height * density),
    shrink: shrink / density,
  });
  await plate.png({ compressionLevel: 6 }).toFile(file);
}

async function cardPlates(world: World, dir: string): Promise<Row> {
  const drift = CARD_DRIFT;
  const way = SHOTS[world.id]?.dir ?? -1;
  const { shrink } = world.card;
  const opening = world.toMap(world.card.lon, world.card.lat);
  // the ellipse lies to one side of the opening framing
  const centre = { x: opening.x + way * drift.a * shrink, y: opening.y };
  await mapPlate(world, drift, centre, shrink, path.join(dir, `${world.id}-card.png`));

  const { put, png } = sheet(drift);
  const box = signSize(world.id);
  drawSign(
    put,
    world.id,
    hexRgb(world.accent),
    CARD_SIGN_MARGIN,
    drift.height - CARD_SIGN_MARGIN - box.height,
  );
  fs.writeFileSync(path.join(dir, `${world.id}-card-sign.png`), await png());
  return {
    name: world.id,
    plate: `assets/plates/${world.id}-card.png`,
    sign: `assets/plates/${world.id}-card-sign.png`,
    dir: way,
  };
}

/** A flyover's sign: the wordmark larger than a card's and, under it, where the world lives. */
const FLYOVER_SIGN: SignLayout = { unit: 14, padX: 40, padTop: 31, padBottom: 22, corner: 6, shadow: 8 };
const FLYOVER_MARGIN = 54;
const ADDRESS_UNIT = 4;
const PAPER_DIM = [0xb4, 0xb1, 0xa8] as const;

async function flyoverPlates(world: World, dir: string, address: string | null): Promise<Row | null> {
  const shot = SHOTS[world.id]?.flyover;
  if (!shot) return null;
  const drift = FLYOVER_DRIFT;
  const centre = world.toMap(shot.lon ?? world.card.lon, shot.lat ?? world.card.lat);
  await mapPlate(world, drift, centre, shot.shrink, path.join(dir, `${world.id}.png`));

  const { put, png } = sheet(drift);
  const layout = FLYOVER_SIGN;
  const accent = hexRgb(world.accent);
  const line = address ? `${address}/${world.id}` : null;
  const lineH = line ? ADDRESS_UNIT * GLYPH_ROWS + 10 : 0;
  const word = signSize(world.id, layout);
  const width = Math.max(word.width, line ? textUnits(line) * ADDRESS_UNIT + layout.padX * 2 : 0);
  const height = word.height + lineH;
  const x = FLYOVER_MARGIN;
  const y = drift.height - FLYOVER_MARGIN - height;
  drawPlate(put, x, y, width, height, layout.corner, layout.shadow);
  drawText(put, world.id, x + layout.padX, y + layout.padTop, layout.unit, (i) => (i < 4 ? INK : accent));
  if (line) {
    const top = y + layout.padTop + GLYPH_ROWS * layout.unit + 4;
    drawText(put, line, x + layout.padX, top, ADDRESS_UNIT, () => PAPER_DIM);
  }
  fs.writeFileSync(path.join(dir, `${world.id}-sign.png`), await png());
  return {
    name: world.id,
    plate: `assets/plates/${world.id}.png`,
    sign: `assets/plates/${world.id}-sign.png`,
    a: drift.a,
    b: drift.b,
  };
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : WORLD_IDS;
const address = siteAddress();
const loopDir = path.join(ROOT, "loop/assets/plates");
const flyDir = path.join(ROOT, "flyover/assets/plates");
for (const dir of [loopDir, flyDir, path.join(ROOT, "loop/batch"), path.join(ROOT, "flyover/batch")])
  fs.mkdirSync(dir, { recursive: true });

const cards: Row[] = [];
const flyovers: Row[] = [];
for (const id of ids) {
  const world = loadWorld(id);
  cards.push(await cardPlates(world, loopDir));
  const flyover = await flyoverPlates(world, flyDir, address);
  if (flyover) flyovers.push(flyover);
  console.log(`plates: ${id} card${flyover ? " + flyover" : ""}`);
}
// the hero: its world's flyover on a smaller lap, reframed, with nothing drawn on it
fs.writeFileSync(path.join(flyDir, "blank-sign.png"), await sheet(FLYOVER_DRIFT).png());
const heroRows: Row[] = [];
const heroShot = SHOTS[HERO.world]?.flyover;
if (heroShot && ids.includes(HERO.world)) {
  const world = loadWorld(HERO.world);
  const spot = world.toMap(heroShot.lon ?? world.card.lon, heroShot.lat ?? world.card.lat);
  const centre = { x: spot.x + HERO.dx * heroShot.shrink, y: spot.y + HERO.dy * heroShot.shrink };
  await mapPlate(world, FLYOVER_DRIFT, centre, heroShot.shrink, path.join(flyDir, "hero.png"));
  heroRows.push({
    name: "hero",
    plate: "assets/plates/hero.png",
    sign: "assets/plates/blank-sign.png",
    a: HERO.a,
    b: HERO.b,
  });
}

// a run for some worlds only replaces their rows: the others keep theirs
const writeRows = (file: string, rows: Row[]): number => {
  const kept = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Row[]) : [];
  const byName = new Map([...kept, ...rows].map((row) => [row.name, row]));
  const order = [...WORLD_IDS, "hero"];
  const merged = [...byName.values()].sort(
    (x, y) => order.indexOf(String(x.name)) - order.indexOf(String(y.name)),
  );
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  return merged.length;
};
writeRows(path.join(ROOT, "loop/batch/cards.json"), cards);
writeRows(path.join(ROOT, "flyover/batch/flyovers.json"), flyovers);
writeRows(path.join(ROOT, "flyover/batch/hero.json"), heroRows);
console.log(
  `rows: ${cards.length} card loops, ${flyovers.length} flyovers${heroRows.length ? ", the hero" : ""}` +
    (address ? "" : " (no site address known: the flyovers carry the wordmark alone)"),
);
