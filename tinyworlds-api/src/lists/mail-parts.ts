import { escapeHtml } from '../mail/html.js';
import { COLORS } from '../mail/layout.js';
import type { MailSight } from './sights-catalog.js';

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/** The headers that let a mail client offer "unsubscribe" with one click (RFC 8058). */
export function listHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** The pixel width and height of the paper tile a building stands on. */
const TILE = 118;

/** Famous buildings as rows: the picture on paper at left, then city, name, line and a link. */
export function sightRowsHtml(sights: MailSight[], seeLabel: string): string {
  return sights
    .map((sight) => {
      const picture = sight.picture
        ? `<img src="${escapeHtml(sight.picture.src)}" width="${sight.picture.width}" height="${sight.picture.height}" alt="${escapeHtml(sight.name)}" style="display:block;border:0;outline:none;margin:0 auto;color:${COLORS.dim};font:12px/1.3 ${FONT};">`
        : '';
      const city = sight.city
        ? `<div style="font:600 11px/1.4 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${COLORS.dim};margin:0 0 4px;">${escapeHtml(sight.city)}</div>`
        : '';
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;border-top:1px solid ${COLORS.line};">` +
        `<tr><td width="${TILE}" valign="bottom" style="width:${TILE}px;padding:14px 14px 14px 0;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${TILE}" style="border-collapse:collapse;width:${TILE}px;"><tr><td width="${TILE}" height="${TILE}" bgcolor="${COLORS.paper}" align="center" valign="bottom" style="width:${TILE}px;height:${TILE}px;background:${COLORS.paper};border-radius:8px;">${picture}</td></tr></table>` +
        `</td><td valign="bottom" style="padding:14px 0;font-family:${FONT};color:${COLORS.ink};">` +
        city +
        `<div style="font:700 15px/1.3 ${FONT};color:${COLORS.ink};">${escapeHtml(sight.name)}</div>` +
        `<p style="margin:4px 0 6px;font:13.5px/1.5 ${FONT};color:${COLORS.ink};">${escapeHtml(sight.text)}</p>` +
        `<a href="${escapeHtml(sight.mapUrl)}" style="font:700 13px/1.4 ${FONT};color:${COLORS.ink};text-decoration:underline;">${escapeHtml(seeLabel)}</a>` +
        `</td></tr></table>`
      );
    })
    .join('');
}

/** The same rows as plain text. */
export function sightRowsText(sights: MailSight[], seeLabel: string): string {
  return sights
    .map((sight) =>
      [
        sight.city ? `${sight.city}: ${sight.name}` : sight.name,
        sight.text,
        `${seeLabel}: ${sight.mapUrl}`,
      ].join('\n'),
    )
    .join('\n\n');
}
