import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { validateEnv, type Env } from '../config/env.js';
import { createLinkReader } from '../links/link-reader.js';
import { LinksService } from '../links/links.service.js';
import { WORLD_PATTERN } from '../donations/donation-facts.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createMailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { failureOf } from '../auth/failure.js';
import {
  describeListAnnouncement,
  ListAnnounceService,
  listsFellShort,
} from '../lists/list-announce.service.js';
import { SightsCatalog } from '../lists/sights-catalog.js';
import {
  AnnounceService,
  describeAnnouncement,
  fellShort,
} from './announce.service.js';
import { BenefactorsService } from './benefactors.service.js';

/**
 * Mails the donors of each world's city that it is built: once per city, so it is safe to run
 * on every deploy (deploy/deploy.sh does, after uploading the worlds). Then tells everyone
 * waiting on those cities' lists, or on new cities, who did not give to them: once each, one
 * mail per person for all the worlds of the run (ListAnnounceService), with buildings read from
 * the site's own files. Prints what happened, world by world, with counts and donor ids, never
 * an address. Exits 1 when a world fell short (a mail that did not go out, or an announcement
 * that failed) or the lists did (someone not mailed: the next run tries them; or an address the
 * mail server refused for good, said once, as it counts as told), 0 otherwise: an
 * unknown world, a city not marked BUILT yet, one announced before, or buildings that could not
 * be read (printed), are not errors. The environment is the API's own, checked the same way;
 * without a mail server (development) the mails go to the log.
 *
 *   node dist/benefactors/announce-cli.js <world>...   (the built image: npm run cities:announce)
 *   npm run cities:announce:dev -- <world>...          (a checkout: tsx)
 *
 * The services are put together by hand, not by Nest, so tsx (which emits no decorator
 * metadata) can run it too.
 */
config({ path: '.env', quiet: true });

const worlds = process.argv.slice(2);
if (!worlds.length || !worlds.every((world) => WORLD_PATTERN.test(world))) {
  console.error(
    'usage: announce-cli <world>...   (world ids, such as tinynyc tinyrao)',
  );
  process.exit(2);
}

const env = validateEnv(process.env);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
}) as unknown as PrismaService;
// the one thing the service reads of the configuration is the site's origin, already checked
const settings = {
  get: <K extends keyof Env>(key: K): Env[K] => env[key],
} as unknown as ConfigService<Env, true>;

const mailer = createMailer(env);
const announcer = new AnnounceService(
  prisma,
  settings,
  mailer,
  new BenefactorsService(prisma, new LinksService(prisma, createLinkReader())),
);
// the buildings come from the site, as a browser reads them (the real fetch)
const lists = new ListAnnounceService(
  prisma,
  settings,
  mailer,
  new SightsCatalog(settings, fetch),
);
let shortfall = false;
try {
  for (const world of worlds) {
    try {
      const done = await announcer.announce(world);
      for (const line of describeAnnouncement(done)) console.log(line);
      if (fellShort(done)) shortfall = true;
    } catch (error) {
      // what went wrong, never an address; the other worlds are still announced
      console.error(`${world}: the announcement failed: ${failureOf(error)}`);
      shortfall = true;
    }
  }
  // then the lists, every world of the run at once: one mail per person for all of them
  try {
    const done = await lists.announce(worlds);
    for (const line of describeListAnnouncement(done)) console.log(line);
    if (listsFellShort(done)) shortfall = true;
  } catch (error) {
    // nothing is lost: whoever was not mailed is tried again by the next run
    console.error(
      `The lists' announcement failed: ${failureOf(error)}. The next run tries again.`,
    );
    shortfall = true;
  }
} finally {
  await prisma.$disconnect();
}
process.exitCode = shortfall ? 1 : 0;
