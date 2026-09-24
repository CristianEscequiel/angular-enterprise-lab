import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of, switchMap, tap, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { LocalStorageService } from '../services/localStorage.service';
import {
  AuthSession,
  AuthUser,
  isAuthSession,
  isLegajo,
  LoginCredentials,
  TechnicianProfile,
  toAuthUser,
  UserRecord,
} from './auth.model';

export const AUTH_STORAGE_KEY = 'auth.session';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Usuario o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
  }
}

// El registro existe y las credenciales coinciden, pero su perfil no es válido (p. ej. un técnico
// sin legajo o cuyo legajo ya no existe en el maestro de técnicos). No es un error de credenciales
// ni de conexión: se distingue para no mostrarlo como "usuario o contraseña incorrectos".
export class InvalidUserRecordError extends Error {
  constructor() {
    super('El perfil de este usuario está incompleto. Contacte al administrador.');
    this.name = 'InvalidUserRecordError';
  }
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly storage = inject(LocalStorageService);

  private readonly sessionState = signal<AuthSession | null>(this.restoreSession());

  readonly session = this.sessionState.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionState() !== null);
  readonly currentUser = computed(() => this.sessionState()?.user ?? null);
  readonly token = computed(() => this.sessionState()?.token ?? null);

  // Hoy valida contra la colección `users` de JSON Server. En spec 018 solo cambia esta
  // llamada (POST /auth/login devolviendo { token, user }); el resto del contrato se mantiene.
  // Un usuario técnico solo guarda su `legajo`: el perfil (especialidad y tipo de equipo) se
  // resuelve contra el maestro de técnicos, que es su única fuente de verdad.
  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http
      .get<UserRecord[]>(`${API_BASE_URL}/users`, {
        params: { username: credentials.username, password: credentials.password },
      })
      .pipe(
        switchMap((users) => {
          const record = users[0];

          if (
            !record ||
            record.username !== credentials.username ||
            record.password !== credentials.password
          ) {
            return throwError(() => new InvalidCredentialsError());
          }

          return this.resolveUser(record).pipe(
            map((user) => {
              if (!user) {
                throw new InvalidUserRecordError();
              }

              return { token: `mock-token.${record.id}.${Date.now()}`, user } satisfies AuthSession;
            }),
          );
        }),
        tap((session) => {
          this.sessionState.set(session);
          this.storage.set(AUTH_STORAGE_KEY, session);
        }),
      );
  }

  logout(): void {
    this.sessionState.set(null);
    this.storage.remove(AUTH_STORAGE_KEY);
  }

  loginUrlFor(returnUrl: string): UrlTree {
    return this.router.createUrlTree(['/login'], { queryParams: { returnUrl } });
  }

  private resolveUser(record: UserRecord): Observable<AuthUser | null> {
    if (record.role !== 'tecnico') {
      return of(toAuthUser(record));
    }

    // Sin legajo válido no hay maestro que consultar: no se arma ningún request.
    if (!isLegajo(record.legajo)) {
      return of(null);
    }

    return this.http
      .get<TechnicianProfile>(`${API_BASE_URL}/tecnicos/${encodeURIComponent(record.legajo)}`)
      .pipe(
        map((profile) => toAuthUser(record, profile)),
        // 404: el login existe pero su técnico no. Cualquier otro error (red, 5xx) se propaga
        // tal cual y no se presenta como un dato inválido.
        catchError((error: unknown) =>
          (error as { status?: number } | null)?.status === 404
            ? of(null)
            : throwError(() => error),
        ),
      );
  }

  private restoreSession(): AuthSession | null {
    const stored = this.storage.get(AUTH_STORAGE_KEY);

    if (isAuthSession(stored)) {
      return stored;
    }

    // Ausente, JSON corrupto o shape inválido: no dejar rastro de una sesión inutilizable.
    this.storage.remove(AUTH_STORAGE_KEY);
    return null;
  }
}
