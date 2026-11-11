// The pictures the API's mails show, as files of the site (public/email/), drawn pixel by pixel:
//   wordmark.png      "tiny" in white and "worlds" in taxi yellow, in Tiny5, on the band's dark: 2×
//   founding.png      the badges' pixel art, from the same maps as the site's own badges
//   first-stone.png   (src/components/benefactors/pixel-art.ts): 3×, nearest neighbour
//   keystone.png
// The files are committed; run this after changing the art or the wordmark:
//   npm run email-images          (Node 22.18 or later: it reads the art's .ts file)
// The mails show each picture at one CSS pixel per pixel of its art (the wordmark: three), so
// the files are sharp on screens of two and three device pixels per CSS pixel.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { PIXEL_ART } from "../src/components/benefactors/pixel-art.ts";

const OUT = new URL("../public/email/", import.meta.url);

/**
 * The letters of the wordmark in Tiny5, the site's pixel font, as its outlines fall on its own
 * grid (128 units a pixel): one string per row, from the dot of the i to the tail of the y.
 * Each letter keeps the column of space after it.
 */
const TINY5 = {
  t: ["...", "#..", "##.", "#..", "#..", ".#.", "..."],
  i: ["#.", "..", "#.", "#.", "#.", "#.", ".."],
  n: ["....", "....", "##..", "#.#.", "#.#.", "#.#.", "...."],
  y: ["....", "....", "#.#.", "#.#.", "#.#.", ".#..", "#..."],
  w: ["......", "......", "#.#.#.", "#.#.#.", ".#.#..", ".#.#..", "......"],
  o: ["....", "....", ".#..", "#.#.", "#.#.", ".#..", "...."],
  r: ["...", "...", "##.", "#..", "#..", "#..", "..."],
  l: ["..", "#.", "#.", "#.", "#.", "#.", ".."],
  d: ["....", "..#.", ".##.", "#.#.", "#.#.", ".##.", "...."],
  s: ["....", "....", ".##.", "##..", "..#.", "##..", "...."],
};

/**
 * The wordmark's colours: the site's paper white and its taxi yellow, on the mail's band. The
 * band's dark is in the picture itself, not left clear: a mail client that turns a light mail
 * dark (or a dark band light) recolours the band but not the picture, which would leave white
 * letters on white.
 */
const WORD_COLORS = { tiny: "#f4f2ec", worlds: "#f7c21b", band: "#15171a" };

/** The wordmark as pixel art: "tiny" in one colour, "worlds" in the other, the last space cut. */
function wordmark() {
  const palette = { a: WORD_COLORS.tiny, b: WORD_COLORS.worlds, ".": WORD_COLORS.band };
  const part = (word, key) =>
    TINY5.t.map((_, row) => [...word].map((ch) => TINY5[ch][row].replaceAll("#", key)).join(""));
  const tiny = part("tiny", "a");
  const worlds = part("worlds", "b");
  const rows = tiny.map((row, i) => (row + worlds[i]).slice(0, -1));
  return { palette, rows };
}

/** "#f7c21b" → [247, 194, 27]. */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** Pixel art scaled by a whole number, nearest neighbour, as an RGBA PNG: "." is clear. */
function png({ palette, rows }, scale) {
  const width = rows[0].length * scale;
  const height = rows.length * scale;
  // each row of the image: a filter byte (0: none), then RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const line = rows[Math.floor(y / scale)];
    const start = y * (width * 4 + 1);
    for (let x = 0; x < width; x++) {
      const color = palette[line[Math.floor(x / scale)]];
      if (!color) continue;
      const [r, g, b] = rgb(color);
      raw.set([r, g, b, 255], start + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits a channel, RGBA, deflate, no filter choice, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const FILES = {
  // three CSS pixels a pixel of the font, at 2×
  "wordmark.png": [wordmark(), 6],
  "founding.png": [PIXEL_ART.founding, 3],
  "first-stone.png": [PIXEL_ART.firstStone, 3],
  "keystone.png": [PIXEL_ART.keystone, 3],
};

mkdirSync(OUT, { recursive: true });
for (const [name, [art, scale]] of Object.entries(FILES)) {
  const file = png(art, scale);
  writeFileSync(new URL(name, OUT), file);
  const [w, h] = [art.rows[0].length * scale, art.rows.length * scale];
  console.log(`public/email/${name}: ${w}×${h}, ${file.length} bytes`);
}
