import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { DonationsService } from './donations.service.js';

/** Stripe's webhook: REST, the documented exception to GraphQL. */
@Controller('stripe')
export class StripeWebhookController {
  constructor(private readonly donations: DonationsService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.donations.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
