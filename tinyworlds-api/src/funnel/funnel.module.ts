import { Module } from '@nestjs/common';
import { FunnelResolver } from './funnel.resolver.js';
import { FunnelService } from './funnel.service.js';

@Module({
  providers: [FunnelService, FunnelResolver],
  exports: [FunnelService],
})
export class FunnelModule {}
