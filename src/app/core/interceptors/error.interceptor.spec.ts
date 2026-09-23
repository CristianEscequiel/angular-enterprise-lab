import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';

import { MessageService } from '../services/message.service';
import { AppHttpError, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  const url = '/work-orders';

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let messageService: MessageService;

  function configure(...extraInterceptors: HttpInterceptorFn[]): void {
    TestBed.configureTestingModule({
      providers: [
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
    // error.interceptor.ts tiene console.log de depuración: se silencian para no ensuciar la salida.
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
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
        .flush({ message: 'No se encontró la orden 7' }, { status: 404, statusText: 'Not Found' });

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
      ['a body without message', { detail: 'x' }],
      ['a body whose message is not a string', { message: 42 }],
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

      httpMock.expectOne(url).flush({ message: '' }, { status: 404, statusText: 'Not Found' });

      // '' es falsy: se cae al mensaje por defecto del status en lugar de mostrar un toast vacío.
      expect((captured.current as AppHttpError).message).toBe('El recurso solicitado no existe.');
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
