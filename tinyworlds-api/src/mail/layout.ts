import type { Locale } from '../donations/locales.js';
import { escapeHtml, type Markup } from './html.js';

/**
 * The pieces every tinyworlds mail is made of, in the site's own look: a dark band with the
 * pixel wordmark under a taxi-yellow bar, a white card on paper, yellow pill buttons, the pixel
 * badges, and a short footer. All of it is tables and inline styles, which is what mail clients
 * read, and it holds from 320 to 600 pixels wide. Each function answers HTML; every text it is
 * given is escaped here, and only `Markup` (already escaped) goes in as it is.
 */

export const COLORS = {
  ink: '#15171a',
  paper: '#f4f2ec',
  dim: '#6b6d68',
  taxi: '#f7c21b',
  taxiInk: '#1a1503',
  line: '#ece9e1',
  empty: '#e4e1d8',
  laid: '#c9c5b8',
  bandLabel: '#a4a6a1',
  badge: '#2a2311',
  badgeEdge: '#7a5d0c',
} as const;

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "Menlo,Consolas,'Courier New',monospace";

/** Where the mails' pictures are: the site's own files (tinyworlds-frontend/public/email/). */
export const emailImage = (site: string, file: string): string =>
  `${site}/email/${file}`;

const attr = escapeHtml;

const table = (inner: string, style = '', extra = ''): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${extra} style="border-collapse:collapse;${style}">${inner}</table>`;

/**
 * Outlook on Windows draws with Word, which knows no max-width: a table of a fixed width that
 * only it reads ("ghost table") keeps the card at 560 px there instead of the window's width.
 */
const OUTLOOK_OPEN =
  '<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->';
const OUTLOOK_CLOSE = '<!--[if mso]></td></tr></table><![endif]-->';

/**
 * An empty cell of a given height, in every client: Outlook makes an empty cell at least a line
 * tall, so its line is set to the cell's height exactly, in a font of one pixel.
 */
const emptyCell = (px: number): string =>
  `font-size:1px;mso-line-height-rule:exactly;line-height:${px}px;`;

export interface ShellOptions {
  locale: Locale;
  /** The mail's subject, as its document title. */
  title: string;
  /** The line an inbox shows after the subject. */
  preheader: string;
  /** The site's origin, for the wordmark. */
  site: string;
  /** The word on the band's right: "Thank you", "Sign in". */
  label: string;
  /** A picture under the band, the full width of the card. */
  hero?: { src: string; alt: string; width: number; height: number };
  /** The card's content. */
  body: string;
  /** The lines under the card: why the person got the mail. */
  footer: string[];
}

/** The whole mail: band, card and footer, with the preheader hidden at the top. */
export function shell(options: ShellOptions): string {
  const { site, hero } = options;
  const band = `<tr><td bgcolor="${COLORS.ink}" style="background:${COLORS.ink};border-top:4px solid ${COLORS.taxi};padding:14px 20px 12px;">${table(
    `<tr><td style="vertical-align:middle;"><img src="${attr(emailImage(site, 'wordmark.png'))}" width="105" height="21" alt="tinyworlds" style="display:block;border:0;outline:none;color:${COLORS.taxi};font:bold 18px/21px ${FONT};"></td>` +
      `<td align="right" style="vertical-align:middle;color:${COLORS.bandLabel};font:600 11px/1.3 ${FONT};letter-spacing:.12em;text-transform:uppercase;">${escapeHtml(options.label)}</td></tr>`,
    '',
    ' width="100%"',
  )}</td></tr>`;
  const picture = hero
    ? `<tr><td style="padding:0;font-size:0;line-height:0;"><img src="${attr(hero.src)}" width="${hero.width}" height="${hero.height}" alt="${attr(hero.alt)}" style="display:block;width:100%;max-width:${hero.width}px;height:auto;border:0;outline:none;color:${COLORS.dim};font:14px/1.4 ${FONT};"></td></tr>`
    : '';
  const card = table(
    band +
      picture +
      `<tr><td style="padding:22px 20px 24px;font-family:${FONT};color:${COLORS.ink};">${options.body}</td></tr>`,
    'width:100%;',
    ' width="100%"',
  );
  const footer = options.footer.map(escapeHtml).join('<br>');
  // padding after the preheader keeps the inbox from showing the start of the body after it
  const filler = '&#847;&zwnj;&nbsp;'.repeat(60);
  return [
    '<!doctype html>',
    `<html lang="${attr(options.locale)}">`,
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(options.title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${COLORS.paper};-webkit-text-size-adjust:100%;">`,
    `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.paper};">${escapeHtml(options.preheader)}${filler}</div>`,
    table(
      `<tr><td align="center" style="padding:24px 10px 28px;">${OUTLOOK_OPEN}${table(
        // the card's corners clip the band and its yellow bar, where the client allows it
        `<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;overflow:hidden;">${card}</td></tr>` +
          `<tr><td align="center" style="padding:14px 8px 0;font:12px/1.5 ${FONT};color:${COLORS.dim};">${footer}</td></tr>`,
        'width:100%;max-width:560px;',
        ' width="100%"',
      )}${OUTLOOK_CLOSE}</td></tr>`,
      `background:${COLORS.paper};`,
      ` width="100%" bgcolor="${COLORS.paper}"`,
    ),
    '</body></html>',
  ].join('\n');
}

/** The card's heading. */
export const heading = (text: string): string =>
  `<h1 style="margin:0 0 10px;font:700 22px/1.25 ${FONT};color:${COLORS.ink};">${escapeHtml(text)}</h1>`;

/** A paragraph of the card; `muted` is the small grey kind. */
export const paragraph = (content: Markup, muted = false): string =>
  muted
    ? `<p style="margin:0 0 10px;font:12.5px/1.5 ${FONT};color:${COLORS.dim};">${content.html}</p>`
    : `<p style="margin:0 0 12px;font:14px/1.55 ${FONT};color:${COLORS.ink};">${content.html}</p>`;

export interface Button {
  label: string;
  href: string;
  /** The outlined kind, for the second button. */
  ghost?: boolean;
}

/** One button: a pill, yellow or outlined. Inline, so two wrap onto two lines when narrow. */
export function button({ label, href, ghost = false }: Button): string {
  const look = ghost
    ? `background:#ffffff;color:${COLORS.ink};border:2px solid ${COLORS.ink};padding:9px 18px;`
    : `background:${COLORS.taxi};color:${COLORS.taxiInk};border:2px solid ${COLORS.taxi};padding:9px 20px;`;
  return `<a href="${attr(href)}" style="display:inline-block;${look}border-radius:999px;font:700 14px/20px ${FONT};text-decoration:none;margin:0 8px 8px 0;">${escapeHtml(label)}</a>`;
}

