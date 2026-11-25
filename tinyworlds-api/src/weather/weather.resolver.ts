import { Args, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/public.decorator.js';
import { CityWeather } from './city-weather.js';
import { WeatherService } from './weather.service.js';

@Resolver()
export class WeatherResolver {
  constructor(private readonly weather: WeatherService) {}

  @Public()
  @Query(() => CityWeather, {
    nullable: true,
    description: 'Latest nearby weather observation for a real world',
  })
  cityWeather(
    @Args('world', { type: () => String }) world: string,
  ): Promise<CityWeather | null> {
    return this.weather.forWorld(world);
  }
}
