import {
  daysOf,
  isTimeZone,
  noCounts,
  shapeFunnel,
  type FunnelRows,
} from './funnel-report.js';

const at = (iso: string) => new Date(iso);

describe('daysOf', () => {
  it('lists every day of a period, oldest first, without the day it ends at', () => {
    expect(
      daysOf(at('2026-11-08T00:00:00Z'), at('2026-11-11T00:00:00Z'), 'UTC'),
    ).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });

  it('counts days where the admin is, not in UTC', () => {
    // 01:00 UTC on the 10th is still the 9th in São Paulo
    expect(
      daysOf(
        at('2026-11-10T01:00:00Z'),
        at('2026-11-10T02:00:00Z'),
        'America/Sao_Paulo',
      ),
    ).toEqual(['2026-11-09']);
    expect(
      daysOf(
        at('2026-11-09T03:00:00Z'),
        at('2026-11-11T03:00:00Z'),
        'America/Sao_Paulo',
      ),
    ).toEqual(['2026-11-09', '2026-11-10']);
  });

  it('neither skips nor repeats a day when the clocks change', () => {
    // New York: clocks go back on 1 November 2026 and forward on 8 March 2026
    expect(
      daysOf(
        at('2026-10-31T04:00:00Z'),
        at('2026-11-03T05:00:00Z'),
        'America/New_York',
      ),
    ).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(
      daysOf(
        at('2026-03-07T05:00:00Z'),
        at('2026-03-10T04:00:00Z'),
        'America/New_York',
      ),
    ).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });

  it('is empty for a period that does not run forwards', () => {
    const noon = at('2026-11-10T12:00:00Z');
    expect(daysOf(noon, noon, 'UTC')).toEqual([]);
    expect(daysOf(noon, at('2026-11-09T12:00:00Z'), 'UTC')).toEqual([]);
  });
});

describe('isTimeZone', () => {
  it('knows the zones the runtime knows', () => {
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone("UTC'; DROP TABLE donations; --")).toBe(false);
  });
});

describe('shapeFunnel', () => {
  const rows: FunnelRows = {
    steps: [
      { step: 'VISIT', visits: 100 },
      { step: 'DONATE_OPENED', visits: 12 },
      { step: 'CHECKOUT_STARTED', visits: 4 },
      { step: 'CHECKOUT_CANCELLED', visits: 1 },
    ],
    given: { donations: 2, raisedCents: 3500 },
    worldSteps: [
      { world: 'home', step: 'VISIT', visits: 30 },
      { world: 'tinynyc', step: 'VISIT', visits: 80 },
      { world: 'tinynyc', step: 'DONATE_OPENED', visits: 10 },
      { world: 'tinynyc', step: 'CHECKOUT_STARTED', visits: 4 },
      { world: 'tinyrao', step: 'VISIT', visits: 5 },
    ],
    worldGiven: [
      { world: 'tinynyc', donations: 1, raisedCents: 2500 },
      { world: null, donations: 1, raisedCents: 1000 },
    ],
    daySteps: [
      { day: '2026-11-09', step: 'VISIT', visits: 40 },
      { day: '2026-11-10', step: 'VISIT', visits: 60 },
      { day: '2026-11-10', step: 'DONATE_OPENED', visits: 12 },
      // outside the days asked for: left out
      { day: '2026-11-12', step: 'VISIT', visits: 9 },
    ],
    dayGiven: [{ day: '2026-11-10', donations: 2, raisedCents: 3500 }],
  };
  const days = ['2026-11-08', '2026-11-09', '2026-11-10'];

  it('adds the steps and the donations up into the totals', () => {
    expect(shapeFunnel(rows, days).totals).toEqual({
      visits: 100,
      donateOpened: 12,
      checkoutStarted: 4,
      checkoutCancelled: 1,
      donations: 2,
      raisedCents: 3500,
    });
  });

  it('lists the worlds by visits, with the donations that name none last', () => {
    const { worlds } = shapeFunnel(rows, days);
    expect(worlds.map((world) => [world.world, world.visits])).toEqual([
      ['tinynyc', 80],
      ['home', 30],
      ['tinyrao', 5],
      [null, 0],
    ]);
    expect(worlds[0]).toMatchObject({
      donateOpened: 10,
      checkoutStarted: 4,
      donations: 1,
      raisedCents: 2500,
    });
    expect(worlds[3]).toMatchObject({ donations: 1, raisedCents: 1000 });
  });

  it('gives every day of the period, the quiet ones at zero', () => {
    const shaped = shapeFunnel(rows, days);
    expect(shaped.days.map((day) => day.day)).toEqual(days);
    expect(shaped.days[0]).toEqual({ day: '2026-11-08', ...noCounts() });
    expect(shaped.days[2]).toMatchObject({
      visits: 60,
      donateOpened: 12,
      donations: 2,
      raisedCents: 3500,
    });
  });

  it('is all zeros when nothing happened', () => {
    const quiet = shapeFunnel(
      {
        steps: [],
        given: { donations: 0, raisedCents: 0 },
        worldSteps: [],
        worldGiven: [],
        daySteps: [],
        dayGiven: [],
      },
      ['2026-11-10'],
    );
    expect(quiet.totals).toEqual(noCounts());
    expect(quiet.worlds).toEqual([]);
    expect(quiet.days).toEqual([{ day: '2026-11-10', ...noCounts() }]);
  });
});
