import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyLinkDto } from './verify-link.dto.js';

const errors = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(VerifyLinkDto, body))).length;

describe('VerifyLinkDto', () => {
  const token = 'x'.repeat(43);
  const email = 'a@example.com';

  it('takes a token alone, or an email with a code however pasted', async () => {
    expect(await errors({ token })).toBe(0);
    expect(await errors({ email, code: '482 913' })).toBe(0);
    expect(await errors({ email, code: '482-913' })).toBe(0);
  });

  it('refuses neither, both, half a pair, a non-string and a short token', async () => {
    expect(await errors({})).toBeGreaterThan(0);
    expect(await errors({ token, email, code: '482913' })).toBeGreaterThan(0);
    expect(await errors({ token, code: '482913' })).toBeGreaterThan(0);
    expect(await errors({ email })).toBeGreaterThan(0);
    expect(await errors({ code: '482913' })).toBeGreaterThan(0);
    expect(await errors({ token: 123, email })).toBeGreaterThan(0);
    expect(
      await errors({ token: null, email, code: '482913' }),
    ).toBeGreaterThan(0);
    expect(await errors({ token: 'short' })).toBeGreaterThan(0);
    expect(await errors({ token: 'short', code: 'x' })).toBeGreaterThan(0);
  });

  it("takes a code's purpose, admin when left out, and nothing else", async () => {
    const dto = (body: Record<string, unknown>) =>
      plainToInstance(VerifyLinkDto, body);
    expect(await errors({ email, code: '482913', purpose: 'donor' })).toBe(0);
    expect(await errors({ email, code: '482913', purpose: 'admin' })).toBe(0);
    expect(dto({ email, code: '482913' }).purpose).toBe('admin');
    expect(
      await errors({ email, code: '482913', purpose: 'root' }),
    ).toBeGreaterThan(0);
    expect(
      await errors({ email, code: '482913', purpose: null }),
    ).toBeGreaterThan(0);
  });
});
