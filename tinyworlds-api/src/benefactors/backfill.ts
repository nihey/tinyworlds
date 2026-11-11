import { donorEmailOf } from '../donations/donation-facts.js';
import type { StripeClient } from '../donations/stripe.provider.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Gives the donations that have no donor yet theirs, from the address Stripe holds for each
 * session. Safe to run again (only donations with no donor are looked at); never touches
 * `listed`; logs counts only, never addresses.
 */
export async function backfillDonors(
  prisma: PrismaService,
  stripe: StripeClient,
  log: (line: string) => void,
): Promise<{ filled: number; skipped: number }> {
  const pending = await prisma.donation.findMany({
    where: { donorId: null },
    select: { id: true, stripeSessionId: true },
  });
  log(`${pending.length} donations without a donor`);
  let filled = 0;
  let skipped = 0;
  for (const row of pending) {
    let email: string | null = null;
    try {
      email = donorEmailOf(
        await stripe.checkout.sessions.retrieve(row.stripeSessionId),
      );
    } catch {
      // Stripe has no such session, or could not answer: leave it for the next run
    }
    if (!email) {
      skipped++;
      continue;
    }
    const donor = await prisma.donor.upsert({
      where: { email },
      create: { email, displayName: null },
      update: {},
    });
    await prisma.donation.update({
      where: { id: row.id },
      data: { donorId: donor.id },
    });
    filled++;
  }
  log(`${filled} filled, ${skipped} skipped`);
  return { filled, skipped };
}
