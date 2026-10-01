// Cuerpo de error de la API: `{code, message, timestamp, path}` y, en los `400` de validación y en
// los `409` de las transiciones de una orden, `details`. Se lee con cuidado: un proxy, un `502` o
// un cuerpo ajeno no tienen este shape y no deben romper el manejo de errores.
export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}

export function readApiError(body: unknown): ApiErrorBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const { code, message, details } = record;

  if (typeof code !== 'string' || code.length === 0 || typeof message !== 'string') {
    return null;
  }

  return {
    code,
    message,
    details:
      typeof details === 'object' && details !== null && !Array.isArray(details)
        ? (details as Record<string, unknown>)
        : null,
  };
}

// Lo que un servicio necesita saber de un error HTTP, venga como `AppHttpError` (ya pasó por el
// `errorInterceptor`) o como el `HttpErrorResponse` crudo (tests sin interceptor). Nunca asumen el
// shape: un error que no es de HTTP devuelve null.
function asRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
}

export function errorStatus(error: unknown): number | null {
  const status = asRecord(error)?.['status'];

  return typeof status === 'number' ? status : null;
}

export function errorCode(error: unknown): string | null {
  const record = asRecord(error);
  const code = record?.['code'];

  return typeof code === 'string' ? code : (readApiError(record?.['error'])?.code ?? null);
}

export function errorDetails(error: unknown): Record<string, unknown> | null {
  const record = asRecord(error);
  const details = record?.['details'];

  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }

  return readApiError(record?.['error'])?.details ?? null;
}

export function errorMessage(error: unknown, fallback: string): string {
  const record = asRecord(error);
  const message = record?.['message'];
  const body = readApiError(record?.['error']);

  return body?.message || (typeof message === 'string' && message ? message : fallback);
}
