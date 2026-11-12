import {
  Controller,
  Get,
  Header,
  Logger,
  Optional,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator.js';
import type { Env } from '../config/env.js';
import { WORLD_PATTERN } from '../donations/donation-facts.js';
import {
  drawSightPicture,
  PICTURE_FILE,
  SOURCE_MAX_BYTES,
  spriteUrl,
} from './sight-pictures.js';

const KEPT = 200;

/**
 * A building's sprite as a PNG, for mails (which cannot show WebP): REST, public, drawn here from
 * the site's own file. A hash's picture never changes, so it is cached for good.
 */
@Public()
@Controller('sight-pictures')
export class SightPicturesController {
  private readonly logger = new Logger(SightPicturesController.name);
  private readonly kept = new Map<string, Buffer>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {}

  @Get(':world/:file')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async picture(
    @Param('world') world: string,
    @Param('file') file: string,
  ): Promise<StreamableFile> {
    if (!WORLD_PATTERN.test(world) || !PICTURE_FILE.test(file)) {
      throw new NotFoundException();
    }
    const key = `${world}/${file}`;
    let bytes = this.kept.get(key);
    if (bytes) {
      this.kept.delete(key);
    } else {
      bytes = (await this.draw(world, file.slice(0, -4))) ?? undefined;
      if (!bytes) throw new NotFoundException();
    }
    this.kept.set(key, bytes);
    if (this.kept.size > KEPT) {
      const oldest = this.kept.keys().next().value;
      if (oldest !== undefined) this.kept.delete(oldest);
    }
    return new StreamableFile(bytes, {
      type: 'image/png',
      length: bytes.length,
    });
  }

  private async draw(world: string, hash: string): Promise<Buffer | null> {
    try {
      const site = this.config
        .get('SITE_URL', { infer: true })
        .replace(/\/+$/, '');
      const response = await this.fetcher(spriteUrl(site, world, hash), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > SOURCE_MAX_BYTES) return null;
      const source = Buffer.from(await response.arrayBuffer());
      if (source.length > SOURCE_MAX_BYTES) return null;
      return await drawSightPicture(source);
    } catch (error) {
      this.logger.warn(
        `could not draw ${world}'s picture: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }
}
