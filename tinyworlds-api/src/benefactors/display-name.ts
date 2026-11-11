/** The longest display name kept, in code points. */
export const NAME_MAX = 40;

/**
 * A donor's display name made presentable: NFC, control and invisible characters out, whitespace
 * collapsed, at most NAME_MAX code points. Null when it is not a string or holds no letter or
 * digit.
 */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFC')
    .replace(/\s+/gu, ' ') // tabs and newlines are control characters: make them spaces first
    .replace(/[\p{Cc}\p{Cf}]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const cut = Array.from(cleaned).slice(0, NAME_MAX).join('').trim();
  return /[\p{L}\p{N}]/u.test(cut) ? cut : null;
}
