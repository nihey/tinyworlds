import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { requestOf } from './current-admin.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * The guard on everything: a resolver or a route is for signed-in admins unless it is marked
 * @Public(). It reads the session from `Authorization: Bearer …`, in GraphQL and REST alike.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  getRequest(context: ExecutionContext): Request {
    return requestOf(context);
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    return isPublic ? true : super.canActivate(context);
  }
}
