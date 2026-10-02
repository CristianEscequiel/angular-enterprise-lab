import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { errorCode, errorMessage, errorStatus } from '@core/api/api-error';
import { API_BASE_URL } from '@core/config/api.config';
import { Part } from '../models/part.model';

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
const PART_HAS_CHILDREN_MESSAGE =
  'No se puede eliminar la parte: tiene sub-partes. Elimine primero las sub-partes.';

export class PartHasChildrenError extends Error {
  constructor(
    readonly partId: string,
    message = PART_HAS_CHILDREN_MESSAGE,
  ) {
    super(message);
    this.name = 'PartHasChildrenError';
  }
}
// colección entera en vez de la de una parte).
export class InvalidPartError extends Error {
  constructor(message = 'Los datos de la parte no son válidos.') {
    super(message);
    this.name = 'InvalidPartError';
  }
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// JSON Server no valida nada ni hace cascada: acepta partes huérfanas y deja hijos colgando al
// borrar un padre. Toda la integridad del árbol la garantiza este servicio, ANTES de escribir.
// Las partes de una máquina se piden y se crean por la máquina (`/machines/{id}/parts`) y se editan y
// eliminan por su id (`/parts/{id}`). La API garantiza lo que antes verificaba el cliente: que la
// máquina exista, que el padre sea de la misma máquina y que una parte con sub-partes no se borre.
@Injectable({
  providedIn: 'root',
})
export class PartsService {
  private readonly http = inject(HttpClient);
  private readonly partsUrl = `${API_BASE_URL}/parts`;
  private readonly machinesUrl = `${API_BASE_URL}/machines`;

  // Lista plana en orden de creación; el árbol lo arma `buildPartTree` por `parentId`.
  getByMachine(machineId: string): Observable<Part[]> {
    if (!isId(machineId)) {
      return throwError(() => new MachineNotFoundError(machineId));
    }

    return this.http
      .get<Part[]>(this.partsOf(machineId))
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            errorStatus(error) === 404 ? new MachineNotFoundError(machineId) : error,
          ),
        ),
      );
  }

  create(machineId: string, parentId: string | null, name: string): Observable<Part> {
    const trimmed = name.trim();

    if (!isId(machineId) || (parentId !== null && !isId(parentId)) || trimmed.length === 0) {
      return throwError(() => new InvalidPartError());
    }

    return this.http.post<Part>(this.partsOf(machineId), { name: trimmed, parentId }).pipe(
      catchError((error: unknown) => {
        const code = errorCode(error);

        if (errorStatus(error) === 404) {
          return throwError(() => new MachineNotFoundError(machineId));
        }

        if (parentId !== null && code === 'PARENT_PART_NOT_FOUND') {
          return throwError(() => new ParentPartNotFoundError(parentId, 'missing'));
        }

        if (parentId !== null && code === 'PARENT_PART_OTHER_MACHINE') {
          return throwError(() => new ParentPartNotFoundError(parentId, 'other-machine'));
        }

        return throwError(() => error);
      }),
    );
  }

  // Solo el nombre: la API rechaza mover una parte (`machineId` o `parentId` distintos).
  update(id: string, name: string): Observable<Part> {
    const trimmed = name.trim();

    if (!isId(id) || trimmed.length === 0) {
      return throwError(() => new InvalidPartError());
    }

    return this.http.patch<Part>(this.url(id), { name: trimmed });
  }

  delete(id: string): Observable<void> {
    if (!isId(id)) {
      return throwError(() => new InvalidPartError());
    }

    return this.http.delete<void>(this.url(id)).pipe(
      map(() => undefined),
      catchError((error: unknown) =>
        throwError(() =>
          errorCode(error) === 'PART_HAS_CHILDREN'
            ? new PartHasChildrenError(id, errorMessage(error, PART_HAS_CHILDREN_MESSAGE))
            : error,
        ),
      ),
    );
  }

  private url(id: string): string {
    return `${this.partsUrl}/${encodeURIComponent(id)}`;
  }

  private partsOf(machineId: string): string {
    return `${this.machinesUrl}/${encodeURIComponent(machineId)}/parts`;
  }
}
