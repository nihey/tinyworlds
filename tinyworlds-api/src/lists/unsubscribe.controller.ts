import { Controller, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { ListsService } from './lists.service.js';

/** One-click leave requests a minute (RFC 8058): mail clients and scanners may call it. */
export const UNSUBSCRIBES_PER_MINUTE = 30;

/**
 * The link a mail client posts to when someone presses "unsubscribe" in its own interface. REST
 * because a client posts to a URL, not to GraphQL. Always 200: it says nothing of the token.
 */
@Controller('lists')
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: UNSUBSCRIBES_PER_MINUTE, ttl: 60_000 } })
export class UnsubscribeController {
  constructor(private readonly lists: ListsService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Query('t') token?: string): Promise<{ ok: true }> {
    if (typeof token === 'string' && token)
      await this.lists.leaveWithToken(token, false);
    return { ok: true };
  }
}
