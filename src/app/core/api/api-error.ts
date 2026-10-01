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
