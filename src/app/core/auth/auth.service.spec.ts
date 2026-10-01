import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { API_BASE_URL } from '../config/api.config';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { MessageService } from '../services/message.service';
import { AuthSession, AuthUser } from './auth.model';
import {
  AUTH_STORAGE_KEY,
  AuthService,
  InvalidCredentialsError,
  InvalidUserRecordError,
} from './auth.service';

describe('AuthService', () => {
  const loginUrl = `${API_BASE_URL}/auth/login`;
  const meUrl = `${API_BASE_URL}/auth/me`;

  const admin: AuthUser = {
    id: '1',
    username: 'admin',
    displayName: 'Administrador',
    email: 'admin@enterprise-lab.dev',
    role: 'administrador',
  };
  const tecnico: AuthUser = {
    id: '4',
    username: 'tecnico',
    displayName: 'Técnico Mecánico de Guardia',
    email: 'tecnico@enterprise-lab.dev',
    role: 'tecnico',
    legajo: '1001',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const adminSession: AuthSession = { token: 'jwt.admin', user: admin };
  const tecnicoSession: AuthSession = { token: 'jwt.tecnico', user: tecnico };

  let httpMock: HttpTestingController;

  // Con el `errorInterceptor` real: la API llega al servicio como `AppHttpError`, igual que en la app.
  function setup(): AuthService {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  function storedSession(): unknown {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  }

  function loginAs(service: AuthService, session: AuthSession): AuthSession {
    let result: AuthSession | undefined;

    service
      .login({ username: session.user.username, password: 'secreto1' })
      .subscribe((value) => (result = value));
    httpMock.expectOne(loginUrl).flush(session);

    if (!result) {
      throw new Error('login did not emit a session');
    }
    return result;
  }

  function loginError(service: AuthService): { current: unknown } {
    const captured: { current: unknown } = { current: undefined };
    service
      .login({ username: 'admin', password: 'mala' })
      .subscribe({ error: (e: unknown) => (captured.current = e) });
    return captured;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('login', () => {
    it('posts the credentials to /auth/login and authenticates with the returned session', () => {
      expect.assertions(6);
      const service = setup();

      service.login({ username: 'admin', password: 'admin123' }).subscribe();
      const request = httpMock.expectOne(loginUrl);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ username: 'admin', password: 'admin123' });
      request.flush(adminSession);

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toEqual(admin);
      expect(service.token()).toBe('jwt.admin');
      expect(storedSession()).toEqual(adminSession);
    });

    it('uses the technician profile that the API returns, without querying anything else', () => {
      expect.assertions(3);
      const service = setup();

      loginAs(service, tecnicoSession);

      expect(service.currentUser()).toEqual(tecnico);
      expect(storedSession()).toMatchObject({
        user: { legajo: '1001', specialty: 'mecanico', teamType: 'guardia' },
      });
      httpMock.expectNone((req) => req.url !== loginUrl);
      expect(service.token()).toBe('jwt.tecnico');
    });

    it('keeps the two technician attributes independent (electricista on preventivo-correctivo)', () => {
      expect.assertions(1);
      const service = setup();

      loginAs(service, {
        token: 'jwt',
        user: {
          ...tecnico,
          specialty: 'electricista',
          teamType: 'preventivo-correctivo',
        } as AuthUser,
      });

      expect(service.currentUser()).toMatchObject({
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      });
    });

    it('does not give technician attributes to a team leader', () => {
      expect.assertions(3);
      const service = setup();

      loginAs(service, {
        token: 'jwt',
        user: { ...admin, id: '2', role: 'team-leader-mantenimiento' },
      });

      expect(service.currentUser()?.role).toBe('team-leader-mantenimiento');
      expect(service.currentUser()).not.toHaveProperty('specialty');
      expect(service.currentUser()).not.toHaveProperty('teamType');
    });

    it('fails with InvalidCredentialsError and stays unauthenticated on a 401', () => {
      expect.assertions(5);
      const service = setup();
      const error = loginError(service);

      httpMock
        .expectOne(loginUrl)
        .flush(
          { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(error.current).toBeInstanceOf(InvalidCredentialsError);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.token()).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(TestBed.inject(MessageService).message()).toBeNull();
    });

    it.each([
      ['no specialty', { specialty: undefined }],
      ['no team type', { teamType: undefined }],
      ['an unknown specialty', { specialty: 'plomero' }],
      ['an unknown team type', { teamType: 'nocturno' }],
      ['no legajo', { legajo: undefined }],
      ['a legajo that is not a number', { legajo: '../users' }],
    ])(
      'fails with InvalidUserRecordError, without a session, for a technician with %s',
      (_label, override) => {
        expect.assertions(4);
        const service = setup();
        const error = loginError(service);

        httpMock.expectOne(loginUrl).flush({ token: 'jwt', user: { ...tecnico, ...override } });

        expect(error.current).toBeInstanceOf(InvalidUserRecordError);
        expect(error.current).not.toBeInstanceOf(InvalidCredentialsError);
        expect(service.isAuthenticated()).toBe(false);
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      },
    );

    it('fails with InvalidUserRecordError when a non-technician carries technician attributes', () => {
      expect.assertions(2);
      const service = setup();
      const error = loginError(service);

      httpMock
        .expectOne(loginUrl)
        .flush({ token: 'jwt', user: { ...admin, specialty: 'mecanico', teamType: 'guardia' } });

      expect(error.current).toBeInstanceOf(InvalidUserRecordError);
      expect(service.isAuthenticated()).toBe(false);
    });

    it.each([
      ['an empty body', null],
      ['a body without token', { user: admin }],
      ['an empty token', { token: '', user: admin }],
      ['an unknown role', { token: 'jwt', user: { ...admin, role: 'admin' } }],
    ])('fails with InvalidUserRecordError for %s', (_label, body) => {
      expect.assertions(2);
      const service = setup();
      const error = loginError(service);

      httpMock.expectOne(loginUrl).flush(body);

      expect(error.current).toBeInstanceOf(InvalidUserRecordError);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('propagates a 5xx as an HTTP error, not as bad credentials', () => {
      expect.assertions(4);
      const service = setup();
      const error = loginError(service);

      httpMock.expectOne(loginUrl).flush('boom', { status: 500, statusText: 'Server Error' });

      expect(error.current).toMatchObject({ status: 500 });
      expect(error.current).not.toBeInstanceOf(InvalidCredentialsError);
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('propagates a connection failure as an HTTP error with status 0', () => {
      expect.assertions(3);
      const service = setup();
      const error = loginError(service);

      httpMock.expectOne(loginUrl).error(new ProgressEvent('error'));

      expect(error.current).toMatchObject({ status: 0 });
      expect(error.current).not.toBeInstanceOf(InvalidCredentialsError);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('never keeps the password in the session state or in storage', () => {
      expect.assertions(3);
      const service = setup();

      loginAs(service, adminSession);

      expect(JSON.stringify(service.session())).not.toContain('secreto1');
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toContain('secreto1');
      expect(service.currentUser()).not.toHaveProperty('password');
    });

    it('keeps only token and user of the response', () => {
      expect.assertions(1);
      const service = setup();

      loginAs(service, { ...adminSession, extra: 'x' } as AuthSession);

      expect(Object.keys(storedSession() as object).sort()).toEqual(['token', 'user']);
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
      const session = loginAs(firstVisit, adminSession);

      TestBed.resetTestingModule();
      const afterReload = setup();

      expect(afterReload.isAuthenticated()).toBe(true);
      expect(afterReload.currentUser()).toEqual(session.user);
      expect(afterReload.token()).toBe(session.token);
      expect(afterReload.session()).toEqual(session);
    });

    it('restores a valid technician session already present in localStorage', () => {
      expect.assertions(2);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tecnicoSession));

      const service = setup();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.session()).toEqual(tecnicoSession);
    });

    it('discards a session stored without role (saved before roles existed) and forces a new login', () => {
      expect.assertions(2);
      const { id, username, displayName, email } = admin;
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: 'jwt', user: { id, username, displayName, email } }),
      );

      const service = setup();

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('discards a session stored with the legacy role admin (before 013b)', () => {
      expect.assertions(2);
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: 'jwt', user: { ...admin, role: 'admin' } }),
      );

      const service = setup();

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('discards a stored technician session that lost its specialty', () => {
      expect.assertions(2);
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: 'jwt', user: { ...tecnico, specialty: undefined } }),
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

  describe('revalidate', () => {
    function revalidate(service: AuthService): { done: boolean; error: unknown } {
      const state = { done: false, error: undefined as unknown };
      service.revalidate().subscribe({
        complete: () => (state.done = true),
        error: (e: unknown) => (state.error = e),
      });
      return state;
    }

    it('does nothing, and makes no request, without a stored session', () => {
      expect.assertions(2);
      const service = setup();

      const state = revalidate(service);

      httpMock.expectNone(meUrl);
      expect(state.done).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('asks GET /auth/me and replaces the stored user with the one the server returns', () => {
      expect.assertions(5);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(adminSession));
      const service = setup();
      const promoted: AuthUser = { ...admin, displayName: 'Admin renombrado' };

      revalidate(service);
      const request = httpMock.expectOne(meUrl);
      expect(request.request.method).toBe('GET');
      request.flush(promoted);

      expect(service.currentUser()).toEqual(promoted);
      expect(service.token()).toBe('jwt.admin');
      expect(storedSession()).toEqual({ token: 'jwt.admin', user: promoted });
      expect(service.isAuthenticated()).toBe(true);
    });

    it('picks up a role that changed on the server', () => {
      expect.assertions(1);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(adminSession));
      const service = setup();

      revalidate(service);
      httpMock.expectOne(meUrl).flush({ ...admin, role: 'team-leader-mantenimiento' });

      expect(service.currentUser()?.role).toBe('team-leader-mantenimiento');
    });

    it('discards the session on a 401, without a toast', () => {
      expect.assertions(4);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(adminSession));
      const service = setup();

      const state = revalidate(service);
      httpMock
        .expectOne(meUrl)
        .flush(
          { code: 'UNAUTHORIZED', message: 'Token vencido' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(state.done).toBe(true);
      expect(TestBed.inject(MessageService).message()).toBeNull();
    });

    it('discards the session when the server returns an invalid user', () => {
      expect.assertions(2);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tecnicoSession));
      const service = setup();

      revalidate(service);
      httpMock.expectOne(meUrl).flush({ ...tecnico, specialty: undefined });

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('keeps the session when there is no connection', () => {
      expect.assertions(3);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(adminSession));
      const service = setup();

      const state = revalidate(service);
      httpMock.expectOne(meUrl).error(new ProgressEvent('error'));

      expect(service.session()).toEqual(adminSession);
      expect(storedSession()).toEqual(adminSession);
      expect(state.error).toBeUndefined();
    });

    it('keeps the session on a 5xx', () => {
      expect.assertions(2);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(adminSession));
      const service = setup();

      const state = revalidate(service);
      httpMock.expectOne(meUrl).flush('boom', { status: 503, statusText: 'Unavailable' });

      expect(service.session()).toEqual(adminSession);
      expect(state.done).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears the session state and the stored session completely', () => {
      expect.assertions(6);
      const service = setup();
      loginAs(service, adminSession);

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
      loginAs(service, adminSession);
      service.logout();

      TestBed.resetTestingModule();
      const afterReload = setup();

      expect(afterReload.isAuthenticated()).toBe(false);
    });

    it('does not leak the previous user into the next login', () => {
      expect.assertions(4);
      const service = setup();
      loginAs(service, adminSession);
      service.logout();

      const next = loginAs(service, tecnicoSession);

      expect(service.currentUser()).toEqual(next.user);
      expect(service.currentUser()?.id).toBe('4');
      expect(JSON.stringify(service.session())).not.toContain(admin.username);
      expect(storedSession()).toEqual(next);
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
