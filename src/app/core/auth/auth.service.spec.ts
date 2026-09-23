import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { API_BASE_URL } from '../config/api.config';
import { AuthSession, UserRecord } from './auth.model';
import { AUTH_STORAGE_KEY, AuthService, InvalidCredentialsError } from './auth.service';

describe('AuthService', () => {
  const admin: UserRecord = {
    id: '1',
    username: 'admin',
    password: 'admin123',
    displayName: 'Administrador',
    email: 'admin@enterprise-lab.dev',
    role: 'admin',
  };
  const tecnico: UserRecord = {
    id: '2',
    username: 'tecnico',
    password: 'tecnico123',
    displayName: 'Técnico de Mantenimiento',
    email: 'tecnico@enterprise-lab.dev',
    role: 'tecnico',
  };

  let httpMock: HttpTestingController;

  function setup(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  function storedSession(): unknown {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  }

  function loginAs(service: AuthService, user: UserRecord): AuthSession {
    let result: AuthSession | undefined;

    service
      .login({ username: user.username, password: user.password })
      .subscribe((session) => (result = session));
    httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`).flush([user]);

    if (!result) {
      throw new Error('login did not emit a session');
    }
    return result;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('login', () => {
    it('queries /users with the credentials and authenticates the user', () => {
      expect.assertions(6);
      const service = setup();

      service.login({ username: 'admin', password: 'admin123' }).subscribe();
      const request = httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('username')).toBe('admin');
      expect(request.request.params.get('password')).toBe('admin123');
      request.flush([admin]);

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toEqual({
        id: '1',
        username: 'admin',
        displayName: 'Administrador',
        email: 'admin@enterprise-lab.dev',
        role: 'admin',
      });
      expect(service.token()).toMatch(/^mock-token\.1\.\d+$/);
    });

    it('copies the role of the authenticated user into the session', () => {
      expect.assertions(3);
      const service = setup();

      loginAs(service, tecnico);

      expect(service.currentUser()?.role).toBe('tecnico');
      expect(service.currentUser()).not.toHaveProperty('password');
      expect(storedSession()).toMatchObject({ user: { role: 'tecnico' } });
    });

    it('never keeps the password in the session state or in storage', () => {
      expect.assertions(3);
      const service = setup();

      loginAs(service, admin);

      expect(JSON.stringify(service.session())).not.toContain('admin123');
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toContain('admin123');
      expect(service.currentUser()).not.toHaveProperty('password');
    });

    it('persists the session in localStorage', () => {
      const service = setup();

      const session = loginAs(service, admin);

      expect(storedSession()).toEqual(session);
    });

    it('fails with InvalidCredentialsError and stays unauthenticated when no user matches', () => {
      expect.assertions(5);
      const service = setup();
      let error: unknown;

      service
        .login({ username: 'admin', password: 'mala' })
        .subscribe({ error: (e: unknown) => (error = e) });
      httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`).flush([]);

      expect(error).toBeInstanceOf(InvalidCredentialsError);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.token()).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('rejects a response whose user does not match the submitted credentials', () => {
      expect.assertions(2);
      const service = setup();
      let error: unknown;

      service
        .login({ username: 'admin', password: 'mala' })
        .subscribe({ error: (e: unknown) => (error = e) });
      httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`).flush([admin]);

      expect(error).toBeInstanceOf(InvalidCredentialsError);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('propagates HTTP errors without touching the session', () => {
      expect.assertions(3);
      const service = setup();
      let error: unknown;

      service
        .login({ username: 'admin', password: 'admin123' })
        .subscribe({ error: (e: unknown) => (error = e) });
      httpMock
        .expectOne((req) => req.url === `${API_BASE_URL}/users`)
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  describe('session restore', () => {
    it('starts unauthenticated when there is no stored session', () => {
      const service = setup();

      expect(service.isAuthenticated()).toBe(false);
    });

    it('keeps the session after a page reload', () => {
      expect.assertions(4);
      const firstVisit = setup();
      const session = loginAs(firstVisit, admin);

      TestBed.resetTestingModule();
      const afterReload = setup();

      expect(afterReload.isAuthenticated()).toBe(true);
      expect(afterReload.currentUser()).toEqual(session.user);
      expect(afterReload.token()).toBe(session.token);
      expect(afterReload.session()).toEqual(session);
    });

    it('restores a valid session already present in localStorage', () => {
      expect.assertions(2);
      const session: AuthSession = {
        token: 'mock-token.2.1700000000000',
        user: {
          id: '2',
          username: 'tecnico',
          displayName: 'Técnico de Mantenimiento',
          email: 'tecnico@enterprise-lab.dev',
          role: 'tecnico',
        },
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));

      const service = setup();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.session()).toEqual(session);
    });

    it('discards a session stored without role (saved before roles existed) and forces a new login', () => {
      expect.assertions(2);
      const legacyUser = {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        email: admin.email,
      };
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: 'mock-token.1.1700000000000', user: legacyUser }),
      );

      const service = setup();

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it.each([
      ['corrupt JSON', '{not json'],
      ['a JSON value that is not a session', JSON.stringify({ token: 'x' })],
      ['a session with an empty token', JSON.stringify({ token: '', user: admin })],
    ])('discards %s and starts unauthenticated', (_label, raw) => {
      expect.assertions(2);
      localStorage.setItem(AUTH_STORAGE_KEY, raw);

      const service = setup();

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the session state and the stored session completely', () => {
      expect.assertions(6);
      const service = setup();
      loginAs(service, admin);

      service.logout();

      expect(service.session()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.token()).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    it('does not restore the session after a reload', () => {
      const service = setup();
      loginAs(service, admin);
      service.logout();

      TestBed.resetTestingModule();
      const afterReload = setup();

      expect(afterReload.isAuthenticated()).toBe(false);
    });

    it('does not leak the previous user into the next login', () => {
      expect.assertions(5);
      const service = setup();
      const adminSession = loginAs(service, admin);
      service.logout();

      const tecnicoSession = loginAs(service, tecnico);

      expect(service.currentUser()).toEqual(tecnicoSession.user);
      expect(service.currentUser()?.id).toBe('2');
      expect(JSON.stringify(service.session())).not.toContain(admin.username);
      expect(storedSession()).toEqual(tecnicoSession);
      expect(adminSession.token).not.toBe(tecnicoSession.token);
    });
  });

  describe('loginUrlFor', () => {
    it('builds /login with the requested url as returnUrl', () => {
      expect.assertions(2);
      const service = setup();
      const router = TestBed.inject(Router);

      const tree = service.loginUrlFor('/work-orders/5');

      expect(router.serializeUrl(tree)).toBe('/login?returnUrl=%2Fwork-orders%2F5');
      expect(tree.queryParams['returnUrl']).toBe('/work-orders/5');
    });
  });
});
