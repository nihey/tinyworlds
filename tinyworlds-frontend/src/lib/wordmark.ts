/**
 * How much of its usual size a wordmark is set at. "tiny" plus an airport code fits anywhere;
 * "tinykingslanding" does not, so a long name is set smaller, in proportion, wherever it appears
 * (the search sign, the cards, the splash). Up to ten letters ("tinyworlds") nothing changes.
 */
export function wordmarkScale(suffix: string): number {
  const letters = 4 + suffix.length;
  return letters <= 10 ? 1 : Math.max(0.6, 10 / letters);
}
