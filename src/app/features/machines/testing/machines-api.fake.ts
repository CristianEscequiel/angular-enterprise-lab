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

// Servidor en memoria SOLO para probar la página del árbol de partes de punta a punta (alta → lectura
// → baja con cambios de "otro usuario" a mitad de camino). Implementa el contrato de la API real
// para estas rutas — no es un emulador genérico:
//   GET    /machines/{id}            → la máquina o 404
//   GET    /machines/{id}/parts      → partes de la máquina (lista plana), 404 si la máquina no existe
//   POST   /machines/{id}/parts      → alta; 404 sin máquina, 400 PARENT_PART_NOT_FOUND /
//                                      PARENT_PART_OTHER_MACHINE si el padre no sirve
//   PATCH  /parts/{id}               → solo el nombre; 404 si no existe
//   DELETE /parts/{id}               → 409 PART_HAS_CHILDREN si tiene sub-partes; 404 si no existe
// Cualquier otra ruta o método lanza: un test que la necesite debe decirlo, no recibir un 404 mudo.
export interface Row {
  id: string;
  [field: string]: unknown;
}

export interface RecordedRequest {
  method: string;
  // Ruta sin el origen ni la query.
  path: string;
  body: unknown;
}

export interface MachinesApi {
  readonly interceptor: HttpInterceptorFn;
  // Estado actual. Es mutable a propósito: un test puede simular el cambio de otro usuario.
  readonly db: { machines: Row[]; parts: Row[] };
  readonly requests: readonly RecordedRequest[];
  requestsTo(method: string, path: string): RecordedRequest[];
  // Hace que todo pedido con ese método a esa ruta falle con ese estado.
  fail(method: string, path: string, status?: number): void;
  clearFailures(): void;
}

function apiError(status: number, code: string, message: string): Observable<never> {
  return throwError(
    () =>
      new HttpErrorResponse({
        status,
        statusText: code,
        error: { code, message, timestamp: '2026-10-01T12:00:00Z', path: '' },
      }),
  );
}

export function createMachinesApi(seed: {
  machines?: readonly Row[];
  parts?: readonly Row[];
}): MachinesApi {
  const db = {
    machines: (seed.machines ?? []).map((row) => structuredClone(row)),
    parts: (seed.parts ?? []).map((row) => structuredClone(row)),
  };
  const requests: RecordedRequest[] = [];
  let failures: { method: string; path: string; status: number }[] = [];
  let counter = 100;

  const respond = (status: number, body: unknown): Observable<HttpEvent<unknown>> =>
    of(new HttpResponse({ status, body: structuredClone(body) }));

  const interceptor: HttpInterceptorFn = (request) => {
    // API_BASE_URL puede ser relativa ('/api'): se resuelve contra un origen ficticio.
    const origin = 'http://localhost';
    const base = new URL(API_BASE_URL, origin);
    const url = new URL(request.url, origin);
    const method = request.method;

    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')
    ) {
      throw new Error(`machines-api: URL fuera de API_BASE_URL: ${request.url}`);
    }
    const path = url.pathname.slice(base.pathname.replace(/\/$/, '').length);

    requests.push({ method, path, body: structuredClone(request.body) });

    const failure = failures.find((f) => f.method === method && f.path === path);
    if (failure) {
      return apiError(failure.status, 'INTERNAL_ERROR', 'Falla simulada');
    }

    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    const [root, id, child] = segments;

    if (root === 'machines' && id !== undefined) {
      const machine = db.machines.find((row) => row.id === id);

      if (child === undefined && method === 'GET') {
        return machine ? respond(200, machine) : apiError(404, 'NOT_FOUND', 'No existe la máquina');
      }

      if (child === 'parts' && method === 'GET') {
        return machine
          ? respond(
              200,
              db.parts.filter((row) => row['machineId'] === id),
            )
          : apiError(404, 'NOT_FOUND', 'No existe la máquina');
      }

      if (child === 'parts' && method === 'POST') {
        if (!machine) {
          return apiError(404, 'NOT_FOUND', 'No existe la máquina');
        }

        const body = request.body as { name: string; parentId: string | null };
        const parent = body.parentId === null ? null : db.parts.find((r) => r.id === body.parentId);

        if (body.parentId !== null && !parent) {
          return apiError(400, 'PARENT_PART_NOT_FOUND', 'No existe la parte padre');
        }

        if (parent && parent['machineId'] !== id) {
          return apiError(400, 'PARENT_PART_OTHER_MACHINE', 'La parte padre es de otra máquina');
        }

        const created: Row = {
          id: `n${String(++counter)}`,
          machineId: id,
          parentId: body.parentId,
          name: body.name,
        };
        db.parts.push(created);
        return respond(201, created);
      }
    }

    if (root === 'parts' && id !== undefined && child === undefined) {
      const index = db.parts.findIndex((row) => row.id === id);
      const current = db.parts[index];

      if (!current) {
        return apiError(404, 'NOT_FOUND', 'No existe la parte');
      }

      if (method === 'PATCH') {
        const updated = { ...current, name: (request.body as { name: string }).name };
        db.parts[index] = updated;
        return respond(200, updated);
      }

      if (method === 'DELETE') {
        const children = db.parts.filter((row) => row['parentId'] === id).length;

        if (children > 0) {
          return apiError(
            409,
            'PART_HAS_CHILDREN',
            `La parte ${id} tiene ${children} ${children === 1 ? 'sub-parte' : 'sub-partes'}`,
          );
        }

        db.parts.splice(index, 1);
        return respond(204, null);
      }
    }

    throw new Error(`machines-api: ruta no emulada: ${method} ${path}`);
  };

  return {
    interceptor,
    db,
    requests,
    requestsTo: (method, path) => requests.filter((r) => r.method === method && r.path === path),
    fail: (method, path, status = 500) => {
      failures = [...failures, { method, path, status }];
    },
    clearFailures: () => {
      failures = [];
    },
  };
}

export function provideMachinesApi(api: MachinesApi): EnvironmentProviders {
  return provideHttpClient(withInterceptors([api.interceptor]));
}
