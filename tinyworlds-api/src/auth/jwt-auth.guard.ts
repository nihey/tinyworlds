import {
  ForbiddenException,
  Injectable,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { isObservable, lastValueFrom } from 'rxjs';
import type { Purpose } from './auth.service.js';
import { requestOf, sessionOf } from './current-admin.decorator.js';
import { SESSION_KIND } from './for-donors.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * The guard on everything: a resolver or a route is for signed-in admins unless it is marked
 * @Public() (anyone) or @ForDonors() (signed-in donors). It reads the session from
 * `Authorization: Bearer …`, in GraphQL and REST alike. No session is UNAUTHENTICATED; a
 * session of the other kind is FORBIDDEN.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  getRequest(context: ExecutionContext): Request {
    return requestOf(context);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // the method's mark first, then its class's, as for @Public()
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)
    )
      return true;

    const signedIn = super.canActivate(context);
    if (!(await (isObservable(signedIn) ? lastValueFrom(signedIn) : signedIn)))
      return false;

    const kind =
      this.reflector.getAllAndOverride<Purpose | undefined>(
        SESSION_KIND,
        targets,
      ) ?? 'admin';
    if (sessionOf(context)?.kind !== kind) throw new ForbiddenException();
    return true;
  }
}
