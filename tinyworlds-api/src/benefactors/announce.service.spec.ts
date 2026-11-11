import { describeAnnouncement } from './announce.service.js';

describe('describeAnnouncement', () => {
  it('says what was done, with counts and donor ids only', () => {
    expect(
      describeAnnouncement({
        kind: 'sent',
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 3,
        failed: [],
      }),
    ).toEqual(['Lisbon (tinylis) is announced: 3 mailed, 0 failed.']);
    expect(
      describeAnnouncement({
        kind: 'sent',
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 1,
        failed: ['d1', 'd2'],
      }),
    ).toEqual([
      'Lisbon (tinylis) is announced: 1 mailed, 2 failed.',
      'Not mailed (donor ids): d1, d2',
    ]);
  });

  it('says why nothing was sent', () => {
    expect(describeAnnouncement({ kind: 'unknown', world: 'tinyxyz' })).toEqual(
      ['No city has the world tinyxyz: nothing to announce.'],
    );
    expect(
      describeAnnouncement({
        kind: 'not-built',
        world: 'tinylis',
        city: 'Lisbon',
        status: 'FUNDED',
      }),
    ).toEqual([
      'Lisbon (tinylis) is FUNDED, not BUILT: run the seed first (npm run seed), then announce again.',
    ]);
    expect(
      describeAnnouncement({
        kind: 'announced-before',
        world: 'tinylis',
        city: 'Lisbon',
        at: new Date('2026-11-11T21:00:00Z'),
      }),
    ).toEqual([
      'Lisbon (tinylis) was announced on 2026-11-11T21:00:00.000Z: nothing to send.',
    ]);
  });
});
