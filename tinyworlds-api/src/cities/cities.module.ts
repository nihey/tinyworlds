import { Module } from '@nestjs/common';
import { ListsModule } from '../lists/lists.module.js';
import { CitiesResolver } from './cities.resolver.js';
import { CitiesService } from './cities.service.js';

@Module({
  imports: [ListsModule],
  providers: [CitiesResolver, CitiesService],
})
export class CitiesModule {}
