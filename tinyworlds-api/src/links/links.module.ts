import { Module } from '@nestjs/common';
import { LinkImagesController } from './link-images.controller.js';
import { linkReaderProvider } from './link-reader.js';
import { LinksAdminResolver } from './links-admin.resolver.js';
import { LinksResolver } from './links.resolver.js';
import { LinksService } from './links.service.js';

/**
 * The links donors show beside their names: their own page's operations, the admins' switch,
 * the route their images are served from, and what the benefactors' lists read. Tests replace
 * LINK_READER, so none of them asks the internet for a page.
 */
@Module({
  providers: [
    linkReaderProvider,
    LinksService,
    LinksResolver,
    LinksAdminResolver,
  ],
  controllers: [LinkImagesController],
  exports: [LinksService],
})
export class LinksModule {}
