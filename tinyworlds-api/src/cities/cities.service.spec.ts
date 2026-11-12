import { FakeMailer } from '../../test/fake-mailer.js';
import type { SightsCatalog } from '../lists/sights-catalog.js';
import type { ConfigService } from '@nestjs/config';
import { FakePrisma } from '../../test/fake-prisma.js';
import type { Env } from '../config/env.js';
import { ListsService } from '../lists/lists.service.js';
import {
  CitiesService,
  inMilestoneOrder,
  type MilestoneRow,
} from './cities.service.js';

const row = (over: Partial<MilestoneRow> & { name: string }): MilestoneRow => ({
  id: `id-${over.name}`,
  slug: over.name.toLowerCase(),
  status: 'PROPOSED',
  goalCents: 10_000,
  raisedCents: 0,
  donationCount: 0,
  worldId: null,
  ...over,
});

describe('inMilestoneOrder', () => {
  it('puts the best funded first, ties by name, and what is built last', () => {
    const list = inMilestoneOrder([
      row({ name: 'New York', status: 'BUILT', worldId: 'tinynyc' }),
      row({ name: 'Tokyo' }),
      row({ name: 'Paris', raisedCents: 2500 }),
      row({ name: 'London' }),
      row({ name: 'Lisbon', raisedCents: 12_000, status: 'FUNDED' }),
      row({
        name: 'Athens',
        status: 'BUILT',
        worldId: 'tinyath',
        raisedCents: 99_999,
      }),
      row({ name: 'Berlin', raisedCents: 2500, status: 'BUILDING' }),
    ]);
    expect(list.map((c) => c.name)).toEqual([
      'Lisbon',
      'Berlin',
      'Paris',
      'London',
      'Tokyo',
      'Athens',
      'New York',
    ]);
  });

  it('reports the number of donations under the name the API uses', () => {
    const [city] = inMilestoneOrder([
      row({ name: 'Paris', raisedCents: 700, donationCount: 3 }),
    ]);
    expect(city).toEqual({
      id: 'id-Paris',
      slug: 'paris',
      name: 'Paris',
      raisedCents: 700,
      goalCents: 10_000,
      donations: 3,
      status: 'PROPOSED',
      worldId: null,
      waiting: 0,
    });
  });
});

describe('CitiesService.milestones', () => {
  it("carries each city's waiting, 0 without anyone", async () => {
    const prisma = new FakePrisma();
    const lisbon = prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
    prisma.seedCity({ slug: 'rome', name: 'Rome' });
    const donor = 'd0000000-0000-4000-8000-000000000001';
    prisma.listMembers.push({
      id: 'm1',
      donorId: donor,
      cityId: lisbon.id,
      locale: 'en-US',
      createdAt: new Date(),
    });
    prisma.listMembers.push({
      id: 'm2',
      donorId: donor,
      cityId: null,
      locale: 'en-US',
      createdAt: new Date(),
    });
    const lists = new ListsService(
      prisma.asService(),
      { get: () => 'x' } as unknown as ConfigService<Env, true>,
      new FakeMailer(),
      {} as SightsCatalog,
    );
    const cities = await new CitiesService(
      prisma.asService(),
      lists,
    ).milestones();
    expect(cities.map((c) => [c.slug, c.waiting])).toEqual([
      ['lisbon', 1],
      ['rome', 0],
    ]);
  });
});
