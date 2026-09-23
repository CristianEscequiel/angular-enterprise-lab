import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  const workOrdersUrl = `${API_BASE_URL}/work-orders`;

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  function login(): void {
    authService.login({ username: 'admin', password: 'admin123' }).subscribe();
    httpMock
      .expectOne((req) => req.url === `${API_BASE_URL}/users`)
      .flush([
        {
          id: '1',
          username: 'admin',
          password: 'admin123',
          displayName: 'Administrador',
          email: 'admin@enterprise-lab.dev',
          role: 'admin',
        },
      ]);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('does not add the Authorization header when there is no session', () => {
    expect.assertions(1);

    http.get(workOrdersUrl).subscribe();

    const request = httpMock.expectOne(workOrdersUrl);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
  });

  it('adds the stored token as a Bearer Authorization header after login', () => {
    expect.assertions(3);
    login();
    const token = authService.token();

    http.get(workOrdersUrl).subscribe();

    const request = httpMock.expectOne(workOrdersUrl);
    expect(token).toBeTruthy();
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(request.request.headers.get('Authorization')).not.toContain('undefined');
    request.flush([]);
  });

  it('adds the header to every method, not only GET', () => {
    expect.assertions(1);
    login();

    http.delete(`${workOrdersUrl}/1`).subscribe();

    const request = httpMock.expectOne(`${workOrdersUrl}/1`);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${authService.token()}`);
    request.flush(null);
  });

  it('stops sending the header once the user logs out', () => {
    expect.assertions(2);
    login();

    http.get(workOrdersUrl).subscribe();
    const withSession = httpMock.expectOne(workOrdersUrl);
    expect(withSession.request.headers.has('Authorization')).toBe(true);
    withSession.flush([]);

    authService.logout();

    http.get(workOrdersUrl).subscribe();
    const afterLogout = httpMock.expectOne(workOrdersUrl);
    expect(afterLogout.request.headers.has('Authorization')).toBe(false);
    afterLogout.flush([]);
  });

  it('does not leak the token to URLs outside the API', () => {
    expect.assertions(1);
    login();

    http.get('https://example.com/data').subscribe();

    const request = httpMock.expectOne('https://example.com/data');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
