import { cleanLinkUrl, isPublicHostName, URL_MAX } from './link-url.js';

describe('cleanLinkUrl', () => {
  it('keeps an https page as it is, without its fragment', () => {
    expect(cleanLinkUrl('https://example.com/me?tab=1#top')).toBe(
      'https://example.com/me?tab=1',
    );
    expect(cleanLinkUrl('  https://Example.COM  ')).toBe(
      'https://example.com/',
    );
  });

  it('meets what people type halfway', () => {
    expect(cleanLinkUrl('example.com/shop')).toBe('https://example.com/shop');
    expect(cleanLinkUrl('http://example.com')).toBe('https://example.com/');
    expect(cleanLinkUrl('www.exämple.com')).toBe(
      'https://www.xn--exmple-cua.com/',
    );
  });

  it.each([
    ['another scheme', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<p>hi'],
    ['mail', 'mailto:ana@example.com'],
    ['ftp', 'ftp://example.com/file'],
    ['an address', 'https://127.0.0.1/'],
    ['an address in hex', 'https://0x7f.1/'],
    ['an address as one number', 'https://2130706433/'],
    ['an IPv6 address', 'https://[::1]/'],
    ['a private address', 'https://10.0.0.8/admin'],
    ['a bare name', 'https://localhost/'],
    ['a service on the same network', 'https://postgres/'],
    ['a private suffix', 'https://printer.local/'],
    ['an internal name', 'https://api.internal/'],
    ['a port', 'https://example.com:8443/'],
    ['a port without a scheme', 'example.com:8080/x'],
    ['a user', 'https://ana@example.com/'],
    ['a password', 'https://ana:secret@example.com/'],
    ['a space', 'https://example.com/a b'],
    ['a trailing dot', 'https://example.com./'],
    ['nothing', '   '],
    ['not a string', 42],
    ['nothing at all', null],
  ])('refuses %s', (_what, raw) => {
    expect(cleanLinkUrl(raw)).toBeNull();
  });

  it('refuses a link longer than URL_MAX', () => {
    const path = 'a'.repeat(URL_MAX);
    expect(cleanLinkUrl(`https://example.com/${path}`)).toBeNull();
    expect(
      cleanLinkUrl(`https://example.com/${'a'.repeat(URL_MAX - 30)}`),
    ).not.toBeNull();
  });
});

describe('isPublicHostName', () => {
  it('wants dotted labels with a letter-led last one', () => {
    expect(isPublicHostName('example.com')).toBe(true);
    expect(isPublicHostName('a.b.example.co.uk')).toBe(true);
    expect(isPublicHostName('xn--exmple-cua.com')).toBe(true);
    expect(isPublicHostName('example.xn--p1ai')).toBe(true);
    expect(isPublicHostName('1.2.3.4')).toBe(false);
    expect(isPublicHostName('example')).toBe(false);
    expect(isPublicHostName('-a.com')).toBe(false);
    expect(isPublicHostName('a..com')).toBe(false);
    expect(isPublicHostName('[::1]')).toBe(false);
  });
});
