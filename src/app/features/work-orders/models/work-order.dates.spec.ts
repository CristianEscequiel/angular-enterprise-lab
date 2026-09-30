import { isSameLocalDay } from './work-order.dates';

describe('isSameLocalDay', () => {
  // Las fechas se arman en hora local y se pasan a ISO: el resultado no depende de la zona horaria
  // de la máquina que corre los tests.
  const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): Date =>
    new Date(y, m - 1, d, h, min, s, ms);
  const iso = (date: Date): string => date.toISOString();

  const now = local(2026, 9, 30, 15, 0);

  it.each<[string, Date, boolean]>([
    ['the same moment', now, true],
    ['earlier the same day', local(2026, 9, 30, 8, 15), true],
    ['the first millisecond of the day', local(2026, 9, 30, 0, 0, 0, 0), true],
    ['the last millisecond of the day', local(2026, 9, 30, 23, 59, 59, 999), true],
    ['one millisecond before the day starts', local(2026, 9, 29, 23, 59, 59, 999), false],
    ['the first millisecond of the next day', local(2026, 10, 1, 0, 0, 0, 0), false],
    ['the day before', local(2026, 9, 29, 15, 0), false],
    ['the day after', local(2026, 10, 1, 15, 0), false],
    ['the same day and month of another year', local(2025, 9, 30, 15, 0), false],
    ['the same day of another month', local(2026, 8, 30, 15, 0), false],
  ])('%s → %s', (_label, date, expected) => {
    expect(isSameLocalDay(iso(date), now)).toBe(expected);
  });

  it('compares the day of the reference date, not the current date', () => {
    const reference = local(2020, 2, 29, 12, 0);

    expect(isSameLocalDay(iso(local(2020, 2, 29, 1, 0)), reference)).toBe(true);
    expect(isSameLocalDay(iso(now), reference)).toBe(false);
  });

  it.each(['', 'not a date', '2026-13-45', '   '])(
    'returns false for %j, without throwing',
    (bad) => {
      expect(() => isSameLocalDay(bad, now)).not.toThrow();
      expect(isSameLocalDay(bad, now)).toBe(false);
    },
  );
});
