import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { map, Observable, tap } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';
import { LocalStorageService } from '../services/localStorage.service';
import { AuthSession, isAuthSession, LoginCredentials, UserRecord } from './auth.model';

export const AUTH_STORAGE_KEY = 'auth.session';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Usuario o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
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
  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http
      .get<UserRecord[]>(`${API_BASE_URL}/users`, {
        params: { username: credentials.username, password: credentials.password },
      })
      .pipe(
        map((users) => {
          const record = users[0];

          if (
            !record ||
            record.username !== credentials.username ||
            record.password !== credentials.password
          ) {
            throw new InvalidCredentialsError();
          }

          return {
            token: `mock-token.${record.id}.${Date.now()}`,
            user: {
              id: record.id,
              username: record.username,
              displayName: record.displayName,
              email: record.email,
              role: record.role,
            },
          } satisfies AuthSession;
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