/** A `mailto:` link that opens a mail to a friend, with its subject and body filled in. */
export const mailto = (subject: string, body: string): string =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** A row of buttons. */
export const buttons = (list: Button[]): string =>
  `<p style="margin:18px 0 4px;">${list.map(button).join('')}</p>`;

export type BadgeArt = 'founding' | 'first-stone' | 'keystone';

/** Each badge picture's size in CSS pixels: one per pixel of its art (the files are 3×). */
const BADGE_SIZE: Record<BadgeArt, [number, number]> = {
  founding: [12, 12],
  'first-stone': [16, 18],
  keystone: [16, 14],
};

/**
 * A badge: its pixel art and its words, yellow on dark. The words are the badge's text, so a
 * mail with its pictures blocked still says it; the picture is decoration beside them.
 */
export function badge(site: string, label: string, art?: BadgeArt): string {
  const picture = art
    ? `<img src="${attr(emailImage(site, `${art}.png`))}" width="${BADGE_SIZE[art][0]}" height="${BADGE_SIZE[art][1]}" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;margin:0 6px 0 0;">`
    : '';
  return `<span style="display:inline-block;margin:2px 6px 4px 0;padding:3px 8px 3px ${art ? 5 : 8}px;background:${COLORS.badge};border:1px solid ${COLORS.badgeEdge};color:${COLORS.taxi};font:bold 11px/18px ${MONO};letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;vertical-align:middle;">${picture}<span style="vertical-align:middle;">${escapeHtml(label)}</span></span>`;
}

/** A line of badges. */
export const badges = (list: string[]): string =>
  list.length ? `<div style="margin:4px 0 6px;">${list.join('')}</div>` : '';

/** How a stone is drawn: the reader's, someone else's, or still to be laid. */
export type StoneState = 'mine' | 'laid' | null;

const STONE_PX = 22;
const STONES_PER_ROW = 10;

