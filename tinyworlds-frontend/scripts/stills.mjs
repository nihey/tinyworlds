// The front page's pictures at the sizes it shows them, as files of the site (public/loops/):
//   card-<world>-400.webp, -800.webp    a world's share card (public/og/<world>.jpg), for its
//                                       card in the catalogue (shown 300 to 400 px wide)
//   hero[-<world>]-960.webp, -1280.webp  a hero film's first frame (public/loops/hero*.jpg), for
//                                       the hero's panorama
// and src/lib/hero-previews.json: each hero still in a few hundred bytes, which the front page's
// build bakes in under its first picture, blurred, while that picture loads.
//
// They are made from the pictures as they are (smaller, as WebP), never redrawn. The files are
// committed, like the loops; run this after a share card, a hero film or a world changes:
//   npm run stills
// The originals stay: the share cards are what link previews show, and the browser still takes
// the original where a screen is dense enough to want it (the `srcset`s in `src/site.ts`).
import { readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OG = new URL("../public/og/", import.meta.url);
const LOOPS = new URL("../public/loops/", import.meta.url);
const PREVIEWS = new URL("../src/lib/hero-previews.json", import.meta.url);

/** the widths of each kind, and how hard WebP may squeeze them */
const CARD_WIDTHS = [400, 800];
const HERO_WIDTHS = [960, 1280];
const QUALITY = 80;
/** a preview is this wide, and blurred on the page: its shapes and colours are all it needs */
const PREVIEW_WIDTH = 32;

/** the front page's own share card is not a world's */
const NOT_A_WORLD = new Set(["tinyworlds"]);

const sizes = async (src, name, widths) => {
  for (const width of widths) {
    const out = new URL(`${name}-${width}.webp`, LOOPS);
    const { size } = await sharp(src.pathname)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toFile(out.pathname);
    console.log(`${name}-${width}.webp`, `${Math.round(size / 1024)} kB`);
  }
};

for (const file of readdirSync(OG).sort()) {
  const world = /^(tiny[a-z0-9]+)\.jpg$/.exec(file)?.[1];
  if (!world || NOT_A_WORLD.has(world)) continue;
  await sizes(new URL(file, OG), `card-${world}`, CARD_WIDTHS);
}

const previews = {};
for (const file of readdirSync(LOOPS).sort()) {
  const name = /^(hero(?:-tiny[a-z0-9]+)?)\.jpg$/.exec(file)?.[1];
  if (!name) continue;
  const src = new URL(file, LOOPS);
  await sizes(src, name, HERO_WIDTHS);
  const tiny = await sharp(src.pathname)
    .resize({ width: PREVIEW_WIDTH })
    .webp({ quality: 50 })
    .toBuffer();
  previews[name] = `data:image/webp;base64,${tiny.toString("base64")}`;
}
writeFileSync(PREVIEWS, `${JSON.stringify(previews, null, 2)}\n`);
console.log(`${Object.keys(previews).length} previews in src/lib/hero-previews.json`);
