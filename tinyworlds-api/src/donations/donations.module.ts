import { Module } from '@nestjs/common';
import { BenefactorsModule } from '../benefactors/benefactors.module.js';
import { FunnelModule } from '../funnel/funnel.module.js';
import { MailModule } from '../mail/mail.module.js';
import { VisitsModule } from '../visits/visits.module.js';
import { DonationsResolver } from './donations.resolver.js';
import { DonationsService } from './donations.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { stripeProvider } from './stripe.provider.js';
import { ThanksService } from './thanks.service.js';

@Module({
  imports: [FunnelModule, MailModule, BenefactorsModule, VisitsModule],
  controllers: [StripeWebhookController],
  providers: [
    stripeProvider,
    DonationsService,
    DonationsResolver,
    ThanksService,
  ],
})
export class DonationsModule {}
