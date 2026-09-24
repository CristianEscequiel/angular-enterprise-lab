import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import {
  Machine,
  MachineDraft,
  MACHINE_CODE_PATTERN,
  normalizeMachineCode,
} from '../models/machine.model';
import { PartsService } from './parts.service';

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
// json-server no valida unicidad (acepta dos máquinas con el mismo `code`): la garantiza el cliente.
export class DuplicateMachineCodeError extends Error {
  constructor(readonly code: string) {
    super(`Ya existe una máquina con el código ${code}.`);
    this.name = 'DuplicateMachineCodeError';
  }
}

// La máquina tiene partes y no se elimina: no hay cascada (ver `MachinesService.delete`).
export class MachineHasPartsError extends Error {
  constructor(
    readonly machineId: string,
    readonly partCount: number,
  ) {
    super(
      `No se puede eliminar la máquina: tiene ${partCount} ${partCount === 1 ? 'parte' : 'partes'}. ` +
        'Elimine primero sus partes.',
    );
    this.name = 'MachineHasPartsError';
  }
}

// Datos que ni siquiera se envían: código sin el formato del dominio, nombre vacío o un id en blanco
// (que armaría la URL de la colección entera en vez de la de una máquina).
export class InvalidMachineError extends Error {
  constructor(message = 'Los datos de la máquina no son válidos.') {
    super(message);
    this.name = 'InvalidMachineError';
  }
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// JSON Server no valida nada ni hace cascada: acepta códigos repetidos y deja partes colgando al
// borrar una máquina. La integridad la garantiza este servicio, ANTES de escribir.
@Injectable({
  providedIn: 'root',
})
export class MachinesService {
  private readonly http = inject(HttpClient);
  private readonly partsService = inject(PartsService);
  private readonly apiUrl = `${API_BASE_URL}/maquinas`;

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
            (error as { status?: number } | null)?.status === 404
              ? new MachineLoadError('not-found', 'La máquina no existe.')
              : new MachineLoadError('connection', 'No se pudo conectar con el servidor.'),
          ),
        ),
      );
  }

  // Verifica antes de escribir que el código esté libre. Se pide TODA la colección y se compara en el
  // cliente: `?code=` no sirve porque json-server convierte a número los valores numéricos y no
  // encontraría un código como `0042`. El `id` no se manda: lo genera el servidor.
  create(draft: MachineDraft): Observable<Machine> {
    const fields = this.validFields(draft);

    if (!fields) {
      return throwError(() => new InvalidMachineError());
    }

    return this.getAll().pipe(
      switchMap((machines) =>
        this.isCodeTaken(machines, fields.code, null)
          ? throwError(() => new DuplicateMachineCodeError(fields.code))
          : this.http.post<Machine>(this.apiUrl, fields),
      ),
    );
  }

  // El código es editable (el `id` es lo que referencian otras specs), así que la máquina no cuenta
  // como duplicada de sí misma. Si ya no existe, error tipado y no se escribe nada.
  update(id: string, draft: MachineDraft): Observable<Machine> {
    const fields = this.validFields(draft);

    if (!isId(id) || !fields) {
      return throwError(() => new InvalidMachineError());
    }

    return this.getAll().pipe(
      switchMap((machines) => {
        if (!machines.some((machine) => machine.id === id)) {
          return throwError(() => new MachineLoadError('not-found', 'La máquina no existe.'));
        }

        return this.isCodeTaken(machines, fields.code, id)
          ? throwError(() => new DuplicateMachineCodeError(fields.code))
          : this.http.put<Machine>(this.url(id), fields);
      }),
    );
  }

  // Bloquea si la máquina tiene partes (no hay cascada: serían N `DELETE` no atómicos y un fallo a
  // mitad dejaría partes sin máquina). El chequeo usa datos FRESCOS (`GET /partes`), no lo que la
  // pantalla tenga en memoria, y cuenta toda parte que apunte a la máquina, aunque esté huérfana
  // dentro de su árbol. Si esa consulta falla, no se borra.
  delete(id: string): Observable<void> {
    if (!isId(id)) {
      return throwError(() => new InvalidMachineError());
    }

    return this.partsService
      .getByMachine(id)
      .pipe(
        switchMap((parts) =>
          parts.length > 0
            ? throwError(() => new MachineHasPartsError(id, parts.length))
            : this.http.delete<void>(this.url(id)).pipe(map(() => undefined)),
        ),
      );
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  // Solo los campos de la máquina, con el código normalizado y el nombre recortado; null si el código
  // no tiene el formato del dominio o el nombre está vacío.
  private validFields(draft: MachineDraft): MachineDraft | null {
    const code = normalizeMachineCode(draft.code);
    const name = draft.name.trim();

    return MACHINE_CODE_PATTERN.test(code) && name.length > 0 ? { code, name } : null;
  }

  // Compara el código normalizado, también el de las máquinas ya guardadas (un dato editado a mano
  // puede estar en minúsculas). `ownId` excluye a la propia máquina al editar.
  private isCodeTaken(machines: readonly Machine[], code: string, ownId: string | null): boolean {
    return machines.some(
      (machine) =>
        machine.id !== ownId &&
        typeof machine.code === 'string' &&
        normalizeMachineCode(machine.code) === code,
    );
  }
}
