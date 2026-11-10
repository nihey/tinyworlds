import { BadRequestException } from '@nestjs/common';
import { FakePrisma } from '../../test/fake-prisma.js';
import { FunnelService } from './funnel.service.js';

const VISIT = '0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10';

function setup() {
  const prisma = new FakePrisma();
  return { prisma, service: new FunnelService(prisma.asService()) };
}

describe('FunnelService.track', () => {
  it('records a step of a visit', async () => {
    const { service, prisma } = setup();
    await service.track({
      visitId: VISIT,
      step: 'VISIT',
      world: 'tinynyc',
      locale: 'pt-BR',
    });
    expect(prisma.events).toEqual([
      {
        visitId: VISIT,
        step: 'VISIT',
        world: 'tinynyc',
        locale: 'pt-BR',
        city: null,
        amountCents: null,
      },
    ]);
  });

  it('records a step once per visit and world, however often it is said', async () => {
    const { service, prisma } = setup();
    const step = { visitId: VISIT, step: 'DONATE_OPENED' } as const;
    await service.track({ ...step, world: 'tinynyc' });
    await service.track({ ...step, world: 'tinynyc' });
    await service.track({ ...step, world: 'home' });
    await service.track({ ...step, step: 'VISIT', world: 'tinynyc' });
    expect(prisma.events.map((event) => [event.step, event.world])).toEqual([
      ['DONATE_OPENED', 'tinynyc'],
      ['DONATE_OPENED', 'home'],
      ['VISIT', 'tinynyc'],
    ]);
  });
});

describe('FunnelService.report', () => {
  const from = new Date('2026-11-01T00:00:00Z');

  it('refuses a period that runs backwards, or over a year', async () => {
    const { service } = setup();
    await expect(service.report({ from, to: from })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.report({ from, to: new Date('2027-11-10T00:00:00Z') }),
    ).rejects.toThrow(/366 days/);
  });

  it('refuses a time zone nobody lives in', async () => {
    const { service } = setup();
    await expect(
      service.report({
        from,
        to: new Date('2026-11-08T00:00:00Z'),
        timeZone: 'Mars/Olympus_Mons',
      }),
    ).rejects.toThrow(/not a time zone/);
  });
});
