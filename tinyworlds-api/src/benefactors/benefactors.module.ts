import { Module } from '@nestjs/common';
import { LinksModule } from '../links/links.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AnnounceService } from './announce.service.js';
import { BenefactorsResolver } from './benefactors.resolver.js';
import { BenefactorsService } from './benefactors.service.js';
import { MyGivingResolver } from './my-giving.resolver.js';
import { NamesResolver } from './names.resolver.js';

@Module({
  imports: [MailModule, LinksModule],
  providers: [
    BenefactorsService,
    AnnounceService,
    BenefactorsResolver,
    MyGivingResolver,
    NamesResolver,
  ],
  exports: [BenefactorsService],
})
export class BenefactorsModule {}
