import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class HealthResolver {
  @Query(() => String, { description: 'Liveness check for the app' })
  health(): string {
    return 'ok';
  }
}
