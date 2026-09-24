import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import {
  AuthUser,
  isLegajo,
  TechnicianProfile,
  toAuthUser,
  UserRecord,
  UserRole,
} from './auth.model';
import { InvalidUserRecordError } from './auth.service';

// El legajo falta, no tiene el formato del dominio, o se envió a un rol que no es técnico.
export class InvalidLegajoError extends Error {
  constructor(message = 'El legajo no es válido.') {
    super(message);
    this.name = 'InvalidLegajoError';
  }
}

// El legajo tiene formato válido pero no existe en el maestro de técnicos: no se puede crear
// un login para un técnico que no existe.
export class TechnicianNotFoundError extends Error {
  constructor(readonly legajo: string) {
    super(`No existe un técnico con legajo ${legajo}.`);
    this.name = 'TechnicianNotFoundError';
  }
}

// Ese técnico ya tiene un usuario de login: hay un único login por legajo.
export class LegajoAlreadyLinkedError extends Error {
  constructor(readonly legajo: string) {
    super(`El técnico con legajo ${legajo} ya tiene un usuario.`);
    this.name = 'LegajoAlreadyLinkedError';
  }
}

export interface UserDraft {
  username: string;
  password: string;
  displayName: string;
  email: string;
  role: UserRole;
  // Obligatorio (y solo válido) cuando el rol es `tecnico`.
  legajo?: string;
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${API_BASE_URL}/users`;

  // Crea un usuario de login. Para el rol `tecnico` valida la referencia cruzada contra el maestro
  // (json-server no tiene integridad referencial): el legajo debe existir y no tener ya un login.
  // Solo valida y escribe si todo lo anterior pasó; con backend real (spec 018) esto pasa a ser una
  // FK más un índice único, y estos chequeos previos se vuelven errores del servidor.
  // Devuelve el usuario sin `password`.
  create(draft: UserDraft): Observable<AuthUser> {
    const legajo = draft.legajo;

    if (draft.role !== 'tecnico') {
      return legajo === undefined
        ? this.persist(draft, null)
        : throwError(
            () => new InvalidLegajoError('Solo un usuario con rol técnico puede tener legajo.'),
          );
    }

    if (!isLegajo(legajo)) {
      return throwError(() => new InvalidLegajoError());
    }

    return this.findTechnicianProfile(legajo).pipe(
      switchMap((profile) =>
        this.ensureNotLinked(legajo).pipe(switchMap(() => this.persist(draft, profile))),
      ),
    );
  }

  // Consulta por ruta y no por `?legajo=`: json-server convierte a número los valores numéricos
  // del query string y no encontraría un legajo guardado como string.
  private findTechnicianProfile(legajo: string): Observable<TechnicianProfile> {
    return this.http
      .get<TechnicianProfile>(`${API_BASE_URL}/tecnicos/${encodeURIComponent(legajo)}`)
      .pipe(
        // Solo el 404 significa "no existe"; un error de red o 5xx se propaga como tal.
        catchError((error: unknown) =>
          isNotFound(error)
            ? throwError(() => new TechnicianNotFoundError(legajo))
            : throwError(() => error),
        ),
      );
  }

  // ¿Ese técnico ya tiene un usuario de login? Se filtra en el cliente por el mismo motivo que
  // arriba: `?legajo=` no matchea strings numéricos. Un legajo sin formato válido no puede tener
  // usuario (y no se arma ningún request). Un error de red o 5xx se propaga: quien decide con esta
  // respuesta (p. ej. el borrado de un técnico) no debe tomar un fallo como "no tiene".
  hasTechnicianAccount(legajo: string): Observable<boolean> {
    if (!isLegajo(legajo)) {
      return of(false);
    }

    return this.http
      .get<{ legajo?: unknown }[]>(this.usersUrl, { params: { role: 'tecnico' } })
      .pipe(map((technicianUsers) => technicianUsers.some((user) => user.legajo === legajo)));
  }

  private ensureNotLinked(legajo: string): Observable<void> {
    return this.hasTechnicianAccount(legajo).pipe(
      map((linked) => {
        if (linked) {
          throw new LegajoAlreadyLinkedError(legajo);
        }
      }),
    );
  }

  private persist(draft: UserDraft, profile: TechnicianProfile | null): Observable<AuthUser> {
    // Solo los campos del usuario de login: nada del perfil (vive en el maestro) ni campos ajenos.
    const body = {
      username: draft.username,
      password: draft.password,
      displayName: draft.displayName,
      email: draft.email,
      role: draft.role,
      ...(draft.role === 'tecnico' ? { legajo: draft.legajo } : {}),
    };

    // Se valida el resultado antes de escribir: un perfil del maestro corrupto no debe dejar un
    // login creado a medias.
    if (!toAuthUser({ ...body, id: 'pending' }, profile)) {
      return throwError(() => new InvalidUserRecordError());
    }

    return this.http.post<UserRecord>(this.usersUrl, body).pipe(
      map((created) => {
        const user = toAuthUser(created, profile);

        if (!user) {
          throw new InvalidUserRecordError();
        }

        return user;
      }),
    );
  }
}
