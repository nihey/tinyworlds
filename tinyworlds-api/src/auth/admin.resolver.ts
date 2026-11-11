import { Query, Resolver } from '@nestjs/graphql';
import type { Account } from './auth.service.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import { Admin } from './models/admin.model.js';

@Resolver(() => Admin)
export class AdminResolver {
  @Query(() => Admin, { description: 'The admin this session belongs to' })
  me(@CurrentAdmin() admin: Account): Admin {
    return { id: admin.id, email: admin.email };
  }
}
