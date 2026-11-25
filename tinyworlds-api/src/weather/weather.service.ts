import { Injectable, Logger } from '@nestjs/common';
import { type CityWeather, readObservation, STATIONS } from './city-weather.js';

const MINUTE = 60_000;
const VALID_FOR = 3 * 60 * MINUTE;
const FEED =
  'https://aviationweather.gov/api/data/metar?format=json&ids=' +
  [...STATIONS.values()].join(',');

@Injectable()
export class WeatherService {
  private readonly reports = new Map<string, CityWeather>();
  private readonly logger = new Logger(WeatherService.name);
  private refreshAfter = 0;
  private pending?: Promise<void>;

  async forWorld(world: string): Promise<CityWeather | null> {
    const station = STATIONS.get(world);
    if (!station) return null;
    if (Date.now() >= this.refreshAfter) {
      this.pending ??= this.refresh().finally(() => {
        this.pending = undefined;
      });
      await this.pending;
    }
    const report = this.reports.get(station);
    return report && Date.now() - report.observedAt.getTime() <= VALID_FOR
      ? report
      : null;
  }

  // Fetch all stations together. All visitors and cities share one in-flight request.
  private async refresh(): Promise<void> {
    try {
      const response = await fetch(FEED, {
        headers: {
          'User-Agent': 'Tinyworlds/1.0 (https://github.com/nihey/tinyworlds)',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const rows: unknown =
        response.status === 204 ? [] : await response.json();
      if (!Array.isArray(rows)) throw new Error('Invalid observation feed');
      const now = Date.now();
      for (const row of rows) {
        const report = readObservation(row);
        if (!report) continue;
        const at = report.observedAt.getTime();
        const previous = this.reports.get(report.station);
        if (
          at >= now - VALID_FOR &&
          at <= now + 5 * MINUTE &&
          (!previous || at >= previous.observedAt.getTime())
        )
          this.reports.set(report.station, report);
      }
      this.refreshAfter = now + 10 * MINUTE;
    } catch (error) {
      this.refreshAfter = Date.now() + MINUTE;
      this.logger.warn('City weather refresh failed: ' + String(error));
    }
  }
}
