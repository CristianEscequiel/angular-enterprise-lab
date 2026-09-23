import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { AuthSession } from './core/auth/auth.model';
import { AUTH_STORAGE_KEY } from './core/auth/auth.service';
import { API_BASE_URL } from './core/config/api.config';
import { WorkOrdersService } from './features/work-orders/data-access/work-order.service';

describe('appConfig', () => {
  const session: AuthSession = {
    token: 'mock-token.1.1700000000000',
    user: {
      id: '1',
      username: 'admin',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    },
  };

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

    TestBed.inject(WorkOrdersService).getAll().subscribe();

    const request = httpMock.expectOne(`${API_BASE_URL}/work-orders`);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${session.token}`);
    request.flush([]);
    httpMock.verify();
  });

  it('sends requests from real services without Authorization when there is no session', () => {
    expect.assertions(1);
    const httpMock = configure();

    TestBed.inject(WorkOrdersService).getAll().subscribe();

    const request = httpMock.expectOne(`${API_BASE_URL}/work-orders`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
    httpMock.verify();
  });
});
