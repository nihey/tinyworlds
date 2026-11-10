import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/** ThrottlerGuard for resolvers: reads the request from the GraphQL context. */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    const { req } = GqlExecutionContext.create(context).getContext<{
      req: Request;
    }>();
    return { req, res: req.res as Response };
  }
}
