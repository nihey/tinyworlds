import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';

/** A secret nobody knows, made at start: what sessions are signed with when none is configured. */
const UNKNOWABLE = randomBytes(32).toString('hex');

/**
 * What the admins' sessions are signed with. JWT_SECRET is required as soon as there is an
 * admin (config/env.ts); without admins there are no sessions, and a made-up secret makes sure
 * of it: no token can be valid.
 */
export const sessionSecret = (config: ConfigService<Env, true>): string =>
  config.get('JWT_SECRET', { infer: true }) ?? UNKNOWABLE;
