/**
 * What went wrong, for the log, without the error's message: a mail server's refusal quotes the
 * address, and so may a database error quoting its query.
 */
export function failureOf(error: unknown): string {
  const { name, code, responseCode } = (error ?? {}) as Record<string, unknown>;
  return (
    [name, code, responseCode]
      .filter((part) => typeof part === 'string' || typeof part === 'number')
      .join(' ') || 'unknown error'
  );
}
