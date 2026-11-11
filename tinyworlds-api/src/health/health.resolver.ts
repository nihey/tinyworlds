import { Int, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/public.decorator.js';

@Resolver()
export class HealthResolver {
  @Public()
  @Query(() => String, { description: 'Liveness check for the app' })
  health(): string {
    return 'ok';
  }

  /** What a deploy waits for: an answer from a process younger than the deploy. */
  @Public()
  @Query(() => Int, {
    description: 'Seconds since this API process started',
  })
  uptime(): number {
    return Math.floor(process.uptime());
  }
}
