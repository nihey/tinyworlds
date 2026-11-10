import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.js';

/** Everything is served under /api, so the site and the API can share one host. */
export const GLOBAL_PREFIX = 'api';

/** HTTP settings shared by the server and the e2e tests. */
export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  // Production sits behind one proxy; trust it so req.ip is the visitor's address, which the
  // checkout rate limit counts by.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.enableCors({
    origin: app
      .get(ConfigService<Env, true>)
      .get('ALLOWED_ORIGINS', { infer: true }),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  });
}
