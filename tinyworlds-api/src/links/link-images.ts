import sharp from 'sharp';
import { isIco, readIco } from './ico.js';

/** A picture drawn again here, as WebP. */
export interface Drawn {
  bytes: Buffer;
  width: number;
  height: number;
}

/** A link's picture is cut to this, the shape of a share card (1.91 to 1) at twice a card's width. */
export const PICTURE_SIZE = { width: 480, height: 252 };

/** Smaller than this in either direction is not a picture: a spacer, a tracking pixel. */
export const PICTURE_MIN = { width: 120, height: 60 };

/** An icon's longest side. */
export const ICON_SIDE = 64;

/** The most pixels a source may have before it is refused unread (a decompression bomb). */
const PIXELS_MAX = 25_000_000;

/** How long drawing one picture may take, in seconds. */
const DRAW_SECONDS = 5;

/** The source opened: an `.ico` through this code, everything else by the image library. */
function open(input: Buffer): sharp.Sharp | null {
  const options = {
    limitInputPixels: PIXELS_MAX,
    // an animation's first frame
    animated: false,
    // a drawing (SVG) is rendered large enough to be cut down, not up
    density: 192,
  } as const;
  if (!isIco(input)) return sharp(input, options);
  const picture = readIco(input);
  if (!picture) return null;
  return 'png' in picture
    ? sharp(picture.png, options)
    : sharp(picture.rgba, {
        raw: { width: picture.width, height: picture.height, channels: 4 },
      });
}

async function draw(
  input: Buffer,
  shape: (image: sharp.Sharp) => sharp.Sharp,
): Promise<Drawn | null> {
  try {
    const image = open(input);
    if (!image) return null;
    const { data, info } = await shape(
      image.rotate().timeout({ seconds: DRAW_SECONDS }),
    ).toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    // not a picture, or one the library will not read: there is none
    return null;
  }
}

/**
 * A page's picture as the site shows it: cut to a share card's shape around its middle, never
 * enlarged, WebP. Null when the bytes are not a picture or it is too small to be one. The
 * result holds nothing of the source but its pixels (no metadata, no profile).
 */
export async function drawPicture(input: Buffer): Promise<Drawn | null> {
  try {
    const opened = open(input);
    if (!opened) return null;
    const { width = 0, height = 0 } = await opened.metadata();
    if (width < PICTURE_MIN.width || height < PICTURE_MIN.height) return null;
  } catch {
    return null;
  }
  return draw(input, (image) =>
    image
      .resize({ ...PICTURE_SIZE, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 76, effort: 5 }),
  );
}

/** A site's icon as the site shows it: within ICON_SIDE, never enlarged, lossless WebP. */
export function drawIcon(input: Buffer): Promise<Drawn | null> {
  return draw(input, (image) =>
    image
      .resize({
        width: ICON_SIDE,
        height: ICON_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ lossless: true, effort: 5 }),
  );
}
