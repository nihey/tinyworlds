import { CITY_NAME_MAX, citySlug, cleanCityName } from './city-name.js';

describe('cleanCityName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanCityName('  São   Paulo \n')).toBe('São Paulo');
    expect(cleanCityName('Buenos\tAires')).toBe('Buenos Aires');
  });

  it('drops control and invisible characters', () => {
    expect(cleanCityName('Lis\u0000boa')).toBe('Lis boa');
    expect(cleanCityName('To​kyo')).toBe('To kyo');
  });

  it('is empty for nothing, and for only whitespace', () => {
    expect(cleanCityName(undefined)).toBe('');
    expect(cleanCityName(null)).toBe('');
    expect(cleanCityName('   \n ')).toBe('');
  });

  it('keeps at most the allowed number of characters, counting accents as one', () => {
    const long = 'ã'.repeat(CITY_NAME_MAX + 25);
    expect([...cleanCityName(long)]).toHaveLength(CITY_NAME_MAX);
    expect(cleanCityName(`${'a'.repeat(CITY_NAME_MAX - 1)} b`)).toBe(
      'a'.repeat(CITY_NAME_MAX - 1),
    );
  });
});

describe('citySlug', () => {
  it('makes one city of every spelling', () => {
    for (const spelling of [
      'São Paulo',
      'sao paulo',
      'SAO-PAULO!',
      ' Sao  Paulo ',
    ]) {
      expect(citySlug(spelling)).toBe('sao-paulo');
    }
  });

  it('drops accents and punctuation', () => {
    expect(citySlug('Ribeirão Preto')).toBe('ribeirao-preto');
    expect(citySlug("L'Hospitalet de Llobregat")).toBe(
      'l-hospitalet-de-llobregat',
    );
    expect(citySlug('Washington, D.C.')).toBe('washington-d-c');
  });

  it('keeps letters of other scripts', () => {
    expect(citySlug('東京')).toBe('東京');
    expect(citySlug('Москва')).toBe('москва');
  });

  it('is empty when there is no letter or digit', () => {
    expect(citySlug('!!! ---')).toBe('');
    expect(citySlug('')).toBe('');
  });
});
