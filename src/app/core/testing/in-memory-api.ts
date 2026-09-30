import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';

// Backend en memoria para tests: un `HttpInterceptorFn` con estado que emula JSON Server
// (1.0.0-beta.15) para que los servicios se prueben de punta a punta (alta → lectura → baja) sin
// `HttpTestingController` ni un servidor levantado. Es genérico: las colecciones salen del seed.
//
// Existe porque los tests con `HttpTestingController` solo prueban lo que el test dice que el servidor
// responde: 013c creaba técnicos con `id === legajo` y todos sus tests pasaban, pero el servidor real
// descarta ese `id` y el técnico quedaba inalcanzable. Un test de ida y vuelta contra este emulador
// lo habría detectado.
//
// Su valor depende de ser FIEL, no amable: si "protegiera" la integridad, los tests de los servicios
// pasarían aunque el servicio no hiciera nada. Cada regla de abajo se leyó en el código de json-server
// (`lib/service.js`, `lib/parse-where.js`) y se comprobó contra `pnpm api`. Por eso replica lo que JSON Server hace de verdad
// (comprobado con `pnpm api`, no supuesto):
//   - `POST` IGNORA el `id` del cuerpo y genera uno propio.
//   - `POST` acepta cualquier referencia: partes huérfanas, `code` repetido. No valida nada.
//   - `DELETE` no hace cascada: los hijos quedan apuntando a un padre inexistente.
//   - `?campo=valor` convierte a número los valores numéricos: `?machineId=1` NO encuentra
//     `"machineId": "1"`, ni `?id=1` a `"id": "1"`. `null` sí coincide con `null`.
//   - `PUT` reemplaza el documento entero (el `id` sale de la URL); `PATCH` combina; ambos y `DELETE`
//     de un id inexistente responden `404` con `{ "error": "Not Found" }`; `DELETE` devuelve el
//     documento borrado.
//
// Lo que NO emula (falla fuerte para no dar falsos verdes): `_sort`, `_page`, `_embed` y demás
// parámetros `_…`; URLs fuera de `API_BASE_URL`; cuerpos que no son objetos. Tampoco emula que un
// `DELETE` ponga en `null` las claves foráneas con nombre `<singular>Id` de otras colecciones
// (`nullifyForeignKey`) ni `?_dependent=`: las colecciones de `machines` usan `machineId`/`parentId`,
// que no disparan esa convención.
// No verificado contra el servidor real: un `PATCH` con `id` en el cuerpo (acá se ignora).
//
// No es un `.spec.ts`, pero solo lo importan specs: ningún código de la app lo usa.

export interface Row {
  id: string;
  [field: string]: unknown;
}

export type InMemorySeed = Record<string, readonly Row[]>;

export interface RecordedRequest {
  method: string;
  // Ruta con query, sin el origen: `/partes?parentId=null`.
  url: string;
  body: unknown;
}

export interface InMemoryApi {
  readonly interceptor: HttpInterceptorFn;
  // Estado actual de cada colección. Es mutable a propósito: un test puede simular un cambio de
  // otro usuario (o un dato editado a mano) entre dos llamadas.
  readonly db: Record<string, Row[]>;
  readonly requests: readonly RecordedRequest[];
  // Pedidos con ese método a esa ruta (sin query), en orden.
  requestsTo(method: string, path: string): RecordedRequest[];
  // Hace que todo pedido con ese método a esa ruta (sin query) falle con ese estado.
  fail(method: string, path: string, status?: number): void;
  clearFailures(): void;
}

interface Failure {
  method: string;
  path: string;
  status: number;
}

// Réplica de `coerceValue` de json-server (`lib/parse-where.js`): el valor de `?campo=valor` no se
// compara como string. `true`/`false` → boolean, `null` → null, en blanco → queda como está y todo lo
// que `Number()` acepte como finito (`1001`, `0042`, `1e3`, ` 12 `) → número. Por eso un string
// numérico guardado (`"1"`, `"0042"`) nunca coincide.
function coerceQueryValue(raw: string): string | number | boolean | null {
  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  if (raw === 'null') {
    return null;
  }

  if (raw.trim() === '') {
    return raw;
  }

  const number = Number(raw);

  return Number.isFinite(number) ? number : raw;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function notFound(url: string): Observable<never> {
  return throwError(
    () =>
      new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        url,
        error: { error: 'Not Found' },
      }),
  );
}

