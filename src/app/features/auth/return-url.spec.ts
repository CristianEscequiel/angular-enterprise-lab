import { DEFAULT_RETURN_URL, sanitizeReturnUrl } from './return-url';

describe('sanitizeReturnUrl', () => {
  it.each([
    ['/work-orders/5'],
    ['/work-orders'],
    ['/work-orders?page=2&q=motor'],
    ['/work-orders/5/edit'],
    ['/dashboard#resumen'],
  ])('keeps the internal url %s', (url) => {
    expect(sanitizeReturnUrl(url)).toBe(url);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a relative path', 'work-orders/5'],
    ['an absolute external url', 'https://evil.com'],
    ['a protocol-relative url', '//evil.com'],
    ['a backslash host', '/\\evil.com'],
    ['a slash followed by whitespace', '/\t/evil.com'],
    ['a javascript url', 'javascript:alert(1)'],
  ])('falls back to the default for %s', (_label, url) => {
    expect(sanitizeReturnUrl(url)).toBe(DEFAULT_RETURN_URL);
  });

  it.each([['/login'], ['/login?returnUrl=%2Fwork-orders'], ['/login/'], ['/login#x']])(
    'falls back to the default for the login route itself (%s)',
    (url) => {
      expect(sanitizeReturnUrl(url)).toBe(DEFAULT_RETURN_URL);
    },
  );

  it('does not treat other routes that merely start with "login" as the login route', () => {
    expect(sanitizeReturnUrl('/login-history')).toBe('/login-history');
  });
});
