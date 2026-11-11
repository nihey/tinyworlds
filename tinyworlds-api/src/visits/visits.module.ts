import { Module } from '@nestjs/common';
import { VisitsResolver } from './visits.resolver.js';
import { VisitsService } from './visits.service.js';

@Module({
  providers: [VisitsService, VisitsResolver],
  exports: [VisitsService],
})
export class VisitsModule {}
