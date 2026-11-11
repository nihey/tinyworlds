import { SetMetadata } from '@nestjs/common';
import type { Purpose } from './auth.service.js';

/** The kind of session a route asks for. Unmarked, it is an admin's (JwtAuthGuard). */
export const SESSION_KIND = 'sessionKind';

/**
 * Marks a route or a resolver (or a whole class of them) for signed-in donors: a donor's
 * session is let in, an admin's is forbidden. Everything unmarked stays for admins only.
 */
export const ForDonors = () =>
  SetMetadata(SESSION_KIND, 'donor' satisfies Purpose);
