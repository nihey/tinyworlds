import { registerEnumType } from '@nestjs/graphql';
import { CityStatus } from '../generated/prisma/enums.js';

registerEnumType(CityStatus, {
  name: 'CityStatus',
  description:
    'PROPOSED until its goal is met, then FUNDED; BUILDING and BUILT are set by hand',
});
