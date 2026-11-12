import { Module } from '@nestjs/common';
import { LeaveResolver } from './leave.resolver.js';
import { ListCountsResolver } from './list-counts.resolver.js';
import { ListsResolver } from './lists.resolver.js';
import { ListsService } from './lists.service.js';
import { SightPicturesController } from './sight-pictures.controller.js';
import { SightsCatalog } from './sights-catalog.js';

@Module({
  controllers: [SightPicturesController],
  providers: [
    ListsService,
    ListsResolver,
    LeaveResolver,
    ListCountsResolver,
    SightsCatalog,
  ],
  exports: [ListsService, SightsCatalog],
})
export class ListsModule {}
