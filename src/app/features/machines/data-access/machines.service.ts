import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { errorCode, errorMessage, errorStatus } from '@core/api/api-error';
import { API_BASE_URL } from '@core/config/api.config';
import {
  Machine,
  MachineDraft,
  MACHINE_CODE_PATTERN,
  normalizeMachineCode,
} from '../models/machine.model';

export type MachineLoadErrorKind = 'not-found' | 'connection';

// Mismo criterio que `TeamLoadError`: la página distingue "la máquina no existe" de "no se pudo
// conectar" para mostrar el estado correcto.
export class MachineLoadError extends Error {
  readonly kind: MachineLoadErrorKind;

  constructor(kind: MachineLoadErrorKind, message: string) {
    super(message);
    this.name = 'MachineLoadError';
    this.kind = kind;
  }
}

// Ya hay otra máquina con ese código (sin distinguir mayúsculas ni espacios en los bordes).
// La API responde `409 DUPLICATE_MACHINE_CODE`; acá se traduce a este error para el campo código.
export class DuplicateMachineCodeError extends Error {
  constructor(readonly code: string) {
    super(`Ya existe una máquina con el código ${code}.`);
    this.name = 'DuplicateMachineCodeError';
  }
}

// La máquina tiene partes y no se elimina (`409 MACHINE_HAS_PARTS`): la API no hace cascada.
const MACHINE_HAS_PARTS_MESSAGE =
  'No se puede eliminar la máquina: tiene partes. Elimine primero sus partes.';

export class MachineHasPartsError extends Error {
  constructor(
    readonly machineId: string,
    message = MACHINE_HAS_PARTS_MESSAGE,
  ) {
    super(message);
    this.name = 'MachineHasPartsError';
  }
}
// Los datos de la máquina no pasan la validación local (código o nombre inválidos, o un id en blanco
// que armaría la URL de la colección entera en vez de la de una máquina).

export class InvalidMachineError extends Error {
  constructor(message = 'Los datos de la máquina no son válidos.') {
    super(message);
    this.name = 'InvalidMachineError';
  }
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// La API garantiza lo que antes verificaba el cliente: el código único (`409 DUPLICATE_MACHINE_CODE`) y
// que una máquina con partes no se borre (`409 MACHINE_HAS_PARTS`). Acá solo se validan los campos
// antes de enviarlos y se traducen esos errores; el `id` y `partCount` los pone el servidor.
@Injectable({
  providedIn: 'root',
})
export class MachinesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/machines`;

  getAll(): Observable<Machine[]> {
    return this.http.get<Machine[]>(this.apiUrl);
  }

  // Solo el 404 es "no existe"; cualquier otro error (red, 5xx) es "no se pudo conectar". Un id en
  // blanco no arma ningún request (la URL sería la de la colección entera).
  getById(id: string): Observable<Machine> {
    if (!isId(id)) {
      return throwError(() => new MachineLoadError('not-found', 'La máquina no existe.'));
    }

    return this.http
      .get<Machine>(this.url(id))
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            errorStatus(error) === 404
              ? new MachineLoadError('not-found', 'La máquina no existe.')
              : new MachineLoadError('connection', 'No se pudo conectar con el servidor.'),
          ),
        ),
      );
  }

  create(draft: MachineDraft): Observable<Machine> {
    const fields = this.validFields(draft);

    if (!fields) {
      return throwError(() => new InvalidMachineError());
    }

    return this.http
      .post<Machine>(this.apiUrl, fields)
      .pipe(catchError((error: unknown) => throwError(() => this.translate(error, fields.code))));
  }

  // El código es editable, así que la máquina no cuenta como duplicada de sí misma (lo resuelve la
  // API). Si ya no existe, `404` → error tipado.
  update(id: string, draft: MachineDraft): Observable<Machine> {
    const fields = this.validFields(draft);

    if (!isId(id) || !fields) {
      return throwError(() => new InvalidMachineError());
    }

    return this.http
      .put<Machine>(this.url(id), fields)
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            errorStatus(error) === 404
              ? new MachineLoadError('not-found', 'La máquina no existe.')
              : this.translate(error, fields.code),
          ),
        ),
      );
  }

  delete(id: string): Observable<void> {
    if (!isId(id)) {
      return throwError(() => new InvalidMachineError());
    }

    return this.http.delete<void>(this.url(id)).pipe(
      map(() => undefined),
      catchError((error: unknown) =>
        throwError(() =>
          errorCode(error) === 'MACHINE_HAS_PARTS'
            ? new MachineHasPartsError(id, errorMessage(error, MACHINE_HAS_PARTS_MESSAGE))
            : error,
        ),
      ),
    );
  }

  private translate(error: unknown, code: string): unknown {
    return errorCode(error) === 'DUPLICATE_MACHINE_CODE'
      ? new DuplicateMachineCodeError(code)
      : error;
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  private validFields(draft: MachineDraft): MachineDraft | null {
    const code = normalizeMachineCode(draft.code);
    const name = draft.name.trim();

    return MACHINE_CODE_PATTERN.test(code) && name.length > 0 ? { code, name } : null;
  }
}
