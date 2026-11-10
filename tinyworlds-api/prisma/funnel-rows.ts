import type { FunnelStep } from '../src/generated/prisma/enums.js';

/** A funnel step as it is kept, with the moment it happened. */
export interface FunnelRow {
  visitId: string;
  step: FunnelStep;
  world: string;
  locale: string | null;
  city: string | null;
  amountCents: number | null;
  createdAt: Date;
}

const STEPS: readonly string[] = [
  'VISIT',
  'DONATE_OPENED',
  'CHECKOUT_STARTED',
  'CHECKOUT_CANCELLED',
];
const LOCALES: readonly string[] = ['en-US', 'pt-BR', 'es-ES'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORLD = /^[a-z0-9]{3,20}$/;
const CITY_MAX = 60;
const AMOUNT_MAX_CENTS = 1_000_000;

/**
 * One line of an import file → the step it describes, or the reason it is refused. A line is a
 * JSON object: `visitId` (a UUID), `step`, `world`, `at` (Unix seconds), and optionally
 * `locale`, `city` and `amountCents`. What is optional and unusable is dropped; what is
 * required and unusable refuses the line.
 */
export function funnelRowOf(line: string): FunnelRow | string {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return 'not an object';
    data = parsed as Record<string, unknown>;
  } catch {
    return 'not JSON';
  }
  const { visitId, step, world, locale, city, amountCents, at } = data;
  if (typeof visitId !== 'string' || !UUID.test(visitId))
    return 'visitId is not a UUID';
  if (typeof step !== 'string' || !STEPS.includes(step))
    return 'step is not a funnel step';
  if (typeof world !== 'string' || !WORLD.test(world))
    return 'world is not a world id';
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0)
    return 'at is not a time in Unix seconds';
  const createdAt = new Date(at * 1000);
  if (createdAt.getTime() > Date.now() + 60_000) return 'at is in the future';
  const tidyCity =
    typeof city === 'string' ? city.replace(/\s+/g, ' ').trim() : '';
  return {
    visitId: visitId.toLowerCase(),
    step: step as FunnelStep,
    world,
    locale:
      typeof locale === 'string' && LOCALES.includes(locale) ? locale : null,
    city: tidyCity ? tidyCity.slice(0, CITY_MAX) : null,
    amountCents:
      typeof amountCents === 'number' &&
      Number.isInteger(amountCents) &&
      amountCents > 0 &&
      amountCents <= AMOUNT_MAX_CENTS
        ? amountCents
        : null,
    createdAt,
  };
}
