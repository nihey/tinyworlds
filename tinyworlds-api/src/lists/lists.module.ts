import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { LeaveResolver } from './leave.resolver.js';
import { ListAnnounceService } from './list-announce.service.js';
import { ListCountsResolver } from './list-counts.resolver.js';
import { ListsResolver } from './lists.resolver.js';
import { ListsService } from './lists.service.js';
import { SightPicturesController } from './sight-pictures.controller.js';
import { SightsCatalog } from './sights-catalog.js';
import { UnsubscribeController } from './unsubscribe.controller.js';

@Module({
  imports: [MailModule],
  controllers: [SightPicturesController, UnsubscribeController],
  providers: [
    ListsService,
    ListsResolver,
    LeaveResolver,
    ListCountsResolver,
    SightsCatalog,
    ListAnnounceService,
  ],
  exports: [ListsService, SightsCatalog, ListAnnounceService],
})
export class ListsModule {}
