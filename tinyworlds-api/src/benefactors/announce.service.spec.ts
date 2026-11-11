import { isServerFailure } from '../mail/mailer.js';
import {
  type Announcement,
  describeAnnouncement,
  fellShort,
} from './announce.service.js';

const lisbon = { world: 'tinylis', city: 'Lisbon' };

describe('describeAnnouncement', () => {
  it('says what was sent, with counts and donor ids only', () => {
    const all: Announcement = {
      kind: 'sent',
      ...lisbon,
      mailed: 3,
      failed: [],
      unsent: [],
    };
    expect(describeAnnouncement(all)).toEqual([
      'Lisbon (tinylis) is announced: 3 mailed, 0 failed.',
    ]);
    expect(fellShort(all)).toBe(false);
  });

  it('says when an announcement went out only partly, and that it stays done', () => {
    const partly: Extract<Announcement, { kind: 'sent' }> = {
      kind: 'sent',
      ...lisbon,
      mailed: 1,
      failed: ['d2'],
      unsent: ['d3', 'd4'],
    };
    expect(describeAnnouncement(partly)).toEqual([
      'Lisbon (tinylis) is announced, but only partly: 1 mailed, 1 failed, 2 not tried once the mail server failed.',
      'Not mailed (donor ids): d2, d3, d4',
      'It counts as announced: a later run will not mail them.',
    ]);
    expect(fellShort(partly)).toBe(true);
    expect(
      describeAnnouncement({ ...partly, failed: ['d2'], unsent: [] })[0],
    ).toBe(
      'Lisbon (tinylis) is announced, but only partly: 1 mailed, 1 failed.',
    );
  });

  it('says when nothing went out, and that the next run tries again', () => {
    const none: Announcement = {
      kind: 'not-sent',
      ...lisbon,
      failed: ['d1'],
      unsent: ['d2', 'd3'],
    };
    expect(describeAnnouncement(none)).toEqual([
      'Lisbon (tinylis): nothing was sent (1 failed, 2 not tried once the mail server failed). It is left unannounced: the next run tries again.',
      'Not mailed (donor ids): d1, d2, d3',
    ]);
    expect(fellShort(none)).toBe(true);
  });

  it('says why nothing was to be sent', () => {
    const unknown: Announcement = { kind: 'unknown', world: 'tinyxyz' };
    expect(describeAnnouncement(unknown)).toEqual([
      'No city has the world tinyxyz: nothing to announce.',
    ]);
    expect(fellShort(unknown)).toBe(false);
    expect(
      describeAnnouncement({ kind: 'not-built', ...lisbon, status: 'FUNDED' }),
    ).toEqual([
      'Lisbon (tinylis) is FUNDED, not BUILT: run the seed first (npm run seed), then announce again.',
    ]);
    expect(
      describeAnnouncement({
        kind: 'announced-before',
        ...lisbon,
        at: new Date('2026-11-11T21:00:00Z'),
      }),
    ).toEqual([
      'Lisbon (tinylis) was announced on 2026-11-11T21:00:00.000Z: nothing to send.',
    ]);
  });
});

describe('isServerFailure', () => {
  it('tells a mail server that is away from one address it refused', () => {
    for (const code of ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EAUTH'])
      expect(isServerFailure(Object.assign(new Error('x'), { code }))).toBe(
        true,
      );
    expect(
      isServerFailure(Object.assign(new Error('x'), { code: 'EENVELOPE' })),
    ).toBe(false);
    expect(isServerFailure(new Error('x'))).toBe(false);
    expect(isServerFailure(null)).toBe(false);
  });
});
