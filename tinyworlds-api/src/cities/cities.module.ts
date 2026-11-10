import { Module } from '@nestjs/common';
import { CitiesResolver } from './cities.resolver.js';
import { CitiesService } from './cities.service.js';

@Module({ providers: [CitiesResolver, CitiesService] })
export class CitiesModule {}
