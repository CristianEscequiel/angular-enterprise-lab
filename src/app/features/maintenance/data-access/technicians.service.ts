import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';

import { isLegajo } from '@core/auth/auth.model';
import { API_BASE_URL } from '@core/config/api.config';
import { InvalidLegajoError } from '@core/auth/users.service';
import { Technician, TechnicianDraft } from '../models/technician.model';

// El legajo es el identificador y no se edita: al modificar solo viajan estos campos.
export type TechnicianChanges = Omit<TechnicianDraft, 'legajo'>;

// Ya existe un técnico con ese legajo. json-server no rechaza ids repetidos (responde 201 y crea
// otro registro), así que la unicidad la garantiza el cliente antes de escribir.
export class DuplicateLegajoError extends Error {
  constructor(readonly legajo: string) {
    super(`Ya existe un técnico con legajo ${legajo}.`);
    this.name = 'DuplicateLegajoError';
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

@Injectable({
  providedIn: 'root',
})
export class TechniciansService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/tecnicos`;

  getAll(): Observable<Technician[]> {
    return this.http.get<Technician[]>(this.apiUrl);
  }

  // Consulta por ruta y no por `?legajo=`: json-server convierte a número los valores numéricos
  // del query string y no encontraría un legajo guardado como string. Devuelve null si no existe
  // (o si el legajo ni siquiera tiene formato válido: no se arma ningún request). Solo el 404 es
  // "no existe"; un error de red o 5xx se propaga y no se puede confundir con eso.
  findByLegajo(legajo: string): Observable<Technician | null> {
    if (!isLegajo(legajo)) {
      return of(null);
    }

    return this.http
      .get<Technician>(this.url(legajo))
      .pipe(
        catchError((error: unknown) => (isNotFound(error) ? of(null) : throwError(() => error))),
      );
  }

  // Verifica primero que el legajo esté libre y recién entonces escribe. `id === legajo`. Crear un
  // técnico no crea ni toca su usuario de login: el técnico existe sin poder loguearse todavía.
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

        return this.http.post<Technician>(this.apiUrl, this.record(legajo, draft));
      }),
    );
  }

  // El legajo viene de la ruta, nunca del contenido: aunque `changes` traiga otro `legajo` o `id`,
  // se ignoran. Es el vínculo con `users` y `equipos`, no se puede cambiar.
  update(legajo: string, changes: TechnicianChanges): Observable<Technician> {
    if (!isLegajo(legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    return this.http.put<Technician>(this.url(legajo), this.record(legajo, changes));
  }

  delete(legajo: string): Observable<void> {
    if (!isLegajo(legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    return this.http.delete<void>(this.url(legajo)).pipe(map(() => undefined));
  }

  private url(legajo: string): string {
    return `${this.apiUrl}/${encodeURIComponent(legajo)}`;
  }

  // Arma el registro con solo los campos del maestro, y con `id === legajo`.
  private record(legajo: string, fields: TechnicianChanges): Technician {
    return {
      id: legajo,
      legajo,
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      specialty: fields.specialty,
      teamType: fields.teamType,
    };
  }
}
