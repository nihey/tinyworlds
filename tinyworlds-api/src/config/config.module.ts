import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.js';

export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
  // the tests bring their whole environment (vitest.config.e2e.ts), whatever .env says
  ignoreEnvFile: process.env.NODE_ENV === 'test',
  validate: validateEnv,
});
