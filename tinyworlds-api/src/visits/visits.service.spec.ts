import { FakePrisma } from '../../test/fake-prisma.js';
import { CACHE_MS, LIVE_MS, VisitsService } from './visits.service.js';

const visit = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const NOW = new Date('2026-11-11T15:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function setup() {
  const prisma = new FakePrisma();
  return { prisma, service: new VisitsService(prisma.asService()) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VisitsService.stillHere', () => {
  it("marks an open map's visit as seen now", async () => {
    const { service, prisma } = setup();
    prisma.events.push({
      visitId: visit(1),
      step: 'VISIT',
      world: 'tinynyc',
      locale: 'en-US',
      city: null,
      amountCents: null,
      lastSeenAt: ago(30_000),
    });
    await service.stillHere({ visitId: visit(1), world: 'tinynyc' });
    expect(prisma.events).toEqual([
      expect.objectContaining({ step: 'VISIT', lastSeenAt: NOW }),
    ]);
  });

  it('counts a visit whose opening never arrived', async () => {
    const { service, prisma } = setup();
    await service.stillHere({
      visitId: visit(2),
      world: 'tinyrao',
      locale: 'pt-BR',
    });
    expect(prisma.events).toEqual([
      {
        visitId: visit(2),
        step: 'VISIT',
        world: 'tinyrao',
        locale: 'pt-BR',
        city: null,
        amountCents: null,
        lastSeenAt: NOW,
      },
    ]);
  });

  it("leaves the visit's other steps and worlds alone", async () => {
    const { service, prisma } = setup();
    const opened = {
      visitId: visit(3),
      step: 'DONATE_OPENED' as const,
      world: 'tinynyc',
      locale: null,
      city: null,
      amountCents: null,
    };
    prisma.events.push(opened);
    await service.stillHere({ visitId: visit(3), world: 'tinynyc' });
    await service.stillHere({ visitId: visit(3), world: 'tinynyc' });
    expect(prisma.events).toHaveLength(2);
    expect(prisma.events[0]).toEqual(opened);
  });
});

describe('VisitsService.ofWorlds', () => {
  function seen(n: number, world: string, lastSeenAt: Date | null) {
    return {
      visitId: visit(n),
      step: 'VISIT' as const,
      world,
      locale: null,
      city: null,
      amountCents: null,
      lastSeenAt,
    };
  }

  it("counts each world's visits, and those still open", async () => {
    const { service, prisma } = setup();
    prisma.events.push(
      // from the history: no sign of life recorded
      seen(1, 'tinynyc', null),
      seen(2, 'tinynyc', ago(LIVE_MS + 1_000)),
      seen(3, 'tinynyc', ago(10_000)),
      seen(4, 'tinynyc', ago(LIVE_MS)),
      seen(5, 'tinyrao', ago(5_000)),
      // a step that is not a visit is not one more visit
      { ...seen(3, 'tinynyc', null), step: 'DONATE_OPENED' },
    );
    expect(await service.ofWorlds(['tinynyc', 'tinyrao'])).toEqual([
      { world: 'tinynyc', visits: 4, live: 2 },
      { world: 'tinyrao', visits: 1, live: 1 },
    ]);
  });

  it('answers the worlds asked, in that order, once each, nothing for one never visited', async () => {
    const { service, prisma } = setup();
    prisma.events.push(seen(1, 'tinynyc', NOW), seen(2, 'made-up', NOW));
    expect(await service.ofWorlds(['tinyfte', 'tinynyc', 'tinyfte'])).toEqual([
      { world: 'tinyfte', visits: 0, live: 0 },
      { world: 'tinynyc', visits: 1, live: 1 },
    ]);
  });

  it('counts again only every few seconds, however often it is asked', async () => {
    const { service, prisma } = setup();
    prisma.events.push(seen(1, 'tinynyc', NOW));
    expect(await service.ofWorlds(['tinynyc'])).toEqual([
      { world: 'tinynyc', visits: 1, live: 1 },
    ]);

    prisma.events.push(seen(2, 'tinynyc', NOW));
    vi.setSystemTime(new Date(NOW.getTime() + CACHE_MS - 1));
    expect((await service.ofWorlds(['tinynyc']))[0].visits).toBe(1);

    vi.setSystemTime(new Date(NOW.getTime() + CACHE_MS));
    expect((await service.ofWorlds(['tinynyc']))[0].visits).toBe(2);
  });

  it("adds up the worlds' visits, and leaves the front page out", async () => {
    const { service, prisma } = setup();
    prisma.events.push(
      seen(1, 'tinynyc', NOW),
      seen(2, 'tinynyc', null),
      seen(3, 'tinyrao', null),
      seen(4, 'home', NOW),
      seen(5, 'made-up', NOW),
    );
    expect(await service.totalOf(['tinynyc', 'tinyrao', 'home'])).toBe(3);
    expect(await service.totalOf([])).toBe(0);
  });

  it('asks again after a count that failed', async () => {
    const { service, prisma } = setup();
    const groupBy = prisma.funnelEvent.groupBy;
    prisma.funnelEvent.groupBy = () => Promise.reject(new Error('away'));
    await expect(service.ofWorlds(['tinynyc'])).rejects.toThrow('away');

    prisma.funnelEvent.groupBy = groupBy;
    prisma.events.push(seen(1, 'tinynyc', NOW));
    expect((await service.ofWorlds(['tinynyc']))[0].visits).toBe(1);
  });
});
