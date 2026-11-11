import { bold, escapeHtml, fill, fillHtml, markup } from './html.js';
import {
  badge,
  button,
  COLORS,
  facts,
  pixelNumber,
  progressBar,
  shell,
  stonesGrid,
} from './layout.js';
import { formatCount, formatUsd, stoneRanges } from './format.js';

const SITE = 'https://example.com';

describe('the mail markup', () => {
  it('escapes every text it is given', () => {
    const evil = '<script>alert("x")</script> & \'';
    expect(escapeHtml(evil)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;',
    );
    expect(fillHtml('Hi {name} <3', { name: evil })).toBe(
      `Hi ${escapeHtml(evil)} &lt;3`,
    );
    expect(fillHtml('as {name}', { name: bold(evil) })).toBe(
      `as <b style="font-weight:700">${escapeHtml(evil)}</b>`,
    );
    expect(fillHtml('{a} and {missing}', { a: markup('<i>ok</i>') })).toBe(
      '<i>ok</i> and {missing}',
    );
    expect(fill('{n} of {city}', { n: 3, city: 'Rio' })).toBe('3 of Rio');
    for (const html of [
      badge(SITE, evil, 'founding'),
      button({ label: evil, href: 'https://example.com/"><x>' }),
      facts([[evil, evil]]),
      shell({
        locale: 'en-US',
        title: evil,
        preheader: evil,
        site: SITE,
        label: evil,
        hero: { src: `${SITE}/"><x>`, alt: evil, width: 560, height: 294 },
        body: '',
        footer: [evil],
      }),
    ]) {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('"><x>');
    }
  });

  it('frames a mail in the band, the card and the footer', () => {
    const html = shell({
      locale: 'pt-BR',
      title: 'Assunto',
      preheader: 'A primeira linha',
      site: SITE,
      label: 'Obrigado',
      body: '<p>corpo</p>',
      footer: ['Uma linha.', 'Outra.'],
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<title>Assunto</title>');
    expect(html).toContain(`src="${SITE}/email/wordmark.png"`);
    expect(html).toContain('alt="tinyworlds"');
    expect(html).toContain('A primeira linha');
    expect(html).toContain('<p>corpo</p>');
    expect(html).toContain('Uma linha.<br>Outra.');
    expect(html).toContain(`border-top:4px solid ${COLORS.taxi}`);
    // Outlook, which reads no max-width, gets a table of its own at the card's width
    expect(html).toContain(
      '<!--[if mso]><table role="presentation" width="560" align="center"',
    );
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
  });

  it('draws a badge with its words beside its picture, or the words alone', () => {
    const lit = badge(SITE, 'Founder No. 2', 'first-stone');
    expect(lit).toContain(`src="${SITE}/email/first-stone.png"`);
    expect(lit).toContain('width="16" height="18"');
    expect(lit).toContain('>Founder No. 2</span>');
    expect(badge(SITE, 'Benefactor')).not.toContain('<img');
  });

  it('lays the stones ten to a row, in three looks', () => {
    const html = stonesGrid([
      'laid',
      'laid',
      ...Array<'mine'>(10).fill('mine'),
      ...Array<null>(18).fill(null),
    ]);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<td /g)).toHaveLength(30);
    expect(
      html.match(new RegExp(`bgcolor="${COLORS.taxi}"`, 'g')),
    ).toHaveLength(10);
    expect(
      html.match(new RegExp(`bgcolor="${COLORS.laid}"`, 'g')),
    ).toHaveLength(2);
    // an empty cell is as tall as it is drawn, in Outlook too
    expect(html).toContain(
      'font-size:1px;mso-line-height-rule:exactly;line-height:22px;',
    );
  });

  it('fills a progress bar without ever overflowing it', () => {
    expect(progressBar(0.4)).toContain('width="40%"');
    expect(progressBar(0.4)).toContain('width="60%"');
    expect(progressBar(0.4)).toContain(
      'mso-line-height-rule:exactly;line-height:8px;',
    );
    expect(progressBar(2).match(/<td /g)).toHaveLength(1);
    expect(progressBar(-1)).toContain(`bgcolor="${COLORS.empty}"`);
  });

  it('draws a number in pixels that a screen reader can still read', () => {
    const html = pixelNumber('16,396');
    expect(html).toContain('role="img" aria-label="16,396"');
    // six rows; five digits of four columns and a comma of two, less the last space
    expect(html.match(/<tr>/g)).toHaveLength(6);
    expect(html.match(/<td /g)).toHaveLength(6 * 21);
    // a number too wide for a phone draws its pixels smaller
    expect(pixelNumber('123,456,789')).toContain('width="5"');
  });
});

describe('the mail formats', () => {
  it('writes dollars the way each language does, cents only when there are some', () => {
    expect(formatUsd(1000, 'en-US')).toBe('US$10');
    expect(formatUsd(1250, 'en-US')).toBe('US$12.50');
    expect(formatUsd(1000, 'pt-BR')).toBe('US$\u00a010'); // a space that does not break
    expect(formatUsd(1000, 'es-ES')).toBe('10\u00a0US$');
    expect(formatCount(16396, 'en-US')).toBe('16,396');
    expect(formatCount(16396, 'pt-BR')).toBe('16.396');
  });

  it('writes stones as runs', () => {
    expect(stoneRanges([3, 1, 2, 7, 9, 8])).toBe('1–3, 7–9');
    expect(stoneRanges([12])).toBe('12');
  });
});
