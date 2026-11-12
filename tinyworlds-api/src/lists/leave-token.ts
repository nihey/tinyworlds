import { createHmac, timingSafeEqual } from 'node:crypto';

const mac = (secret: string, donorId: string, list: string): Buffer =>
  createHmac('sha256', secret).update(`leave:${donorId}:${list}`).digest();

/**
 * What a leave link carries, signed: `<donorId>.<list>.<mac>`, where `list` is a city's id or
 * `'*'` (new cities). It holds no address and expires never: leaving must always work.
 */
export function leaveToken(
  secret: string,
  donorId: string,
  list: string,
): string {
  return `${donorId}.${list}.${mac(secret, donorId, list).toString('base64url')}`;
}

/** The donor and list a token was signed for, or null for anything else. */
export function readLeaveToken(
  secret: string,
  token: string,
): { donorId: string; list: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [donorId, list, given] = parts;
  if (!donorId || !list || !given) return null;
  const want = mac(secret, donorId, list);
  const got = Buffer.from(given, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return { donorId, list };
}
