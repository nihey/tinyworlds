import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * Marks a route or a resolver anyone may call. Everything without it needs a signed-in admin
 * (JwtAuthGuard is global), so a new operation is private until someone says otherwise.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
