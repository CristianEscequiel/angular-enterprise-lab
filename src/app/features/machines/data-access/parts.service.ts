import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { hasChildren, Part, PartDraft } from '../models/part.model';

// La máquina en la que se quiere crear la parte no existe.
export class MachineNotFoundError extends Error {
  constructor(readonly machineId: string) {
    super('La máquina no existe.');
    this.name = 'MachineNotFoundError';
  }
}

export type ParentPartProblem = 'missing' | 'other-machine';

// El padre indicado no sirve: no existe, o existe pero es de OTRA máquina (una parte cruzada no se
// podría ver en el árbol de ninguna de las dos).
export class ParentPartNotFoundError extends Error {
  constructor(
    readonly parentId: string,
    readonly problem: ParentPartProblem,
  ) {
    super(
      problem === 'missing'
        ? 'La parte padre no existe.'
        : 'La parte padre pertenece a otra máquina.',
    );
    this.name = 'ParentPartNotFoundError';
  }
}

// La parte tiene sub-partes y no se elimina (no hay cascada: ver `PartsService.delete`).
export class PartHasChildrenError extends Error {
  constructor(
    readonly partId: string,
    readonly childCount: number,
  ) {
    super(
      `No se puede eliminar la parte: tiene ${childCount} ${childCount === 1 ? 'sub-parte' : 'sub-partes'}. ` +
        'Elimine primero las sub-partes.',
    );
    this.name = 'PartHasChildrenError';
  }
}

// Datos que ni siquiera se envían: nombre vacío o un id en blanco (que armaría la URL de la
// colección entera en vez de la de una parte).
export class InvalidPartError extends Error {
  constructor(message = 'Los datos de la parte no son válidos.') {
    super(message);
    this.name = 'InvalidPartError';
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// JSON Server no valida nada ni hace cascada: acepta partes huérfanas y deja hijos colgando al
// borrar un padre. Toda la integridad del árbol la garantiza este servicio, ANTES de escribir.
@Injectable({
  providedIn: 'root',
})
export class PartsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/partes`;
  private readonly machinesUrl = `${API_BASE_URL}/maquinas`;

  getAll(): Observable<Part[]> {
    return this.http.get<Part[]>(this.apiUrl);
  }

  // Pide TODAS las partes y filtra en el cliente: JSON Server convierte a número los valores
  // numéricos del query string y `?machineId=1` no encontraría `"machineId": "1"` (devuelve []).
  getByMachine(machineId: string): Observable<Part[]> {
    return this.getAll().pipe(map((parts) => parts.filter((part) => part.machineId === machineId)));
  }

  // Verifica antes de escribir que la máquina existe y que el padre (si lo hay) existe y es de la
  // misma máquina; si no, error tipado y NO sale el `POST`. Un error de red o `5xx` en esas
  // consultas se propaga tal cual: nunca se interpreta como "no existe". El `id` no se manda: el
  // servidor genera el suyo y descarta el que llegue.
  create(machineId: string, parentId: string | null, name: string): Observable<Part> {
    const trimmed = name.trim();

    if (!isId(machineId) || (parentId !== null && !isId(parentId)) || trimmed.length === 0) {
      return throwError(() => new InvalidPartError());
    }

    return this.ensureMachineExists(machineId).pipe(
      switchMap(() =>
        parentId === null ? of(undefined) : this.ensureParentBelongsTo(parentId, machineId),
      ),
      switchMap(() => {
        const draft: PartDraft = { machineId, parentId, name: trimmed };

        return this.http.post<Part>(this.apiUrl, draft);
      }),
    );
  }

  // Solo el nombre: `machineId` y `parentId` no se pueden cambiar (no hay "mover"), y con `PATCH`
  // ni siquiera viajan. Un `PUT` reenviaría los valores que la pantalla tenía cargados y podría
  // pisar cambios ajenos.
  update(id: string, name: string): Observable<Part> {
    const trimmed = name.trim();

    if (!isId(id) || trimmed.length === 0) {
      return throwError(() => new InvalidPartError());
    }

    return this.http.patch<Part>(this.url(id), { name: trimmed });
  }

  // Bloquea si la parte tiene sub-partes (no hay cascada: serían N `DELETE` no atómicos y un fallo a
  // mitad dejaría hijos huérfanos). El chequeo usa datos FRESCOS (`GET /partes`), no el árbol que la
  // pantalla tenga en memoria: otro usuario puede haberle agregado un hijo hace un momento. Si esa
  // consulta falla, no se borra.
  delete(id: string): Observable<void> {
    if (!isId(id)) {
      return throwError(() => new InvalidPartError());
    }

    return this.getAll().pipe(
      switchMap((parts) => {
        if (hasChildren(parts, id)) {
          const childCount = parts.filter((part) => part.parentId === id).length;

          return throwError(() => new PartHasChildrenError(id, childCount));
        }

        return this.http.delete<void>(this.url(id)).pipe(map(() => undefined));
      }),
    );
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  private ensureMachineExists(machineId: string): Observable<void> {
    return this.http.get<unknown>(`${this.machinesUrl}/${encodeURIComponent(machineId)}`).pipe(
      map(() => undefined),
      catchError((error: unknown) =>
        throwError(() => (isNotFound(error) ? new MachineNotFoundError(machineId) : error)),
      ),
    );
  }

  private ensureParentBelongsTo(parentId: string, machineId: string): Observable<void> {
    return this.http.get<Part>(this.url(parentId)).pipe(
      catchError((error: unknown) =>
        throwError(() =>
          isNotFound(error) ? new ParentPartNotFoundError(parentId, 'missing') : error,
        ),
      ),
      switchMap((parent) =>
        parent.machineId === machineId
          ? of(undefined)
          : throwError(() => new ParentPartNotFoundError(parentId, 'other-machine')),
      ),
    );
  }
}
