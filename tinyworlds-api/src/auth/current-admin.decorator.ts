import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import type { Request } from 'express';
import type { AdminIdentity } from './auth.service.js';

/** The request behind a resolver or a route. */
export function requestOf(context: ExecutionContext): Request {
  return context.getType<GqlContextType>() === 'graphql'
    ? GqlExecutionContext.create(context).getContext<{ req: Request }>().req
    : context.switchToHttp().getRequest<Request>();
}

/** The signed-in admin, as JwtStrategy left them on the request. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminIdentity =>
    (requestOf(context) as Request & { user: AdminIdentity }).user,
);
