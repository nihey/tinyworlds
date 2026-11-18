import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum WeatherCondition {
  clear = 'clear',
  cloudy = 'cloudy',
  fog = 'fog',
  rain = 'rain',
  snow = 'snow',
  storm = 'storm',
}

registerEnumType(WeatherCondition, { name: 'WeatherCondition' });

@ObjectType()
export class CityWeather {
  @Field(() => WeatherCondition)
  condition: WeatherCondition;

  @Field()
  station: string;

  @Field(() => Date)
  observedAt: Date;
}

// A nearby reporting station for each real map. Prefer an urban station where available.
export const STATIONS = new Map(
  Object.entries({
    tinynyc: 'KNYC',
    tinyrao: 'SBRP',
    tinyorl: 'KORL',
    tinyfte: 'SAWC',
    tinyvlc: 'LEVC',
    tinylas: 'KLAS',
    tinylax: 'KLAX',
    tinydal: 'KDAL',
    tinycvg: 'KLUK',
    tinypit: 'KAGC',
    tinyphl: 'KPHL',
    tinycos: 'KCOS',
    tinytkf: 'KTRK',
    tinyaus: 'KATT',
    tinysfo: 'KSFO',
    tinymke: 'KMKE',
    tinybeth: 'KABE',
  }),
);

/** The weather group can combine phenomena (e.g. +TSRA or -SN BR). */
function condition(wx: string, cover: unknown): WeatherCondition | null {
  if (/TS|SQ|FC|GR|GS/.test(wx)) return WeatherCondition.storm;
  if (/SN|SG|PL|IC/.test(wx)) return WeatherCondition.snow;
  if (/RA|DZ|UP|SH/.test(wx)) return WeatherCondition.rain;
  if (/FG|BR|HZ|FU|DU|SA|VA/.test(wx)) return WeatherCondition.fog;
  if (cover === 'BKN' || cover === 'OVC' || cover === 'SCT' || cover === 'VV')
    return WeatherCondition.cloudy;
  if (['CLR', 'SKC', 'CAVOK', 'NSC', 'NCD', 'FEW'].includes(String(cover)))
    return WeatherCondition.clear;
  return null;
}

export function readObservation(raw: unknown): CityWeather | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.icaoId !== 'string' ||
    typeof row.obsTime !== 'number' ||
    !Number.isFinite(row.obsTime)
  )
    return null;
  // A CAVOK observation can omit decoded cover. A later forecast trend is separate.
  const body =
    typeof row.rawOb === 'string'
      ? row.rawOb.split(/\b(?:TEMPO|BECMG|RMK)\b/)[0]
      : '';
  const cover = row.cover ?? (/\bCAVOK\b/.test(body) ? 'CAVOK' : null);
  const sky = condition(
    typeof row.wxString === 'string' ? row.wxString : '',
    cover,
  );
  if (!sky) return null;
  return {
    station: row.icaoId,
    observedAt: new Date(row.obsTime * 1000),
    condition: sky,
  };
}
