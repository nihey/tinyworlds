import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { COUNTED_CURRENCY } from '../donations/currency.js';
import { GLOBAL_PREFIX } from '../http.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Drawn } from './link-images.js';
import {
  LINK_READER,
  type LinkPreview,
  type LinkReader,
} from './link-reader.js';
import { cleanLinkUrl } from './link-url.js';
import type {
  BenefactorLink,
  MyLink,
  MyLinks,
} from './models/benefactor-link.model.js';

/** How many links a donor may have. */
export const LINKS_MAX = 3;

/** From this much given, in US cents, a donor's links show their pictures on the public lists. */
export const PICTURES_FROM_CENTS = 1000;

/** Where a link's images are served: `GET /api/link-images/<id>` (link-images.controller.ts). */
export const IMAGES_ROUTE = 'link-images';
const imagePath = (id: string): string =>
  `/${GLOBAL_PREFIX}/${IMAGES_ROUTE}/${id}`;

/** A link without its images' bytes: those are only ever read one at a time, by id. */
const LINK = {
  id: true,
  donorId: true,
  url: true,
  title: true,
  description: true,
  images: { select: { id: true, kind: true } },
} as const;

/** The order links are shown in: as they were added. */
const AS_ADDED = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

interface LinkRow {
  id: string;
  donorId: string;
  url: string;
  title: string;
  description: string | null;
  images: { id: string; kind: 'ICON' | 'PICTURE' }[];
}

function shown(row: LinkRow, pictures: boolean): BenefactorLink {
  const idOf = (kind: 'ICON' | 'PICTURE') =>
    row.images.find((image) => image.kind === kind)?.id;
  const icon = idOf('ICON');
  const picture = pictures ? idOf('PICTURE') : undefined;
  return {
    url: row.url,
    title: row.title,
    description: row.description,
    icon: icon ? imagePath(icon) : null,
    image: picture ? imagePath(picture) : null,
  };
}

/** A reading's images as the rows they are kept in. */
function imagesOf(preview: LinkPreview) {
  const row = (kind: 'ICON' | 'PICTURE', drawn: Drawn) => ({
    kind,
    // the bytes on their own, not a view into a buffer shared with others
    bytes: new Uint8Array(drawn.bytes),
    width: drawn.width,
    height: drawn.height,
  });
  return [
    ...(preview.icon ? [row('ICON', preview.icon)] : []),
    ...(preview.picture ? [row('PICTURE', preview.picture)] : []),
  ];
}

/**
 * The links donors show beside their names: up to LINKS_MAX each, for those who have given.
 * A link's page is read once, when it is saved (and again when the donor asks), and what the
 * lists show is that reading: its words, and small copies of its icon and picture kept here.
 * The lists show a donor's links wherever they show the donor's name, unless an admin hid
 * them; a link's picture shows from PICTURES_FROM_CENTS given.
 */
