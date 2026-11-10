import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT, WORLD_IDS, cutPlate, loadWorld } from "./lib/world.js";

/**
 * A look around each world's card framing, to choose where its loop may drift: twice the card
 * each way, with the card's own rectangle outlined. Written to out/context/ (never committed).
 *   npm run context [-- tinynyc tinyrao]
 */
const ids = process.argv.slice(2).length ? process.argv.slice(2) : WORLD_IDS;
const out = path.join(ROOT, "out/context");
fs.mkdirSync(out, { recursive: true });
for (const id of ids) {
  const world = loadWorld(id);
  const { x, y } = world.toMap(world.card.lon, world.card.lat);
  const plate = await cutPlate(world, { cx: x, cy: y, width: 2400, height: 1260, shrink: world.card.shrink });
  const outline = Buffer.from(
    `<svg width="2400" height="1260"><rect x="600" y="315" width="1200" height="630" fill="none" stroke="#ff0044" stroke-width="6"/></svg>`,
  );
  const file = path.join(out, `${id}.jpg`);
  // sharp composites after it resizes: outline the full plate first, then make it small
  const outlined = await sharp(await plate.png().toBuffer())
    .composite([{ input: outline }])
    .png()
    .toBuffer();
  await sharp(outlined).resize(1200).jpeg({ quality: 70 }).toFile(file);
  console.log(`context: ${path.relative(ROOT, file)} (shrink ${world.card.shrink})`);
}
