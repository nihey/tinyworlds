import { Module } from '@nestjs/common';
import { BenefactorsResolver } from './benefactors.resolver.js';
import { BenefactorsService } from './benefactors.service.js';

@Module({
  providers: [BenefactorsService, BenefactorsResolver],
  exports: [BenefactorsService],
})
export class BenefactorsModule {}
