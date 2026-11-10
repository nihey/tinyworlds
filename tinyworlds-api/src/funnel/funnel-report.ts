import { FunnelStep } from '../generated/prisma/enums.js';

/** What is counted of a funnel, whatever it is the funnel of. */
export interface Counts {
  visits: number;
  donateOpened: number;
  checkoutStarted: number;
  checkoutCancelled: number;
  donations: number;
  raisedCents: number;
}

/** How many visits reached a step. */
export interface StepRow {
  step: FunnelStep;
  visits: number;
}

/** What was given. */
export interface GivenRow {
  donations: number;
  raisedCents: number;
}

export interface FunnelRows {
  steps: StepRow[];
  given: GivenRow;
  worldSteps: (StepRow & { world: string })[];
  worldGiven: (GivenRow & { world: string | null })[];
  daySteps: (StepRow & { day: string })[];
  dayGiven: (GivenRow & { day: string })[];
}

export interface FunnelShape {
  totals: Counts;
  worlds: (Counts & { world: string | null })[];
  days: (Counts & { day: string })[];
}

const FIELD: Record<
  FunnelStep,
  'visits' | 'donateOpened' | 'checkoutStarted' | 'checkoutCancelled'
> = {
  VISIT: 'visits',
  DONATE_OPENED: 'donateOpened',
  CHECKOUT_STARTED: 'checkoutStarted',
  CHECKOUT_CANCELLED: 'checkoutCancelled',
};

export const noCounts = (): Counts => ({
  visits: 0,
  donateOpened: 0,
  checkoutStarted: 0,
  checkoutCancelled: 0,
  donations: 0,
  raisedCents: 0,
});

/** The longest period a report covers. */
export const MAX_DAYS = 366;

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Whether the runtime knows a time zone by that name. */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every calendar day a period touches in a time zone, oldest first, as "2026-11-10". The end
 * is excluded: a period that stops at midnight does not reach into the next day.
 */
export function daysOf(from: Date, to: Date, timeZone: string): string[] {
  // en-CA writes dates the ISO way
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const days: string[] = [];
  const last = to.getTime() - 1;
  if (last < from.getTime()) return days;
  // by the hour: a day is 23 to 25 hours long where clocks change, and some zones sit on a
  // half hour, so no longer stride is sure to step into every day
  for (let t = from.getTime(); ; t = Math.min(t + HOUR_MS, last)) {
    const day = format.format(t);
    if (days[days.length - 1] !== day) days.push(day);
    if (t >= last) break;
  }
  return days;
}

/** The counted rows as the report gives them: the total, by world, and one entry for every day. */
export function shapeFunnel(rows: FunnelRows, days: string[]): FunnelShape {
  const totals = noCounts();
  for (const row of rows.steps) totals[FIELD[row.step]] = row.visits;
  totals.donations = rows.given.donations;
  totals.raisedCents = rows.given.raisedCents;

  const worlds = new Map<string | null, Counts & { world: string | null }>();
  const worldOf = (world: string | null) => {
    let entry = worlds.get(world);
    if (!entry) worlds.set(world, (entry = { world, ...noCounts() }));
    return entry;
  };
  for (const row of rows.worldSteps)
    worldOf(row.world)[FIELD[row.step]] = row.visits;
  for (const row of rows.worldGiven) {
    const entry = worldOf(row.world);
    entry.donations = row.donations;
    entry.raisedCents = row.raisedCents;
  }

  const byDay = new Map(days.map((day) => [day, { day, ...noCounts() }]));
  for (const row of rows.daySteps) {
    const entry = byDay.get(row.day);
    if (entry) entry[FIELD[row.step]] = row.visits;
  }
  for (const row of rows.dayGiven) {
    const entry = byDay.get(row.day);
    if (!entry) continue;
    entry.donations = row.donations;
    entry.raisedCents = row.raisedCents;
  }

  return {
    totals,
    worlds: [...worlds.values()].sort(
      (a, b) =>
        b.visits - a.visits ||
        b.donations - a.donations ||
        (a.world ?? '').localeCompare(b.world ?? '', 'en'),
    ),
    days: [...byDay.values()],
  };
}
