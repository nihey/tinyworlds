import { Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/public.decorator.js';

@Resolver()
export class HealthResolver {
  @Public()
  @Query(() => String, { description: 'Liveness check for the app' })
  health(): string {
    return 'ok';
  }
}
