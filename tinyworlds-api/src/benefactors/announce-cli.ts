import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { validateEnv, type Env } from '../config/env.js';
import { WORLD_PATTERN } from '../donations/donation-facts.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createMailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AnnounceService, describeAnnouncement } from './announce.service.js';
import { BenefactorsService } from './benefactors.service.js';

/**
 * Mails the donors of a world's city that it is built: once, so it is safe to run on every
 * deploy (deploy/deploy.sh does, after uploading the world). Prints counts and donor ids, never
 * an address; exits 1 when a mail did not go out, 0 otherwise (an unknown world, a city not
 * marked BUILT yet, or one announced before, are not errors). The environment is the API's own,
 * checked the same way; without a mail server (development) the mails go to the log.
 *
 *   node dist/benefactors/announce-cli.js <world>   (the built image: npm run cities:announce)
 *   npm run cities:announce:dev -- <world>          (a checkout: tsx)
 *
 * The services are put together by hand, not by Nest, so tsx (which emits no decorator
 * metadata) can run it too.
 */
config({ path: '.env', quiet: true });

const world = process.argv[2] ?? '';
if (!WORLD_PATTERN.test(world)) {
  console.error('usage: announce-cli <world>   (a world id, such as tinynyc)');
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

try {
  const done = await new AnnounceService(
    prisma,
    settings,
    createMailer(env),
    new BenefactorsService(prisma),
  ).announce(world);
  for (const line of describeAnnouncement(done)) console.log(line);
  process.exitCode = done.kind === 'sent' && done.failed.length ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
