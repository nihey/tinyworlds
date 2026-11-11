import { Module } from '@nestjs/common';
import { BenefactorsResolver } from './benefactors.resolver.js';
import { BenefactorsService } from './benefactors.service.js';
import { MyGivingResolver } from './my-giving.resolver.js';
import { NamesResolver } from './names.resolver.js';

@Module({
  providers: [
    BenefactorsService,
    BenefactorsResolver,
    MyGivingResolver,
    NamesResolver,
  ],
  exports: [BenefactorsService],
})
export class BenefactorsModule {}
