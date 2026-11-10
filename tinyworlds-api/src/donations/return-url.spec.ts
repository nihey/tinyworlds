import { acceptReturnUrl } from './return-url.js';

const allowed = ['https://example.com', 'http://localhost:3000'];

describe('acceptReturnUrl', () => {
  it('accepts a page on an allowed origin', () => {
    expect(acceptReturnUrl('https://example.com/tinynyc/', allowed)).toBe(
      'https://example.com/tinynyc/',
    );
    expect(acceptReturnUrl('http://localhost:3000/', allowed)).toBe(
      'http://localhost:3000/',
    );
    expect(acceptReturnUrl('https://example.com', allowed)).toBe(
      'https://example.com/',
    );
  });

  it('refuses any other origin, however close it looks', () => {
    for (const url of [
      'https://example.org/tinynyc/',
      'https://example.com.evil.test/tinynyc/',
      'https://evil.test/https://example.com/',
      'http://example.com/tinynyc/', // right host, wrong scheme
      'https://example.com:8443/tinynyc/', // right host, wrong port
      'https://sub.example.com/',
    ]) {
      expect(acceptReturnUrl(url, allowed)).toBeNull();
    }
  });

  it('refuses a query, a hash, or credentials', () => {
    for (const url of [
      'https://example.com/tinynyc/?next=https://evil.test',
      'https://example.com/tinynyc/?',
      'https://example.com/tinynyc/#40.7,-74,1',
      'https://example.com/tinynyc/#',
      'https://user:pass@example.com/tinynyc/',
      'https://example.com@evil.test/',
    ]) {
      expect(acceptReturnUrl(url, allowed)).toBeNull();
    }
  });

  it('refuses what is not an http(s) URL', () => {
    for (const url of [
      '',
      '/tinynyc/',
      'javascript:alert(1)',
      'ftp://example.com/',
    ]) {
      expect(acceptReturnUrl(url, allowed)).toBeNull();
    }
  });
});
