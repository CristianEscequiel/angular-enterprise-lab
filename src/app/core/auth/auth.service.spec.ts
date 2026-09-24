import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { API_BASE_URL } from '../config/api.config';
import { AuthSession, StaffUser, TechnicianProfile, UserRecord } from './auth.model';
import {
  AUTH_STORAGE_KEY,
  AuthService,
  InvalidCredentialsError,
  InvalidUserRecordError,
} from './auth.service';

describe('AuthService', () => {
  const admin: StaffUser & { password: string } = {
    id: '1',
    username: 'admin',
    password: 'admin123',
    displayName: 'Administrador',
    email: 'admin@enterprise-lab.dev',
    role: 'administrador',
  };
  // El usuario técnico solo lleva el legajo; su perfil vive en el maestro (`/tecnicos/:legajo`).
  const tecnico: UserRecord = {
    id: '2',
    username: 'tecnico',
    password: 'tecnico123',
    displayName: 'Técnico de Mantenimiento',
    email: 'tecnico@enterprise-lab.dev',
    role: 'tecnico',
    legajo: '1001',
  };
  const mecanicoDeGuardia: TechnicianProfile = { specialty: 'mecanico', teamType: 'guardia' };
  const tecnicoUrl = `${API_BASE_URL}/tecnicos/1001`;
  const isUsersRequest = (req: { url: string }) => req.url === `${API_BASE_URL}/users`;
  const isMasterRequest = (req: { url: string }) => req.url.startsWith(`${API_BASE_URL}/tecnicos`);

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

  // Un técnico dispara además la consulta a su maestro: se responde con `profile`.
  function loginAs(
    service: AuthService,
    user: UserRecord,
    profile: object = mecanicoDeGuardia,
  ): AuthSession {
    let result: AuthSession | undefined;

    service
      .login({ username: user.username, password: user.password })
      .subscribe((session) => (result = session));
    httpMock.expectOne(isUsersRequest).flush([user]);

    if (user.role === 'tecnico') {
      httpMock.expectOne(`${API_BASE_URL}/tecnicos/${user.legajo}`).flush(profile);
    }

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
        role: 'administrador',
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

    it('copies the technician specialty and team type into the session and into storage', () => {
      expect.assertions(2);
      const service = setup();

      loginAs(service, tecnico);

      expect(service.currentUser()).toMatchObject({ specialty: 'mecanico', teamType: 'guardia' });
      expect(storedSession()).toMatchObject({
        user: { specialty: 'mecanico', teamType: 'guardia' },
      });
    });

    it('keeps the two technician attributes independent (electricista on preventivo-correctivo)', () => {
      expect.assertions(1);
      const service = setup();

      loginAs(service, tecnico, { specialty: 'electricista', teamType: 'preventivo-correctivo' });

      expect(service.currentUser()).toMatchObject({
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      });
    });

    it('does not give technician attributes to a team leader', () => {
      expect.assertions(3);
      const service = setup();

      loginAs(service, { ...admin, id: '3', role: 'team-leader-mantenimiento' });

      expect(service.currentUser()?.role).toBe('team-leader-mantenimiento');
      expect(service.currentUser()).not.toHaveProperty('specialty');
      expect(service.currentUser()).not.toHaveProperty('teamType');
    });

    it('drops technician attributes carried by a record whose role is not tecnico', () => {
      expect.assertions(2);
      const service = setup();
      const staffWithStrayAttributes = {
        ...admin,
        specialty: 'mecanico',
        teamType: 'guardia',
      } as UserRecord;

      loginAs(service, staffWithStrayAttributes);

      expect(service.currentUser()).not.toHaveProperty('specialty');
      expect(service.currentUser()).not.toHaveProperty('teamType');
    });

    it('resolves a technician against the master: users first, then /tecnicos/:legajo', () => {
      expect.assertions(4);
      const service = setup();

      service.login({ username: tecnico.username, password: tecnico.password }).subscribe();
      httpMock.expectOne(isUsersRequest).flush([tecnico]);
      const masterRequest = httpMock.expectOne(tecnicoUrl);
      expect(masterRequest.request.method).toBe('GET');
      expect(service.isAuthenticated()).toBe(false);
      masterRequest.flush({ id: '1001', legajo: '1001', ...mecanicoDeGuardia, firstName: 'Ana' });

      expect(service.currentUser()).toMatchObject({ legajo: '1001', ...mecanicoDeGuardia });
      expect(service.currentUser()).not.toHaveProperty('firstName');
    });

    it('takes specialty and team type from the master, not from the users record', () => {
      expect.assertions(2);
      const service = setup();
      const staleRecord = {
        ...tecnico,
        specialty: 'electricista',
        teamType: 'preventivo-correctivo',
      } as UserRecord;

      loginAs(service, staleRecord, mecanicoDeGuardia);

      expect(service.currentUser()).toMatchObject(mecanicoDeGuardia);
      expect(storedSession()).toMatchObject({ user: { legajo: '1001', ...mecanicoDeGuardia } });
    });

    it('fails with InvalidUserRecordError, without a session, when the master has no such legajo', () => {
      expect.assertions(4);
      const service = setup();
      let error: unknown;

      service
        .login({ username: tecnico.username, password: tecnico.password })
        .subscribe({ error: (e: unknown) => (error = e) });
      httpMock.expectOne(isUsersRequest).flush([tecnico]);
      httpMock.expectOne(tecnicoUrl).flush('not found', { status: 404, statusText: 'Not Found' });

      expect(error).toBeInstanceOf(InvalidUserRecordError);
      expect(error).not.toBeInstanceOf(InvalidCredentialsError);
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('propagates a master server error as a connection error, not as an invalid record', () => {
      expect.assertions(4);
      const service = setup();
      let error: unknown;

      service
        .login({ username: tecnico.username, password: tecnico.password })
        .subscribe({ error: (e: unknown) => (error = e) });
      httpMock.expectOne(isUsersRequest).flush([tecnico]);
      httpMock.expectOne(tecnicoUrl).flush('boom', { status: 500, statusText: 'Server Error' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(InvalidUserRecordError);
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it.each([
      ['no specialty', { specialty: undefined }],
      ['no team type', { teamType: undefined }],
      ['an unknown specialty', { specialty: 'plomero' }],
      ['an unknown team type', { teamType: 'nocturno' }],
    ])(
      'fails with InvalidUserRecordError, without a session, for a master profile with %s',
      (_label, override) => {
        expect.assertions(4);
        const service = setup();
        let error: unknown;

        service
          .login({ username: tecnico.username, password: tecnico.password })
          .subscribe({ error: (e: unknown) => (error = e) });
        httpMock.expectOne(isUsersRequest).flush([tecnico]);
        httpMock.expectOne(tecnicoUrl).flush({ ...mecanicoDeGuardia, ...override });

        expect(error).toBeInstanceOf(InvalidUserRecordError);
        expect(error).not.toBeInstanceOf(InvalidCredentialsError);
        expect(service.isAuthenticated()).toBe(false);
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      },
    );

    it.each([
      ['no legajo', { legajo: undefined }],
      ['an empty legajo', { legajo: '' }],
      ['a legajo that is not a number', { legajo: '../users' }],
    ])(
      'fails with InvalidUserRecordError and never queries the master for a technician with %s',
      (_label, override) => {
        expect.assertions(2);
        const service = setup();
        let error: unknown;

        service
          .login({ username: tecnico.username, password: tecnico.password })
          .subscribe({ error: (e: unknown) => (error = e) });
        httpMock.expectOne(isUsersRequest).flush([{ ...tecnico, ...override }]);

        expect(error).toBeInstanceOf(InvalidUserRecordError);
        expect(service.isAuthenticated()).toBe(false);
        httpMock.expectNone(isMasterRequest);
      },
    );

    it.each(['administrador', 'team-leader-mantenimiento', 'personal-produccion'] as const)(
      'does not query the master when a %s logs in',
      (role) => {
        const service = setup();

        loginAs(service, { ...admin, role });

        httpMock.expectNone(isMasterRequest);
        expect(service.isAuthenticated()).toBe(true);
      },
    );

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
          legajo: '1001',
          specialty: 'mecanico',
          teamType: 'guardia',
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

    it('discards a session stored with the legacy role admin (before 013b) and forces a new login', () => {
      expect.assertions(2);
      const legacySession = {
        token: 'mock-token.1.1700000000000',
        user: { ...admin, password: undefined, role: 'admin' },
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(legacySession));

      const service = setup();

      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('discards a stored technician session that lost its specialty', () => {
      expect.assertions(2);
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          token: 'mock-token.2.1700000000000',
          // JSON.stringify omite `undefined`: la clave queda ausente del storage.
          user: { ...tecnico, password: undefined, specialty: undefined },
        }),
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
