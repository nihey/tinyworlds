import { NAME_MAX, cleanDisplayName } from './display-name.js';

describe('cleanDisplayName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanDisplayName('  Ana   from\tRecife ')).toBe('Ana from Recife');
  });

  it('keeps at most NAME_MAX characters', () => {
    expect(NAME_MAX).toBe(40);
    expect(cleanDisplayName('é'.repeat(41))).toBe('é'.repeat(40));
  });

  it('cuts by code points, never splitting a surrogate pair', () => {
    expect(cleanDisplayName('a' + '𝒜'.repeat(40))).toBe('a' + '𝒜'.repeat(39));
  });

  it('is null when only invisible characters remain', () => {
    expect(cleanDisplayName('​‍ ')).toBeNull();
  });

  it('drops control characters', () => {
    expect(cleanDisplayName('Ana\u0000\u001f')).toBe('Ana');
  });

  it('normalizes to NFC', () => {
    expect(cleanDisplayName('José')).toBe('José');
  });

  it('is null without a letter or digit', () => {
    expect(cleanDisplayName('👍🏽')).toBeNull();
  });

  it('is null for anything but a string', () => {
    expect(cleanDisplayName(42)).toBeNull();
    expect(cleanDisplayName(undefined)).toBeNull();
  });

  it('leaves underscores alone', () => {
    expect(cleanDisplayName('the_cartographer')).toBe('the_cartographer');
  });
});
