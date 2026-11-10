import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request } from 'express';
import { join } from 'node:path';
import { CitiesModule } from './cities/cities.module.js';
import './common/graphql-enums.js';
import { RateLimitModule } from './common/rate-limit.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { HealthResolver } from './health/health.resolver.js';
import { PrismaModule } from './prisma/prisma.module.js';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    AppConfigModule,
    RateLimitModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // under the global prefix: /api/graphql
      useGlobalPrefix: true,
      // written out in development as a record of the contract; the production image keeps it
      // in memory (it runs as a user that cannot write to the app folder)
      autoSchemaFile: isProduction ? true : join(process.cwd(), 'schema.gql'),
      sortSchema: true,
      graphiql: !isProduction,
      introspection: !isProduction,
      context: ({ req }: { req: Request }) => ({ req }),
    }),
    PrismaModule,
    CitiesModule,
    DonationsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
    HealthResolver,
  ],
})
export class AppModule {}
