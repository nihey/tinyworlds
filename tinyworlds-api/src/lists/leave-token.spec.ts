import { leaveToken, readLeaveToken } from './leave-token.js';

const SECRET = 'a secret';
const DONOR = '0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10';
const LIST = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

describe('leave tokens', () => {
  it('reads back what it signed', () => {
    expect(readLeaveToken(SECRET, leaveToken(SECRET, DONOR, LIST))).toEqual({
      donorId: DONOR,
      list: LIST,
    });
    expect(readLeaveToken(SECRET, leaveToken(SECRET, DONOR, '*'))).toEqual({
      donorId: DONOR,
      list: '*',
    });
  });

  it('refuses a token whose donor, list or mac was changed', () => {
    const [donor, list, mac] = leaveToken(SECRET, DONOR, LIST).split('.');
    expect(readLeaveToken(SECRET, `${LIST}.${list}.${mac}`)).toBeNull();
    expect(readLeaveToken(SECRET, `${donor}.*.${mac}`)).toBeNull();
    expect(readLeaveToken(SECRET, `${donor}.${list}.${mac}x`)).toBeNull();
    expect(readLeaveToken(SECRET, `${donor}.${list}.AAAA`)).toBeNull();
    expect(
      readLeaveToken('another secret', leaveToken(SECRET, DONOR, LIST)),
    ).toBeNull();
  });

  it('refuses garbage', () => {
    for (const token of ['', 'a.b', 'a.b.c.d'])
      expect(readLeaveToken(SECRET, token)).toBeNull();
  });
});
