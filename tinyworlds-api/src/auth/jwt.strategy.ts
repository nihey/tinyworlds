import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../config/env.js';
import { AuthService, type AdminIdentity } from './auth.service.js';
import { sessionSecret } from './session-secret.js';

/** A session: a JWT in `Authorization: Bearer …` whose subject is still an admin. */
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
  async validate(payload: { sub?: unknown }): Promise<AdminIdentity> {
    const admin =
      typeof payload.sub === 'string'
        ? await this.auth.adminOf(payload.sub)
        : null;
    if (!admin) throw new UnauthorizedException();
    return admin;
  }
}
