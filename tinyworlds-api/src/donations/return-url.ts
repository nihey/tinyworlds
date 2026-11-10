/**
 * Where a checkout may send the donor back to: a plain page on one of the site's own origins.
 * Anything else would let the API be used to dress up a link to somewhere else as a donation.
 * Answers the URL to return to, or null when it is not acceptable.
 */
export function acceptReturnUrl(
  value: string,
  allowedOrigins: readonly string[],
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  // the page itself: "?donated=1" is appended to it, so it must not carry a query or a hash
  if (url.search || url.hash || value.includes('?') || value.includes('#'))
    return null;
  if (!allowedOrigins.includes(url.origin)) return null;
  return `${url.origin}${url.pathname}`;
}
