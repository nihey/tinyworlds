import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { Env } from '../config/env.js';
import { ListsModule } from '../lists/lists.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AdminResolver } from './admin.resolver.js';
import { AuthController } from './auth.controller.js';
import {
  AuthService,
  REFUSAL_FLOOR,
  REFUSAL_FLOOR_MS,
} from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtStrategy } from './jwt.strategy.js';
import { sessionSecret } from './session-secret.js';

/**
 * Signing in, for admins and donors, and their sessions. Importing this module puts JwtAuthGuard
 * in front of every resolver and route of the app: they are for admins unless marked @Public()
 * (anyone) or @ForDonors() (signed-in donors).
 */
@Module({
  imports: [
    MailModule,
    ListsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: sessionSecret(config),
        signOptions: { algorithm: 'HS256' as const },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: REFUSAL_FLOOR, useValue: REFUSAL_FLOOR_MS },
    JwtStrategy,
    AdminResolver,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
