import { funnelRowOf } from '../../prisma/funnel-rows.js';

const line = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    visitId: 'E228B730-9CD8-CD21-34FE-39CAD79203E2',
    step: 'VISIT',
    world: 'tinynyc',
    locale: 'en-US',
    city: null,
    amountCents: null,
    at: 1794278520,
    ...over,
  });

describe('funnelRowOf', () => {
  it('reads a step with the moment it happened', () => {
    expect(funnelRowOf(line())).toEqual({
      visitId: 'e228b730-9cd8-cd21-34fe-39cad79203e2',
      step: 'VISIT',
      world: 'tinynyc',
      locale: 'en-US',
      city: null,
      amountCents: null,
      createdAt: new Date('2026-11-10T02:42:00.000Z'),
    });
  });

  it('keeps what a checkout was for', () => {
    expect(
      funnelRowOf(
        line({
          step: 'CHECKOUT_STARTED',
          world: 'home',
          city: '  Buenos   Aires ',
          amountCents: 2500,
        }),
      ),
    ).toMatchObject({ city: 'Buenos Aires', amountCents: 2500 });
  });

  it('drops what is optional and unusable', () => {
    expect(
      funnelRowOf(line({ locale: 'fr-FR', city: '   ', amountCents: -5 })),
    ).toMatchObject({ locale: null, city: null, amountCents: null });
    expect(
      funnelRowOf(line({ city: 'x'.repeat(80), amountCents: 12.5 })),
    ).toMatchObject({ city: 'x'.repeat(60), amountCents: null });
  });

  it('refuses a line it cannot place, and says why', () => {
    expect(funnelRowOf('nonsense')).toBe('not JSON');
    expect(funnelRowOf('[1]')).toBe('not an object');
    expect(funnelRowOf(line({ visitId: 'someone' }))).toMatch(/visitId/);
    expect(funnelRowOf(line({ step: 'PAID' }))).toMatch(/step/);
    expect(funnelRowOf(line({ world: '../etc' }))).toMatch(/world/);
    expect(funnelRowOf(line({ at: '2026-11-10' }))).toMatch(/Unix seconds/);
    expect(funnelRowOf(line({ at: 4102444800 }))).toMatch(/future/);
  });
});