/** A city's stones, ten to a row: the reader's lit yellow, others' grey, the rest empty. */
export function stonesGrid(stones: StoneState[]): string {
  const cell = (state: StoneState) => {
    const color =
      state === 'mine'
        ? COLORS.taxi
        : state === 'laid'
          ? COLORS.laid
          : COLORS.empty;
    const lit =
      state === 'mine' ? 'box-shadow:inset 0 -2px 0 rgba(0,0,0,.18);' : '';
    return `<td width="${STONE_PX}" height="${STONE_PX}" bgcolor="${color}" style="width:${STONE_PX}px;height:${STONE_PX}px;background:${color};border-radius:2px;${lit}${emptyCell(STONE_PX)}">&nbsp;</td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < stones.length; i += STONES_PER_ROW)
    rows.push(
      `<tr>${stones
        .slice(i, i + STONES_PER_ROW)
        .map(cell)
        .join('')}</tr>`,
    );
  return `<table role="presentation" cellpadding="0" cellspacing="3" border="0" style="border-collapse:separate;margin:10px 0 4px -3px;">${rows.join('')}</table>`;
}

/** A progress bar, `fraction` of it yellow (0 to 1). */
export function progressBar(fraction: number): string {
  const share = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const bar = (width: number, color: string, radius: string) =>
    `<td width="${width}%" height="8" bgcolor="${color}" style="width:${width}%;height:8px;background:${color};border-radius:${radius};${emptyCell(8)}">&nbsp;</td>`;
  const cells =
    share >= 100
      ? bar(100, COLORS.taxi, '99px')
      : share <= 0
        ? bar(100, COLORS.empty, '99px')
        : bar(share, COLORS.taxi, '99px 0 0 99px') +
          bar(100 - share, COLORS.empty, '0 99px 99px 0');
  return table(
    `<tr>${cells}</tr>`,
    'width:100%;margin:8px 0 6px;',
    ' width="100%"',
  );
}

/** Facts as label and value, under a thin line. */
export function facts(rows: [label: string, value: string][]): string {
  const body = rows
    .map(
      ([label, value], i) =>
        `<tr><td style="padding:${i ? 4 : 10}px 14px 0 0;width:1%;white-space:nowrap;vertical-align:top;font:13px/1.45 ${FONT};color:${COLORS.dim};">${escapeHtml(label)}</td>` +
        `<td style="padding:${i ? 4 : 10}px 0 0;vertical-align:top;font:600 13px/1.45 ${FONT};color:${COLORS.ink};">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return table(
    body,
    `width:100%;margin:14px 0 2px;border-top:1px solid ${COLORS.line};`,
    ' width="100%"',
  );
}

/**
 * The digits of Tiny5, the site's pixel font, as their pixels: one string per row, from the top
 * of a digit to the bottom of a comma's tail. Each keeps the column of space after it.
 */
const PIXEL_GLYPHS: Record<string, string[]> = {
  '0': ['.#..', '#.#.', '#.#.', '#.#.', '.#..', '....'],
  '1': ['.#..', '##..', '.#..', '.#..', '.#..', '....'],
  '2': ['##..', '..#.', '.#..', '#...', '###.', '....'],
  '3': ['##..', '..#.', '.#..', '..#.', '##..', '....'],
  '4': ['..#.', '.##.', '#.#.', '###.', '..#.', '....'],
  '5': ['###.', '#...', '##..', '..#.', '##..', '....'],
  '6': ['.##.', '#...', '##..', '#.#.', '.#..', '....'],
  '7': ['###.', '..#.', '.#..', '.#..', '.#..', '....'],
  '8': ['.#..', '#.#.', '.#..', '#.#.', '.#..', '....'],
  '9': ['.#..', '#.#.', '.##.', '..#.', '##..', '....'],
  ',': ['..', '..', '..', '..', '#.', '#.'],
  '.': ['..', '..', '..', '..', '#.', '..'],
  ' ': ['..', '..', '..', '..', '..', '..'],
};

/** The widest a pixel number may be, in CSS pixels: it must fit the impact box on a phone. */
const PIXEL_NUMBER_MAX = 220;

/**
 * A number drawn in the site's pixel font out of table cells: it looks the same in every mail
 * client, with or without pictures, and says itself to a screen reader.
 */
export function pixelNumber(text: string, color: string = COLORS.taxi): string {
  const glyphs = [...text].map((ch) => PIXEL_GLYPHS[ch] ?? PIXEL_GLYPHS[' ']);
  const rows = glyphs[0]?.length ?? 0;
  const lines = Array.from({ length: rows }, (_, r) =>
    glyphs.map((glyph) => glyph[r]).join(''),
  );
  // the last glyph's trailing space is not part of the number
  const width = Math.max(0, (lines[0]?.length ?? 1) - 1);
  const px = Math.max(3, Math.min(6, Math.floor(PIXEL_NUMBER_MAX / width)));
  const body = lines
    .map(
      (line) =>
        `<tr>${[...line.slice(0, width)]
          .map((dot) =>
            dot === '#'
              ? `<td width="${px}" height="${px}" bgcolor="${color}" style="width:${px}px;height:${px}px;background:${color};"></td>`
              : `<td width="${px}" height="${px}" style="width:${px}px;height:${px}px;"></td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<table role="img" aria-label="${attr(text)}" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:0;line-height:0;">${body}</table>`;
}

/** The dark box with a big pixel number and what it counts. */
export function impactBox(number: string, words: Markup): string {
  return table(
    `<tr><td bgcolor="${COLORS.ink}" style="background:${COLORS.ink};border-radius:10px;padding:16px 18px;">${pixelNumber(number)}` +
      `<p style="margin:10px 0 0;font:13.5px/1.5 ${FONT};color:${COLORS.paper};">${words.html}</p></td></tr>`,
    'width:100%;margin:16px 0;',
    ' width="100%"',
  );
}

/** A code to type, big and on paper. */
export const codeBox = (code: string): string =>
  table(
    `<tr><td bgcolor="${COLORS.paper}" style="background:${COLORS.paper};border-radius:8px;padding:12px 16px;font:700 30px/1 ${MONO};letter-spacing:.14em;color:${COLORS.ink};">${escapeHtml(code)}</td></tr>`,
    'margin:4px 0 14px;',
  );
