import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of, tap, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { LocalStorageService } from '../services/localStorage.service';
import { AuthSession, isAuthSession, isAuthUser, LoginCredentials } from './auth.model';

export const AUTH_STORAGE_KEY = 'auth.session';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Usuario o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
  }
}

// Las credenciales son correctas pero el usuario que devuelve la API no es un perfil válido (p. ej.
// un técnico sin legajo, especialidad o tipo de equipo). No es un error de credenciales ni de
// conexión: se distingue para no mostrarlo como "usuario o contraseña incorrectos".
export class InvalidUserRecordError extends Error {
  constructor() {
    super('El perfil de este usuario está incompleto. Contacte al administrador.');
    this.name = 'InvalidUserRecordError';
  }
}

// El `errorInterceptor` ya convirtió el `HttpErrorResponse` en un `AppHttpError` con el mismo `status`.
function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 401
  );
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

  // Un `401` es "usuario o contraseña incorrectos" (la API responde `INVALID_CREDENTIALS`); la
  // conexión caída o un `5xx` se propagan tal cual para no presentarlos como credenciales malas.
  // El `user` que devuelve la API ya trae el perfil del técnico (`legajo`, `specialty`,
  // `teamType`): se valida su forma, pero no se completa ni se consulta nada más.
  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http.post<unknown>(`${API_BASE_URL}/auth/login`, credentials).pipe(
      catchError((error: unknown) =>
        throwError(() => (isUnauthorized(error) ? new InvalidCredentialsError() : error)),
      ),
      map((body) => {
        if (!isAuthSession(body)) {
          throw new InvalidUserRecordError();
        }

        return { token: body.token, user: body.user } satisfies AuthSession;
      }),
      tap((session) => this.saveSession(session)),
    );
  }

  // Contrasta la sesión guardada con el servidor (`GET /auth/me`): el rol o el perfil pueden haber
  // cambiado y el token pudo vencer. Solo un `401` o un `user` inválido descartan la sesión; sin
  // conexión (o con `5xx`) se conserva, porque no se sabe si dejó de ser válida. Nunca falla.
  revalidate(): Observable<void> {
    const current = this.sessionState();

    if (!current) {
      return of(undefined);
    }

    return this.http.get<unknown>(`${API_BASE_URL}/auth/me`).pipe(
      map((user) => {
        if (isAuthUser(user)) {
          this.saveSession({ token: current.token, user });
        } else {
          this.logout();
        }
      }),
      catchError((error: unknown) => {
        if (isUnauthorized(error)) {
          this.logout();
        }

        return of(undefined);
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

  private saveSession(session: AuthSession): void {
    this.sessionState.set(session);
    this.storage.set(AUTH_STORAGE_KEY, session);
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
