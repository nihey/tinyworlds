import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { SetLinksHiddenInput } from './dto/set-links-hidden.input.js';
import { LinksService } from './links.service.js';

/** Admins only (the global guard's default): the means to take a donor's links off the lists. */
@Resolver()
export class LinksAdminResolver {
  constructor(private readonly links: LinksService) {}

  @Mutation(() => Boolean, {
    description:
      "Hides (or shows again) a donor's links everywhere; their name stays",
  })
  async setLinksHidden(
    @Args('input') input: SetLinksHiddenInput,
  ): Promise<boolean> {
    await this.links.setHidden(input.donorId, input.hidden);
    return true;
  }
}
