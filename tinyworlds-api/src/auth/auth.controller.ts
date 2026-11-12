import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService, failureOf, type Account } from './auth.service.js';
import { RequestLinkDto } from './dto/request-link.dto.js';
import { VerifyLinkDto } from './dto/verify-link.dto.js';
import { Public } from './public.decorator.js';

/** Sign-in attempts one address may make per minute, asking and verifying counted apart. */
export const SIGN_INS_PER_MINUTE = 5;

/** What a new session looks like to the site: whose it is, under `admin` or `donor`. */
export type SessionAnswer = {
  accessToken: string;
  /** ISO 8601. */
  expiresAt: string;
} & ({ admin: Account } | { donor: Account });

/** Signing in: REST, as auth is everywhere in these projects. Everything else is GraphQL. */
@Controller('auth')
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: SIGN_INS_PER_MINUTE, ttl: 60_000 } })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  /**
   * Asks for a sign-in link, an admin's or a donor's. The answer is the same whoever asks, and it
   * does not wait for the mail: neither what it says nor how long it takes tells an admin's
   * address, or a donor's, from any other.
   */
  @Post('magic-link')
  @HttpCode(202)
  requestLink(@Body() body: RequestLinkDto): { sent: true } {
    const target = this.auth.linkTarget(body.returnUrl);
    setImmediate(() => {
      this.auth
        .sendLink(
          body.email,
          target,
          body.locale ?? 'en-US',
          body.purpose,
          body.list,
        )
        .catch((error: unknown) =>
          this.logger.error(
            `A sign-in link could not be made: ${failureOf(error)}`,
          ),
        );
    });
    return { sent: true };
  }

  /**
   * Trades a link's token, or an address and the code from its mail, for a session (the code's
   * `purpose` says whose); 401 when the link is spent, stale or unknown.
   */
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() body: VerifyLinkDto): Promise<SessionAnswer> {
    const { accessToken, expiresAt, identity } =
      body.token !== undefined
        ? await this.auth.verify(body.token)
        : await this.auth.verifyCode(
            body.email ?? '',
            body.code ?? '',
            body.purpose,
          );
    // the address the person typed, back to them: the one place an email is answered
    const account = { id: identity.id, email: identity.email };
    const session = { accessToken, expiresAt: expiresAt.toISOString() };
    return identity.kind === 'admin'
      ? { ...session, admin: account }
      : { ...session, donor: account };
  }
}
