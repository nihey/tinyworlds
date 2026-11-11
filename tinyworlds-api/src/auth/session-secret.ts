import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';

/** A secret nobody knows, made at start: what sessions are signed with when none is configured. */
const UNKNOWABLE = randomBytes(32).toString('hex');

/**
 * What sessions are signed with (and sign-in codes keyed by). JWT_SECRET is required in
 * production, and anywhere as soon as there is an admin (config/env.ts). Without it, in
 * development, a secret made up at start serves: the sessions it signs end with the process.
 */
export const sessionSecret = (config: ConfigService<Env, true>): string =>
  config.get('JWT_SECRET', { infer: true }) ?? UNKNOWABLE;
