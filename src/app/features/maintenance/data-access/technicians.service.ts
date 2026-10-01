import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { errorCode, errorMessage, errorStatus } from '@core/api/api-error';
import { isLegajo } from '@core/auth/auth.model';
import { API_BASE_URL } from '@core/config/api.config';
import { Technician, TechnicianDraft } from '../models/technician.model';

export type TechnicianChanges = Omit<TechnicianDraft, 'legajo'>;

// El legajo falta o no tiene el formato del dominio (1 a 8 dígitos): no se arma ningún request.
export class InvalidLegajoError extends Error {
  constructor(message = 'El legajo no es válido.') {
    super(message);
    this.name = 'InvalidLegajoError';
  }
}

export class TechnicianNotFoundError extends Error {
  constructor(readonly legajo: string) {
    super(`No existe un técnico con legajo ${legajo}.`);
    this.name = 'TechnicianNotFoundError';
  }
}

export class DuplicateLegajoError extends Error {
  constructor(readonly legajo: string) {
    super(`Ya existe un técnico con legajo ${legajo}.`);
    this.name = 'DuplicateLegajoError';
  }
}

// El técnico tiene usuario de acceso o es miembro de un equipo (`TECHNICIAN_IN_USE`). El mensaje es
// el de la API, que dice cuál de los dos motivos aplica.
export class TechnicianInUseError extends Error {
  constructor(
    readonly legajo: string,
    message: string,
  ) {
    super(message);
    this.name = 'TechnicianInUseError';
  }
}

// Maestro de técnicos. El legajo identifica al técnico en la URL (`/technicians/{legajo}`) y es único e
// inmutable; el `id` lo asigna el servidor y no se usa para direccionarlo. La unicidad del legajo y
// "no borrar un técnico en uso" las garantiza la API: acá solo se traducen sus errores.
@Injectable({
  providedIn: 'root',
})
export class TechniciansService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/technicians`;

  getAll(): Observable<Technician[]> {
    return this.http.get<Technician[]>(this.apiUrl);
  }

  // Devuelve `null` si no existe (`404`) o si el legajo ni siquiera tiene formato válido (no se arma
  // ningún request). Un error de red o `5xx` se propaga: quien decide con esta respuesta no debe
  // tomar un fallo como "no existe".
  findByLegajo(legajo: string): Observable<Technician | null> {
    if (!isLegajo(legajo)) {
      return of(null);
    }

    return this.http
      .get<Technician>(this.url(legajo))
      .pipe(
        catchError((error: unknown) =>
          errorStatus(error) === 404 ? of(null) : throwError(() => error),
        ),
      );
  }

  create(draft: TechnicianDraft): Observable<Technician> {
    if (!isLegajo(draft.legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    const legajo = draft.legajo;

    return this.http
      .post<Technician>(this.apiUrl, this.fields(legajo, draft))
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            errorCode(error) === 'DUPLICATE_LEGAJO' ? new DuplicateLegajoError(legajo) : error,
          ),
        ),
      );
  }

  update(legajo: string, changes: TechnicianChanges): Observable<Technician> {
    if (!isLegajo(legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    return this.http
      .put<Technician>(this.url(legajo), this.fields(legajo, changes))
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            errorStatus(error) === 404 ? new TechnicianNotFoundError(legajo) : error,
          ),
        ),
      );
  }

  delete(legajo: string): Observable<void> {
    if (!isLegajo(legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    return this.http.delete<void>(this.url(legajo)).pipe(
      map(() => undefined),
      catchError((error: unknown) => {
        if (errorStatus(error) === 404) {
          return throwError(() => new TechnicianNotFoundError(legajo));
        }

        if (errorCode(error) === 'TECHNICIAN_IN_USE') {
          return throwError(
            () =>
              new TechnicianInUseError(
                legajo,
                errorMessage(error, `El técnico ${legajo} está en uso.`),
              ),
          );
        }

        return throwError(() => error);
      }),
    );
  }

  private url(legajo: string): string {
    return `${this.apiUrl}/${encodeURIComponent(legajo)}`;
  }

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
