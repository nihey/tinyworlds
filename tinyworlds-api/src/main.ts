import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { configureHttp } from './http.js';

async function bootstrap(): Promise<void> {
  // rawBody: the Stripe webhook verifies its signature over the bytes as they arrived
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  configureHttp(app);
  const config = app.get(ConfigService<Env, true>);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
