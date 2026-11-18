import { afterEach, describe, expect, it, vi } from 'vitest';
import { readObservation } from './city-weather.js';
import { WeatherService } from './weather.service.js';

const now = new Date('2026-11-18T17:00:00Z');
const row = { icaoId: 'KTRK', obsTime: now.getTime() / 1000, cover: 'OVC' };
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('city weather', () => {
  it.each([
    ['+TSRA', 'OVC', 'storm'],
    ['-SN BR', 'OVC', 'snow'],
    ['-FZRA', 'BKN', 'rain'],
    ['MIFG', 'VV', 'fog'],
    ['', 'SCT', 'cloudy'],
    ['', 'FEW', 'clear'],
    ['', undefined, undefined],
  ])('decodes %s with %s cover', (wxString, cover, expected) => {
    expect(readObservation({ ...row, wxString, cover })?.condition).toBe(
      expected,
    );
  });

  it('reads CAVOK in the observation, excluding forecast trends', () => {
    expect(
      readObservation({ ...row, cover: null, rawOb: 'LEVC 181700Z CAVOK' })
        ?.condition,
    ).toBe('clear');
    expect(
      readObservation({
        ...row,
        cover: null,
        rawOb: 'LEVC 181700Z BECMG CAVOK',
      }),
    ).toBeNull();
  });

  it('shares one feed refresh between simultaneous cities and skips unknown worlds', async () => {
    vi.useFakeTimers().setSystemTime(now);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json([row, { ...row, icaoId: 'KNYC', wxString: 'RA' }]),
      );
    vi.stubGlobal('fetch', fetcher);
    const service = new WeatherService();
    expect(await service.forWorld('tinywinterfell')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const [truckee, nyc] = await Promise.all([
      service.forWorld('tinytkf'),
      service.forWorld('tinynyc'),
    ]);
    expect(truckee).toMatchObject({
      station: 'KTRK',
      observedAt: now,
      condition: 'cloudy',
    });
    expect(nyc?.condition).toBe('rain');
    expect(await service.forWorld('tinysfo')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retains a recent report during an outage and expires it by observation time', async () => {
    vi.useFakeTimers().setSystemTime(now);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([row]))
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const service = new WeatherService();
    const original = await service.forWorld('tinytkf');
    vi.setSystemTime(now.getTime() + 30 * 60_000);
    expect(await service.forWorld('tinytkf')).toEqual(original);
    expect(await service.forWorld('tinytkf')).toEqual(original);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now.getTime() + 4 * 60 * 60_000);
    expect(await service.forWorld('tinytkf')).toBeNull();
  });
});
