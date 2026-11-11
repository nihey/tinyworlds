import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Account } from './auth.service.js';
import { accountOf } from './current-admin.decorator.js';

/** The signed-in donor, on a route marked @ForDonors(): `{ id, email }`. */
export const CurrentDonor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Account =>
    accountOf(context, 'donor'),
);
