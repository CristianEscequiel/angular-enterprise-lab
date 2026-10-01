import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { isLegajo } from '@core/auth/auth.model';
import { errorCode, errorMessage } from '@core/api/api-error';
import { API_BASE_URL } from '@core/config/api.config';
import { Team, TeamDraft, uniqueMembers } from '../models/team.model';
import { InvalidLegajoError } from './technicians.service';

export type TeamLoadErrorKind = 'not-found' | 'connection';

// Mismo criterio que `WorkOrderLoadError`: la página distingue "el equipo no existe" de "no se
// pudo conectar" para mostrar el estado correcto.
export class TeamLoadError extends Error {
  readonly kind: TeamLoadErrorKind;

  constructor(kind: TeamLoadErrorKind, message: string) {
    super(message);
    this.name = 'TeamLoadError';
    this.kind = kind;
  }
}

// Algún legajo de la lista de miembros no existe en el maestro de técnicos (`UNKNOWN_TECHNICIAN`).
// El mensaje es el de la API, que dice cuál.
export class UnknownTechnicianError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownTechnicianError';
  }
}

@Injectable({
  providedIn: 'root',
})
export class TeamsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/teams`;

  getAll(): Observable<Team[]> {
    return this.http.get<Team[]>(this.apiUrl);
  }

  getById(id: string): Observable<Team> {
    return this.http.get<Team>(this.url(id)).pipe(
      catchError((error: unknown) => {
        const status = (error as { status?: number } | null)?.status;

        return throwError(() =>
          status === 404
            ? new TeamLoadError('not-found', 'El equipo no existe.')
            : new TeamLoadError('connection', 'No se pudo conectar con el servidor.'),
        );
      }),
    );
  }

  // El `id` lo genera json-server. Los miembros se persisten sin repetidos.
  create(draft: TeamDraft): Observable<Team> {
    const invalid = this.invalidMembers(draft);

    if (invalid) {
      return invalid;
    }

    return this.http
      .post<Team>(this.apiUrl, this.fields(draft))
      .pipe(catchError((error: unknown) => throwError(() => this.translate(error))));
  }

  // `PUT` reemplaza el equipo entero, con su lista de miembros. El `id` viene de la ruta.
  update(id: string, draft: TeamDraft): Observable<Team> {
    const invalid = this.invalidMembers(draft);

    if (invalid) {
      return invalid;
    }

    return this.http
      .put<Team>(this.url(id), this.fields(draft))
      .pipe(catchError((error: unknown) => throwError(() => this.translate(error))));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(this.url(id)).pipe(map(() => undefined));
  }

  private translate(error: unknown): unknown {
    return errorCode(error) === 'UNKNOWN_TECHNICIAN'
      ? new UnknownTechnicianError(errorMessage(error, 'Algún legajo de la lista no existe.'))
      : error;
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  // Solo los campos del equipo, con el nombre recortado y los miembros sin repetidos.
  private fields(draft: TeamDraft): TeamDraft {
    return {
      name: draft.name.trim(),
      type: draft.type,
      memberLegajos: uniqueMembers(draft.memberLegajos),
    };
  }

  // Un miembro que no es un legajo válido no se persiste: json-server aceptaría cualquier cosa.
  private invalidMembers(draft: TeamDraft): Observable<never> | null {
    return draft.memberLegajos.every(isLegajo)
      ? null
      : throwError(() => new InvalidLegajoError('La lista de miembros tiene un legajo inválido.'));
  }
}
