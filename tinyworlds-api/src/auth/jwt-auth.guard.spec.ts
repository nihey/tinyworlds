import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionIdentity } from './auth.service.js';
import { ForDonors } from './for-donors.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';

class AdminRoutes {
  route() {}
  @Public()
  open() {}
  @ForDonors()
  mine() {}
}

@ForDonors()
class DonorRoutes {
  route() {}
  @Public()
  open() {}
}

const ADMIN: SessionIdentity = {
  kind: 'admin',
  id: 'a1',
  email: 'admin@example.com',
};
const DONOR: SessionIdentity = {
  kind: 'donor',
  id: 'd1',
  email: 'ana@example.com',
};

type Request = { user?: SessionIdentity };

/** A call to one method of one of the classes above, over HTTP. */
const call = (target: object, method: string, req: Request) =>
  ({
    getHandler: () => (target as Record<string, unknown>)[method],
    getClass: () => target.constructor,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  /** Who passport finds in the request's bearer token; null: no valid session. */
  let bearer: SessionIdentity | null = null;
  const passport = vi.spyOn(
    Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => Promise<boolean>;
    },
    'canActivate',
  );

  beforeEach(() => {
    bearer = null;
    passport.mockReset();
    passport.mockImplementation((context: ExecutionContext) => {
      if (!bearer) return Promise.reject(new UnauthorizedException());
      context.switchToHttp().getRequest<Request>().user = bearer;
      return Promise.resolve(true);
    });
  });
  afterAll(() => passport.mockRestore());

  const guard = new JwtAuthGuard(new Reflector());
  const admin = new AdminRoutes();
  const donor = new DonorRoutes();
  const run = (target: object, method: string) =>
    guard.canActivate(call(target, method, {}));

  it('lets anyone through to a public route, without asking for a session', async () => {
    await expect(run(admin, 'open')).resolves.toBe(true);
    await expect(run(donor, 'open')).resolves.toBe(true);
    expect(passport).not.toHaveBeenCalled();
  });

  it('asks for a session everywhere else', async () => {
    for (const [target, method] of [
      [admin, 'route'],
      [admin, 'mine'],
      [donor, 'route'],
    ] as const)
      await expect(run(target, method)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
  });

  it('keeps an unmarked route for admins: a donor session is forbidden there', async () => {
    bearer = ADMIN;
    await expect(run(admin, 'route')).resolves.toBe(true);
    bearer = DONOR;
    await expect(run(admin, 'route')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('keeps a route marked for donors, on the class or the method, for donors', async () => {
    for (const [target, method] of [
      [admin, 'mine'],
      [donor, 'route'],
    ] as const) {
      bearer = DONOR;
      await expect(run(target, method)).resolves.toBe(true);
      bearer = ADMIN;
      await expect(run(target, method)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  it('forbids a session of no kind it knows', async () => {
    bearer = { ...ADMIN, kind: 'root' as SessionIdentity['kind'] };
    await expect(run(admin, 'route')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