@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LINK_READER) private readonly reader: LinkReader,
  ) {}

  /** What each of these donors has given in all, in US cents (nothing for one who has not). */
  private async given(donorIds: string[]): Promise<Map<string, number>> {
    const sums = await this.prisma.donation.groupBy({
      by: ['donorId'],
      where: { donorId: { in: donorIds }, currency: COUNTED_CURRENCY },
      _sum: { amountCents: true },
    });
    return new Map(
      sums.flatMap((row) =>
        row.donorId ? [[row.donorId, row._sum.amountCents ?? 0]] : [],
      ),
    );
  }

  /** The donor's own links, with everything read of them, and what decides what shows. */
  async mine(donorId: string): Promise<MyLinks> {
    const [donor, links, given] = await Promise.all([
      this.prisma.donor.findUnique({
        where: { id: donorId },
        select: { linksHidden: true },
      }),
      this.prisma.donorLink.findMany({
        where: { donorId },
        orderBy: [...AS_ADDED],
        select: LINK,
      }),
      this.given([donorId]),
    ]);
    return {
      links: links.map((row) => ({ id: row.id, ...shown(row, true) })),
      max: LINKS_MAX,
      givenCents: given.get(donorId) ?? 0,
      picturesFromCents: PICTURES_FROM_CENTS,
      hidden: donor?.linksHidden ?? false,
    };
  }

  /**
   * Saves a link and reads its page. Refused (BAD_REQUEST) when it is not a public https page,
   * when the donor has not given, has it already, or has LINKS_MAX. A page that cannot be read
   * does not stop the link: it is kept under its own name.
   */
  async add(donorId: string, raw: string): Promise<MyLink> {
    const url = cleanLinkUrl(raw);
    if (!url) throw new BadRequestException('Give a link to a public web page');
    const [given, links] = await Promise.all([
      this.given([donorId]),
      this.prisma.donorLink.findMany({
        where: { donorId },
        select: { url: true },
      }),
    ]);
    if (!given.get(donorId))
      throw new BadRequestException('Links are for those who have given');
    if (links.some((link) => link.url === url))
      throw new BadRequestException('That link is already there');
    if (links.length >= LINKS_MAX)
      throw new BadRequestException(`No more than ${LINKS_MAX} links`);

    // the page is read before anything is held in the database
    const preview = await this.reader.read(url);
    const row = await this.prisma.$transaction(async (tx) => {
      // one add at a time per donor, so two at once cannot both be the third
      await tx.$queryRaw`SELECT 1 FROM donors WHERE id = ${donorId}::uuid FOR UPDATE`;
      if ((await tx.donorLink.count({ where: { donorId } })) >= LINKS_MAX)
        throw new BadRequestException(`No more than ${LINKS_MAX} links`);
      if (
        await tx.donorLink.findUnique({
          where: { donorId_url: { donorId, url } },
          select: { id: true },
        })
      )
        throw new BadRequestException('That link is already there');
      return tx.donorLink.create({
        data: {
          donorId,
          url,
          title: preview.title,
          description: preview.description,
          readAt: new Date(),
          images: { create: imagesOf(preview) },
        },
        select: LINK,
      });
    });
    return { id: row.id, ...shown(row, true) };
  }

  /** Takes one of the donor's own links away, with its images. */
  async remove(donorId: string, id: string): Promise<void> {
    const { count } = await this.prisma.donorLink.deleteMany({
      where: { id, donorId },
    });
    if (count === 0) throw new BadRequestException('No such link');
  }

  /**
   * Reads the page of one of the donor's own links again and keeps the new reading. A page
   * that does not answer leaves the link as it was (a 503: "The page did not answer").
   */
  async refresh(donorId: string, id: string): Promise<MyLink> {
    const link = await this.prisma.donorLink.findFirst({
      where: { id, donorId },
      select: { url: true },
    });
    if (!link) throw new BadRequestException('No such link');
    const preview = await this.reader.read(link.url);
    if (!preview.reached)
      throw new ServiceUnavailableException('The page did not answer');
    const row = await this.prisma.$transaction(async (tx) => {
      // new rows, so new ids: an image's address never changes what it shows
      await tx.linkImage.deleteMany({ where: { linkId: id } });
      return tx.donorLink.update({
        where: { id },
        data: {
          title: preview.title,
          description: preview.description,
          readAt: new Date(),
          images: { create: imagesOf(preview) },
        },
        select: LINK,
      });
    });
    return { id: row.id, ...shown(row, true) };
  }

  /**
   * What the public lists show for these donors, by donor: their links in the order added,
   * none for a donor whose links an admin hid, a picture only from PICTURES_FROM_CENTS given.
   * The caller decides whose name is shown; this only says what goes with it.
   */
  async shownFor(donorIds: string[]): Promise<Map<string, BenefactorLink[]>> {
    const ids = [...new Set(donorIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.donorLink.findMany({
      where: { donorId: { in: ids }, donor: { linksHidden: false } },
      orderBy: [...AS_ADDED],
      select: LINK,
    });
    if (rows.length === 0) return new Map();
    const given = await this.given([...new Set(rows.map((r) => r.donorId))]);
    const byDonor = new Map<string, BenefactorLink[]>();
    for (const row of rows) {
      const pictures = (given.get(row.donorId) ?? 0) >= PICTURES_FROM_CENTS;
      const links = byDonor.get(row.donorId) ?? [];
      links.push(shown(row, pictures));
      byDonor.set(row.donorId, links);
    }
    return byDonor;
  }

  /** Every link of these donors, hidden or not, pictures and all: what an admin reviews. */
  async forReview(donorIds: string[]): Promise<Map<string, BenefactorLink[]>> {
    if (donorIds.length === 0) return new Map();
    const rows = await this.prisma.donorLink.findMany({
      where: { donorId: { in: donorIds } },
      orderBy: [...AS_ADDED],
      select: LINK,
    });
    const byDonor = new Map<string, BenefactorLink[]>();
    for (const row of rows) {
      const links = byDonor.get(row.donorId) ?? [];
      links.push(shown(row, true));
      byDonor.set(row.donorId, links);
    }
    return byDonor;
  }

  /** Takes a donor's links off every list, or puts them back; the links themselves stay. */
  async setHidden(donorId: string, hidden: boolean): Promise<void> {
    const { count } = await this.prisma.donor.updateMany({
      where: { id: donorId },
      data: { linksHidden: hidden },
    });
    if (count === 0) throw new BadRequestException('No such donor');
  }

  /** An image's bytes (WebP), or null when there is no such image. */
  async imageBytes(id: string): Promise<Uint8Array | null> {
    const image = await this.prisma.linkImage.findUnique({
      where: { id },
      select: { bytes: true },
    });
    return image?.bytes ?? null;
  }
}
