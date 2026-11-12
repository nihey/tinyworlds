import { Query, Resolver } from '@nestjs/graphql';
import { ListsService } from './lists.service.js';
import { ListCounts } from './models/list-counts.model.js';

/** Admins only (the global guard's default). */
@Resolver()
export class ListCountsResolver {
  constructor(private readonly lists: ListsService) {}

  @Query(() => ListCounts, { description: 'How many are on each list' })
  listCounts(): Promise<ListCounts> {
    return this.lists.counts();
  }
}
