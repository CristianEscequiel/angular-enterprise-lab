import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, of, switchMap, throwError } from 'rxjs';

import { isLegajo } from '@core/auth/auth.model';
import { TechnicianDirectory } from '@core/auth/technician-directory';
import { API_BASE_URL } from '@core/config/api.config';
import { InvalidLegajoError, TechnicianNotFoundError } from '@core/auth/users.service';
import { Technician, TechnicianDraft } from '../models/technician.model';

// El legajo es el identificador de negocio y no se edita: al modificar solo viajan estos campos.
export type TechnicianChanges = Omit<TechnicianDraft, 'legajo'>;

// Ya existe un técnico con ese legajo. json-server no valida unicidad (acepta dos registros con el
// mismo legajo), así que la garantiza el cliente antes de escribir.
export class DuplicateLegajoError extends Error {
  constructor(readonly legajo: string) {
    super(`Ya existe un técnico con legajo ${legajo}.`);
    this.name = 'DuplicateLegajoError';
  }
}

@Injectable({
  providedIn: 'root',
})
export class TechniciansService {
  private readonly http = inject(HttpClient);
  private readonly directory = inject(TechnicianDirectory);
  private readonly apiUrl = `${API_BASE_URL}/tecnicos`;

  getAll(): Observable<Technician[]> {
    return this.http.get<Technician[]>(this.apiUrl);
  }

  // El `id` del registro lo genera el servidor y NO es el legajo (json-server descarta el `id` que
  // manda el cliente en un `POST`), así que se busca por legajo en el maestro: ver
  // `TechnicianDirectory`. Devuelve null si no existe (o si el legajo no tiene formato válido: no
  // se arma ningún request). Un error de red o 5xx se propaga y no se puede confundir con eso.
  findByLegajo(legajo: string): Observable<Technician | null> {
    return this.directory.find<Technician>(legajo);
  }

  // Verifica primero que el legajo esté libre y recién entonces escribe. No manda `id`: lo asigna el
  // servidor. Crear un técnico no crea ni toca su usuario de login: el técnico existe sin poder
  // loguearse todavía.
  create(draft: TechnicianDraft): Observable<Technician> {
    if (!isLegajo(draft.legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    const legajo = draft.legajo;

    return this.findByLegajo(legajo).pipe(
      switchMap((existing) => {
        if (existing) {
          return throwError(() => new DuplicateLegajoError(legajo));
        }

        return this.http.post<Technician>(this.apiUrl, this.fields(legajo, draft));
      }),
    );
  }

  // El legajo viene del argumento, nunca del contenido: aunque `changes` traiga otro `legajo` o
  // `id`, se ignoran. Es el vínculo con `users` y `equipos`, no se puede cambiar. El registro se
  // ubica por legajo y se reemplaza por su `id` de servidor; si no existe, no se escribe nada.
  update(legajo: string, changes: TechnicianChanges): Observable<Technician> {
    return this.existing(legajo).pipe(
      switchMap((current) =>
        this.http.put<Technician>(this.url(current.id), this.fields(legajo, changes)),
      ),
    );
  }

  delete(legajo: string): Observable<void> {
    return this.existing(legajo).pipe(
      switchMap((current) => this.http.delete<void>(this.url(current.id))),
      map(() => undefined),
    );
  }

  // El técnico al que apuntan `update` y `delete`: error tipado y sin escritura si no existe.
  private existing(legajo: string): Observable<Technician> {
    if (!isLegajo(legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    return this.findByLegajo(legajo).pipe(
      switchMap((current) =>
        current ? of(current) : throwError(() => new TechnicianNotFoundError(legajo)),
      ),
    );
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  // Solo los campos del maestro (sin `id`: lo pone el servidor, y en un `PUT` sale de la URL).
  private fields(legajo: string, fields: TechnicianChanges): Omit<Technician, 'id'> {
    return {
      legajo,
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      specialty: fields.specialty,
      teamType: fields.teamType,
    };
  }
}
