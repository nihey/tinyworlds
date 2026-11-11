import { BadRequestException, Injectable } from '@nestjs/common';
import type { FunnelStep } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DAY_MS,
  daysOf,
  isTimeZone,
  MAX_DAYS,
  shapeFunnel,
  type GivenRow,
  type StepRow,
} from './funnel-report.js';
import type { DonationFunnel } from './models/donation-funnel.model.js';

/** One step of one visit, as the site or the checkout reports it. */
export interface FunnelStepFacts {
  visitId: string;
  step: FunnelStep;
  world: string;
  locale?: string | null;
  city?: string | null;
  amountCents?: number | null;
}

/** How many donations a report lists. */
export const RECENT_DONATIONS = 25;

/**
 * The donation funnel: which steps towards a donation each visit reached. The site reports the
 * steps it sees (a page opened, the donate sign opened, a checkout given up); the checkout
 * reports its own start; and the last step, a paid donation, is the donations table itself.
 */
@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a step. A visit reaches a step on a world once: saying it again changes nothing.
   * A VISIT is seen as it opens (`lastSeenAt`); the map then keeps it fresh (`VisitsService`).
   */
  async track(facts: FunnelStepFacts): Promise<void> {
    const now = new Date();
    await this.prisma.funnelEvent.createMany({
      data: [
        {
          visitId: facts.visitId,
          step: facts.step,
          world: facts.world,
          locale: facts.locale ?? null,
          city: facts.city ?? null,
          amountCents: facts.amountCents ?? null,
          // one clock for both, so how long a visit stayed never comes out below zero
          ...(facts.step === 'VISIT' && { createdAt: now, lastSeenAt: now }),
        },
      ],
      skipDuplicates: true,
    });
  }

  /**
   * The funnel over a period: the whole site, each world, each day (as days fall in the time
   * zone asked for), and the latest donations. Donations are counted by when they were paid.
   */
  async report(input: {
    from: Date;
    to: Date;
    timeZone?: string | null;
  }): Promise<DonationFunnel> {
    const { from, to } = input;
    const timeZone = input.timeZone || 'UTC';
    if (!isTimeZone(timeZone))
      throw new BadRequestException(`"${timeZone}" is not a time zone`);
    if (!(to.getTime() > from.getTime()))
      throw new BadRequestException('The period must end after it starts');
    // a day's grace: a year counted in local days may run an hour or so over
    if (to.getTime() - from.getTime() > (MAX_DAYS + 1) * DAY_MS)
      throw new BadRequestException(
        `The period may not be longer than ${MAX_DAYS} days`,
      );

    // The columns are timestamps without a zone, in UTC. Each end of the period is passed as
    // text and turned into just that, so the session's own time zone never comes into it.
    const since = from.toISOString();
    const until = to.toISOString();
    const db = this.prisma;

    const [
      steps,
      given,
      worldSteps,
      worldGiven,
      daySteps,
      dayGiven,
      recentDonations,
    ] = await Promise.all([
      db.$queryRaw<StepRow[]>`
          SELECT step, COUNT(DISTINCT visit_id)::int AS visits
          FROM funnel_events
          WHERE created_at >= (${since}::timestamptz AT TIME ZONE 'UTC')
            AND created_at < (${until}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY step`,
      db.$queryRaw<GivenRow[]>`
          SELECT COUNT(*)::int AS donations,
                 COALESCE(SUM(amount_cents) FILTER (WHERE currency = 'usd'), 0)::int AS "raisedCents"
          FROM donations
          WHERE created_at >= (${since}::timestamptz AT TIME ZONE 'UTC')
            AND created_at < (${until}::timestamptz AT TIME ZONE 'UTC')`,
      db.$queryRaw<(StepRow & { world: string })[]>`
          SELECT world, step, COUNT(*)::int AS visits
          FROM funnel_events
          WHERE created_at >= (${since}::timestamptz AT TIME ZONE 'UTC')
            AND created_at < (${until}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY world, step`,
      db.$queryRaw<(GivenRow & { world: string | null })[]>`
          SELECT world, COUNT(*)::int AS donations,
                 COALESCE(SUM(amount_cents) FILTER (WHERE currency = 'usd'), 0)::int AS "raisedCents"
          FROM donations
          WHERE created_at >= (${since}::timestamptz AT TIME ZONE 'UTC')
            AND created_at < (${until}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY world`,
      db.$queryRaw<(StepRow & { day: string })[]>`
          SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text, 'YYYY-MM-DD') AS day,
                 step, COUNT(DISTINCT visit_id)::int AS visits
          FROM funnel_events
          WHERE created_at >= (${since}::timestamptz AT TIME ZONE 'UTC')
            AND created_at < (${until}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1, step`,
      db.$queryRaw<(GivenRow & { day: string })[]>`
          SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text, 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS donations,
                 COALESCE(SUM(amount_cents) FILTER (WHERE currency = 'usd'), 0)::int AS "raisedCents"
          FROM donations
          WHERE created_at >= (${since}::timestamptz AT TIME ZONE 'UTC')
            AND created_at < (${until}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1`,
      db.donation.findMany({
        where: { createdAt: { gte: from, lt: to } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_DONATIONS,
        select: {
          id: true,
          createdAt: true,
          amountCents: true,
          currency: true,
          cityText: true,
          world: true,
          locale: true,
        },
      }),
    ]);

    return {
      from,
      to,
      timeZone,
      ...shapeFunnel(
        {
          steps,
          given: given[0] ?? { donations: 0, raisedCents: 0 },
          worldSteps,
          worldGiven,
          daySteps,
          dayGiven,
        },
        daysOf(from, to, timeZone),
      ),
      recentDonations: recentDonations.map(({ cityText, ...donation }) => ({
        ...donation,
        city: cityText,
      })),
    };
  }
}
