import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../config/env.js';
import {
  AuthService,
  isPurpose,
  type SessionIdentity,
} from './auth.service.js';
import { sessionSecret } from './session-secret.js';

/**
 * A session: a JWT in `Authorization: Bearer …` (`{ sub, kind }`) whose subject is still an
 * account of that kind.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: sessionSecret(config),
      algorithms: ['HS256'],
    });
  }

  /** Asked on every request: taking an address off ADMIN_EMAILS ends its sessions. */
  async validate(payload: {
    sub?: unknown;
    kind?: unknown;
  }): Promise<SessionIdentity> {
    // signed before donors could sign in, a session carries no kind: it is an admin's
    const kind = payload.kind ?? 'admin';
    const who =
      typeof payload.sub === 'string' && isPurpose(kind)
        ? await this.auth.identityOf(kind, payload.sub)
        : null;
    if (!who) throw new UnauthorizedException();
    return who;
  }
}
