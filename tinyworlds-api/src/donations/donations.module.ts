import { Module } from '@nestjs/common';
import { FunnelModule } from '../funnel/funnel.module.js';
import { DonationsResolver } from './donations.resolver.js';
import { DonationsService } from './donations.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { stripeProvider } from './stripe.provider.js';

@Module({
  imports: [FunnelModule],
  controllers: [StripeWebhookController],
  providers: [stripeProvider, DonationsService, DonationsResolver],
})
export class DonationsModule {}
