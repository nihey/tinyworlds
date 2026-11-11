import {
  createParamDecorator,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import type { Request } from 'express';
import type { Account, Purpose, SessionIdentity } from './auth.service.js';

/** The request behind a resolver or a route. */
export function requestOf(context: ExecutionContext): Request {
  return context.getType<GqlContextType>() === 'graphql'
    ? GqlExecutionContext.create(context).getContext<{ req: Request }>().req
    : context.switchToHttp().getRequest<Request>();
}

/** Who JwtStrategy found in the request's session, if anyone. */
export const sessionOf = (context: ExecutionContext): SessionIdentity | null =>
  (requestOf(context) as Request & { user?: SessionIdentity }).user ?? null;

/**
 * The signed-in account of a kind. The guard has already checked the kind; checking again keeps
 * a decorator on the wrong route from handing over the other kind's account.
 */
export function accountOf(context: ExecutionContext, kind: Purpose): Account {
  const who = sessionOf(context);
  if (who?.kind !== kind) throw new ForbiddenException();
  return { id: who.id, email: who.email };
}

/** The signed-in admin: `{ id, email }`. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Account =>
    accountOf(context, 'admin'),
);
