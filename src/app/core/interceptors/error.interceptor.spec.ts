import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { MessageService } from '../services/message.service';
import { AppHttpError, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  const url = `${API_BASE_URL}/work-orders`;

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let messageService: MessageService;

  function configure(...extraInterceptors: HttpInterceptorFn[]): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor, ...extraInterceptors])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    messageService = TestBed.inject(MessageService);
  }

  // Devuelve el error que recibe el suscriptor (ya mapeado por el interceptor).
  function captureError(): { current: unknown } {
    const captured: { current: unknown } = { current: undefined };
    http.get(url).subscribe({ error: (error: unknown) => (captured.current = error) });
    return captured;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('successful responses', () => {
    it('passes the response through without showing any message', () => {
      expect.assertions(2);
      configure();
      let body: unknown;

      http.get(url).subscribe((response) => (body = response));
      httpMock.expectOne(url).flush({ ok: true });

      expect(body).toEqual({ ok: true });
      expect(messageService.message()).toBeNull();
    });
  });

  describe('HTTP errors', () => {
    it('uses the message sent by the backend, whatever the status', () => {
      expect.assertions(3);
      configure();
      const captured = captureError();

      httpMock
        .expectOne(url)
        .flush(
          { code: 'NOT_FOUND', message: 'No se encontró la orden 7' },
          { status: 404, statusText: 'Not Found' },
        );

      expect((captured.current as AppHttpError).message).toBe('No se encontró la orden 7');
      expect(messageService.message()).toEqual({
        variant: 'error',
        title: 'Error',
        message: 'No se encontró la orden 7',
      });
      expect((captured.current as AppHttpError).status).toBe(404);
    });

    it('rethrows an AppHttpError that keeps the original HttpErrorResponse', () => {
      expect.assertions(3);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).flush('boom', { status: 500, statusText: 'Server Error' });

      const appError = captured.current as AppHttpError;
      expect(appError.status).toBe(500);
      expect(appError.originalError).toBeInstanceOf(HttpErrorResponse);
      expect(appError.originalError.status).toBe(500);
    });

    it.each([
      [400, 'Bad Request', 'La solicitud no es válida.'],
      [401, 'Unauthorized', 'No estás autorizado.'],
      [403, 'Forbidden', 'No tenés permisos para realizar esta acción.'],
      [404, 'Not Found', 'El recurso solicitado no existe.'],
      [500, 'Server Error', 'Error del servidor. Intentá nuevamente más tarde.'],
      [502, 'Bad Gateway', 'Error del servidor. Intentá nuevamente más tarde.'],
      [503, 'Service Unavailable', 'Error del servidor. Intentá nuevamente más tarde.'],
      [418, "I'm a teapot", 'Ocurrió un error inesperado.'],
    ])('maps status %i without a backend message to a default message', (status, text, message) => {
      expect.assertions(3);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).flush(null, { status, statusText: text });

      expect((captured.current as AppHttpError).message).toBe(message);
      expect((captured.current as AppHttpError).status).toBe(status);
      expect(messageService.message()).toEqual({ variant: 'error', title: 'Error', message });
    });

    it('reports a connection failure (status 0) as a server connection problem', () => {
      expect.assertions(3);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).error(new ProgressEvent('error'));

      expect((captured.current as AppHttpError).status).toBe(0);
      expect((captured.current as AppHttpError).message).toBe(
        'No se pudo conectar con el servidor.',
      );
      expect(messageService.message()?.message).toBe('No se pudo conectar con el servidor.');
    });

    it.each([
      ['a plain string body', 'Internal failure'],
      ['a body without message', { code: 'X', detail: 'x' }],
      ['a body whose message is not a string', { code: 'X', message: 42 }],
      ['a body without code', { message: 'sin código' }],
      ['a null body', null],
    ])('ignores %s and falls back to the status message', (_label, body) => {
      expect.assertions(2);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).flush(body, { status: 400, statusText: 'Bad Request' });

      expect((captured.current as AppHttpError).message).toBe('La solicitud no es válida.');
      expect(messageService.message()?.message).toBe('La solicitud no es válida.');
    });

    it('falls back to the status message when the backend message is an empty string', () => {
      expect.assertions(1);
      configure();
      const captured = captureError();

      httpMock
        .expectOne(url)
        .flush({ code: 'NOT_FOUND', message: '' }, { status: 404, statusText: 'Not Found' });

      // '' es falsy: se cae al mensaje por defecto del status en lugar de mostrar un toast vacío.
      expect((captured.current as AppHttpError).message).toBe('El recurso solicitado no existe.');
    });
  });

  describe('API error contract', () => {
    it('exposes the business code and details to the caller', () => {
      expect.assertions(3);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).flush(
        {
          code: 'WORK_ORDER_NOT_PENDING',
          message: 'La orden 7 no está pendiente',
          details: { status: 'in-progress', takenById: '5' },
        },
        { status: 409, statusText: 'Conflict' },
      );

      const appError = captured.current as AppHttpError;
      expect(appError.code).toBe('WORK_ORDER_NOT_PENDING');
      expect(appError.details).toEqual({ status: 'in-progress', takenById: '5' });
      expect(appError.message).toBe('La orden 7 no está pendiente');
    });

    it('leaves code and details null when the body is not an API error', () => {
      expect.assertions(2);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });

      expect((captured.current as AppHttpError).code).toBeNull();
      expect((captured.current as AppHttpError).details).toBeNull();
    });

    it('does not show a toast for a 409: the page shows its own message', () => {
      expect.assertions(2);
      configure();
      const captured = captureError();

      httpMock
        .expectOne(url)
        .flush(
          { code: 'MACHINE_HAS_PARTS', message: 'La máquina tiene partes' },
          { status: 409, statusText: 'Conflict' },
        );

      expect((captured.current as AppHttpError).status).toBe(409);
      expect(messageService.message()).toBeNull();
    });

    it('does not show a toast for a 400 with field details', () => {
      expect.assertions(2);
      configure();
      const captured = captureError();

      httpMock.expectOne(url).flush(
        {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          details: { title: 'Debe tener entre 3 y 150 caracteres' },
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect((captured.current as AppHttpError).details).toEqual({
        title: 'Debe tener entre 3 y 150 caracteres',
      });
      expect(messageService.message()).toBeNull();
    });

    it('shows a toast for a 400 without details', () => {
      expect.assertions(1);
      configure();
      captureError();

      httpMock
        .expectOne(url)
        .flush(
          { code: 'BAD_REQUEST', message: 'Cuerpo inválido' },
          { status: 400, statusText: 'Bad Request' },
        );

      expect(messageService.message()?.message).toBe('Cuerpo inválido');
    });
  });

  describe('401 with an open session', () => {
    const session = {
      token: 'jwt',
      user: {
        id: '1',
        username: 'admin',
        displayName: 'Administrador',
        email: 'admin@enterprise-lab.dev',
        role: 'administrador',
      },
    };

    function configureWithSession(): { router: Router; auth: AuthService } {
      localStorage.setItem('auth.session', JSON.stringify(session));
      configure();
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      Object.defineProperty(router, 'url', { get: () => '/work-orders/7' });
      return { router, auth: TestBed.inject(AuthService) };
    }

    it('closes the session and redirects to /login keeping the return URL', () => {
      expect.assertions(4);
      const { router, auth } = configureWithSession();
      captureError();

      httpMock
        .expectOne(url)
        .flush(
          { code: 'UNAUTHORIZED', message: 'Token vencido' },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem('auth.session')).toBeNull();
      expect(router.navigateByUrl).toHaveBeenCalledWith(auth.loginUrlFor('/work-orders/7'));
      expect(messageService.message()?.message).toBe('Tu sesión expiró. Iniciá sesión nuevamente.');
    });

    it.each(['/auth/login', '/auth/me'])('leaves the session alone for a 401 on %s', (path) => {
      expect.assertions(3);
      const { router, auth } = configureWithSession();
      http.get(`${API_BASE_URL}${path}`).subscribe({ error: () => undefined });

      httpMock
        .expectOne(`${API_BASE_URL}${path}`)
        .flush({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401, statusText: 'Unauthorized' });

      expect(auth.isAuthenticated()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(messageService.message()?.message).toBe('x');
    });

    it('does not touch the session for a 401 from a URL outside the API', () => {
      expect.assertions(2);
      const { router, auth } = configureWithSession();
      http.get('https://example.com/data').subscribe({ error: () => undefined });

      httpMock
        .expectOne('https://example.com/data')
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(auth.isAuthenticated()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('keeps the session on a 403', () => {
      expect.assertions(2);
      const { auth } = configureWithSession();
      captureError();

      httpMock.expectOne(url).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(auth.isAuthenticated()).toBe(true);
      expect(messageService.message()?.message).toBe(
        'No tenés permisos para realizar esta acción.',
      );
    });
  });

  describe('non-HTTP errors', () => {
    it('shows a generic message and rethrows the original error untouched', () => {
      expect.assertions(3);
      const original = new Error('fallo de otro interceptor');
      configure(() => throwError(() => original));
      const captured = captureError();

      expect(captured.current).toBe(original);
      expect(messageService.message()).toEqual({
        variant: 'error',
        title: 'Error',
        message: 'Ocurrió un error inesperado.',
      });
      expect(captured.current).not.toHaveProperty('originalError');
    });
  });
});
