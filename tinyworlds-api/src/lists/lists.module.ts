import { Module } from '@nestjs/common';
import { LeaveResolver } from './leave.resolver.js';
import { ListCountsResolver } from './list-counts.resolver.js';
import { ListsResolver } from './lists.resolver.js';
import { ListsService } from './lists.service.js';

@Module({
  providers: [ListsService, ListsResolver, LeaveResolver, ListCountsResolver],
  exports: [ListsService],
})
export class ListsModule {}
