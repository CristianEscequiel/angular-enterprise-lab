import { readApiError } from './api-error';

describe('readApiError', () => {
  it('reads code, message and details', () => {
    expect(
      readApiError({
        code: 'WORK_ORDER_NOT_PENDING',
        message: 'La orden 7 no está pendiente',
        timestamp: '2026-09-30T12:00:00Z',
        path: '/work-orders/7/take',
        details: { status: 'in-progress' },
      }),
    ).toEqual({
      code: 'WORK_ORDER_NOT_PENDING',
      message: 'La orden 7 no está pendiente',
      details: { status: 'in-progress' },
    });
  });

  it('returns null details when the body has none or they are not an object', () => {
    expect(readApiError({ code: 'NOT_FOUND', message: 'x' })?.details).toBeNull();
    expect(readApiError({ code: 'NOT_FOUND', message: 'x', details: [1] })?.details).toBeNull();
    expect(readApiError({ code: 'NOT_FOUND', message: 'x', details: 'y' })?.details).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'boom'],
    ['an array', []],
    ['no code', { message: 'x' }],
    ['an empty code', { code: '', message: 'x' }],
    ['a non-string message', { code: 'A', message: 42 }],
  ])('returns null for %s', (_label, body) => {
    expect(readApiError(body)).toBeNull();
  });
});
