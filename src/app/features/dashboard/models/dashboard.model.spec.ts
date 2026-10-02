import { formatDuration } from './dashboard.model';

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [150, '2 h 30 min'],
    [1440, '1 d'],
    [1500, '1 d 1 h'],
    [4440, '3 d 2 h'],
    [89.6, '1 h 30 min'],
  ])('formats %s minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -5])('says "Sin datos" for %s', (value) => {
    expect(formatDuration(value)).toBe('Sin datos');
  });
});
