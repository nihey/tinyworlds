import sharp from 'sharp';

/** The box a mail shows a building's picture in, in pixels. */
export const MAIL_BOX = 110;

/** The box the PNG is drawn to: twice the mail's, for sharp screens. */
export const PICTURE_BOX = MAIL_BOX * 2;

/** What a file name must look like: a sprite's hash and `.png`. */
export const PICTURE_FILE = /^[a-z0-9]{1,16}\.png$/;

/** The most a source may weigh, in bytes. */
export const SOURCE_MAX_BYTES = 2_000_000;

const PIXELS_MAX = 25_000_000;

/** Where the site serves a sprite. */
export function spriteUrl(site: string, world: string, hash: string): string {
  return `${site}/${world}/data/sights/${hash}.webp`;
}

/** The hash in a sprite's `sights/<hash>.webp`, or null when it is not one. */
export function hashOfSprite(src: string): string | null {
  const found = /^sights\/([a-z0-9]{1,16})\.webp$/.exec(src);
  return found ? found[1] : null;
}

/** A size fitted inside a square box, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  box: number,
): { width: number; height: number } {
  const scale = Math.min(1, box / width, box / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A sprite (WebP) drawn as a PNG within PICTURE_BOX, never enlarged; null if it is no picture. */
export async function drawSightPicture(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input, { limitInputPixels: PIXELS_MAX, animated: false })
      .rotate()
      .timeout({ seconds: 5 })
      .resize({
        width: PICTURE_BOX,
        height: PICTURE_BOX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return null;
  }
}