function requireBody(body: unknown, method: string, url: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error(
      `in-memory-api: ${method} ${url} sin un cuerpo objeto (recibió ${typeof body})`,
    );
  }

  return body as Record<string, unknown>;
}

export function createInMemoryApi(seed: InMemorySeed = {}): InMemoryApi {
  const origin = new URL(API_BASE_URL).origin;
  const db: Record<string, Row[]> = {};
  const requests: RecordedRequest[] = [];
  let failures: Failure[] = [];
  let counter = 0;

  for (const [collection, rows] of Object.entries(seed)) {
    db[collection] = rows.map((row) => clone(row));
  }

  // Ids con la forma de los del servidor (11 caracteres, no numéricos: `"o89hc_hyt6A"`) pero
  // deterministas, para que los tests puedan predecirlos.
  const nextId = (): string => `g${String(++counter).padStart(10, '0')}`;

  const respond = (status: number, body: unknown): Observable<HttpEvent<unknown>> =>
    of(new HttpResponse({ status, body: clone(body) }));

  const interceptor: HttpInterceptorFn = (request) => {
    const url = new URL(request.urlWithParams);

    if (url.origin !== origin) {
      throw new Error(`in-memory-api: URL fuera de API_BASE_URL: ${request.urlWithParams}`);
    }

    const method = request.method;
    const relativeUrl = url.pathname + url.search;

    requests.push({ method, url: relativeUrl, body: clone(request.body) });

    const failure = failures.find(
      (candidate) => candidate.method === method && candidate.path === url.pathname,
    );

    if (failure) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: failure.status,
            statusText: 'Simulated failure',
            url: request.urlWithParams,
          }),
      );
    }

    const [collection, rawId, ...extra] = url.pathname.split('/').filter(Boolean);
    const rows = collection === undefined ? undefined : db[collection];

    if (!rows || extra.length > 0) {
      return notFound(request.urlWithParams);
    }

    const id = rawId === undefined ? undefined : decodeURIComponent(rawId);
    const current = id === undefined ? undefined : rows.find((row) => row.id === id);

    if (id === undefined) {
      if (method === 'GET') {
        const filters = [...url.searchParams.entries()];

        for (const [key] of filters) {
          if (key.startsWith('_')) {
            throw new Error(`in-memory-api: el parámetro ${key} no está emulado`);
          }
        }

        return respond(
          200,
          rows.filter((row) => filters.every(([key, raw]) => row[key] === coerceQueryValue(raw))),
        );
      }

      if (method === 'POST') {
        const fields = { ...requireBody(request.body, method, relativeUrl) };

        // El servidor descarta el `id` que mande el cliente.
        delete fields['id'];

        const created: Row = { ...fields, id: nextId() };

        rows.push(created);
        return respond(201, created);
      }
    } else {
      if (method === 'GET') {
        return current ? respond(200, current) : notFound(request.urlWithParams);
      }

      if (!current) {
        return notFound(request.urlWithParams);
      }

      if (method === 'PUT') {
        const replaced: Row = { ...requireBody(request.body, method, relativeUrl), id };

        rows[rows.indexOf(current)] = replaced;
        return respond(200, replaced);
      }

      if (method === 'PATCH') {
        const merged: Row = { ...current, ...requireBody(request.body, method, relativeUrl), id };

        rows[rows.indexOf(current)] = merged;
        return respond(200, merged);
      }

      if (method === 'DELETE') {
        rows.splice(rows.indexOf(current), 1);
        return respond(200, current);
      }
    }

    throw new Error(`in-memory-api: ${method} ${relativeUrl} no está emulado`);
  };

  return {
    interceptor,
    db,
    requests,
    requestsTo: (method, path) =>
      requests.filter(
        (recorded) => recorded.method === method && recorded.url.split('?')[0] === path,
      ),
    fail: (method, path, status = 500) => {
      failures = [...failures, { method, path, status }];
    },
    clearFailures: () => {
      failures = [];
    },
  };
}

export function provideInMemoryApi(api: InMemoryApi): EnvironmentProviders {
  return provideHttpClient(withInterceptors([api.interceptor]));
}
