# City milestones

When a funded city ships, add its existing production slug and new world ID to `prisma/seed-data.ts`. The seed promotes that record to `BUILT` and preserves its name, funding and donations. Bethlehem uses `bethlehem-pennsylvania` for `tinybeth`.

## City weather

- Add each real world's nearby METAR station to `src/weather/city-weather.ts`. The public `cityWeather(world)` query returns its condition, station and observation time. Imagined or unknown worlds return null.
- Share a single Aviation Weather Center feed refresh across all stations and concurrent requests for ten minutes. Expire reports by their observation time after three hours, including during upstream outages.
