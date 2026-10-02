import { errorCode, errorDetails, errorMessage, errorStatus, readApiError } from './api-error';

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

describe('error helpers', () => {
  const body = { code: 'MACHINE_HAS_PARTS', message: 'Tiene partes', details: { a: 1 } };
  const appError = {
    status: 409,
    message: 'Tiene partes',
    code: 'MACHINE_HAS_PARTS',
    details: { a: 1 },
  };
  const httpError = { status: 409, message: 'Http failure response', error: body };

  it.each([
    ['an AppHttpError', appError],
    ['a raw HttpErrorResponse', httpError],
  ])('reads status, code and details from %s', (_label, error) => {
    expect(errorStatus(error)).toBe(409);
    expect(errorCode(error)).toBe('MACHINE_HAS_PARTS');
    expect(errorDetails(error)).toEqual({ a: 1 });
  });

  it('prefers the API message over the generic one of a raw HttpErrorResponse', () => {
    expect(errorMessage(httpError, 'x')).toBe('Tiene partes');
    expect(errorMessage(appError, 'x')).toBe('Tiene partes');
  });

  it.each([null, undefined, 'boom', 42, new Error('x')])(
    'returns neutral values for %s',
    (error) => {
      expect(errorStatus(error)).toBeNull();
      expect(errorCode(error)).toBeNull();
      expect(errorDetails(error)).toBeNull();
    },
  );

  it('falls back when the error carries no message', () => {
    expect(errorMessage({}, 'respaldo')).toBe('respaldo');
    expect(errorMessage(null, 'respaldo')).toBe('respaldo');
  });
});
