import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { AuthSession } from './core/auth/auth.model';
import { AUTH_STORAGE_KEY, AuthService } from './core/auth/auth.service';
import { API_BASE_URL } from './core/config/api.config';
import { DashboardService } from './features/dashboard/data-access/dashboard.service';

describe('appConfig', () => {
  const meUrl = `${API_BASE_URL}/auth/me`;
  const session: AuthSession = {
    token: 'jwt.admin',
    user: {
      id: '1',
      username: 'admin',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    },
  };

  // `TestBed.inject` crea el entorno y ejecuta los `provideAppInitializer`: con sesión guardada eso
  // dispara `GET /auth/me`, que cada test responde (o no) según lo que quiera comprobar.
  function configure(): HttpTestingController {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    return TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('registers authInterceptor: requests from real services carry the session token', () => {
    expect.assertions(1);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    const httpMock = configure();
    httpMock.expectOne(meUrl).flush(session.user);

    TestBed.inject(DashboardService).getSummary().subscribe();

    const request = httpMock.expectOne(`${API_BASE_URL}/dashboard/summary`);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${session.token}`);
    request.flush([]);
    httpMock.verify();
  });

  it('sends requests from real services without Authorization when there is no session', () => {
    expect.assertions(1);
    const httpMock = configure();

    TestBed.inject(DashboardService).getSummary().subscribe();

    const request = httpMock.expectOne(`${API_BASE_URL}/dashboard/summary`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
    httpMock.verify();
  });

  describe('session revalidation at startup', () => {
    it('asks GET /auth/me with the stored token before the app starts', () => {
      expect.assertions(2);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      const httpMock = configure();

      const request = httpMock.expectOne(meUrl);

      expect(request.request.method).toBe('GET');
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${session.token}`);
      request.flush(session.user);
      httpMock.verify();
    });

    it('makes no request when there is no stored session', () => {
      const httpMock = configure();

      expect(() => httpMock.expectNone(meUrl)).not.toThrow();
    });

    it('drops the stored session when the server answers 401', () => {
      expect.assertions(2);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      const httpMock = configure();

      httpMock
        .expectOne(meUrl)
        .flush(
          { code: 'UNAUTHORIZED', message: 'Token vencido' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('keeps the stored session when the server cannot be reached', () => {
      expect.assertions(1);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      const httpMock = configure();

      httpMock.expectOne(meUrl).error(new ProgressEvent('error'));

      expect(TestBed.inject(AuthService).session()).toEqual(session);
    });
  });
});
