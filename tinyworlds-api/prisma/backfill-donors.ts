import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import Stripe from 'stripe';
import { backfillDonors } from '../src/benefactors/backfill.js';
import { STRIPE_TIMEOUT_MS } from '../src/donations/stripe.provider.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Gives past donations their donors, from the address Stripe holds for each checkout session.
 * Safe to run again; never changes who is listed; prints counts only. Run once after deploying:
 *
 *   npm run donors:backfill
 */
config({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('STRIPE_SECRET_KEY is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const stripe = new Stripe(key, {
  timeout: STRIPE_TIMEOUT_MS,
  maxNetworkRetries: 2,
});

try {
  await backfillDonors(prisma as unknown as PrismaService, stripe, console.log);
} finally {
  await prisma.$disconnect();
}
