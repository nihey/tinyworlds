import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { IMAGES_ROUTE, LinksService } from './links.service.js';

/**
 * A link's icon or picture, as the copy kept here: REST, because a page shows it with `<img>`
 * and GraphQL serves no files. Public, like the lists that name it. An id's bytes never change
 * (a new reading of the page makes new ids), so browsers may keep them for good; they are
 * always WebP drawn by this API, never the bytes a linked page sent.
 */
@Public()
@Controller(IMAGES_ROUTE)
export class LinkImagesController {
  constructor(private readonly links: LinksService) {}

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StreamableFile> {
    const bytes = await this.links.imageBytes(id);
    if (!bytes) throw new NotFoundException();
    return new StreamableFile(bytes, {
      type: 'image/webp',
      length: bytes.length,
    });
  }
}
