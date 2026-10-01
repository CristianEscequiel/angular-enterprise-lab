import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { readApiError } from '../api/api-error';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { MessageService } from '../services/message.service';

export interface AppHttpError {
  status: number;
  message: string;
  // Código de negocio de la API (`WORK_ORDER_NOT_PENDING`, …); null si el error no vino de ella.
  code: string | null;
  details: Record<string, unknown> | null;
  originalError: HttpErrorResponse;
}

// Los 401 de estos endpoints los resuelve quien los llama: el login muestra "credenciales
// incorrectas" y `AuthService.revalidate()` descarta la sesión guardada sin redirigir.
const AUTH_ENDPOINTS = [`${API_BASE_URL}/auth/login`, `${API_BASE_URL}/auth/me`];

export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messageService = inject(MessageService);
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const appError = mapHttpError(error);

        if (isExpiredSession(request.url, appError, authService)) {
          const returnUrl = router.url;

          authService.logout();
          messageService.showError('Tu sesión expiró. Iniciá sesión nuevamente.');
          void router.navigateByUrl(authService.loginUrlFor(returnUrl));
        } else if (!isHandledByCaller(appError)) {
          messageService.showError(appError.message);
        }

        return throwError(() => appError);
      }

      messageService.showError('Ocurrió un error inesperado.');

      return throwError(() => error);
    }),
  );
};

// Un 401 a la API con sesión abierta es un token vencido o inválido. Sin sesión no hay nada que
// cerrar (p. ej. el 401 llega de una petición que salió antes del logout).
function isExpiredSession(url: string, error: AppHttpError, authService: AuthService): boolean {
  return (
    error.status === 401 &&
    url.startsWith(API_BASE_URL) &&
    !AUTH_ENDPOINTS.includes(url) &&
    authService.isAuthenticated()
  );
}

// Un 409 y un 400 con detalle por campo los traduce el servicio a un error de dominio y la página
// muestra su propio mensaje: un toast además duplicaría el aviso.
function isHandledByCaller(error: AppHttpError): boolean {
  return error.status === 409 || (error.status === 400 && error.details !== null);
}

function mapHttpError(error: HttpErrorResponse): AppHttpError {
  const body = readApiError(error.error);
  const message = body?.message || defaultMessage(error.status);

  return {
    status: error.status,
    message,
    code: body?.code ?? null,
    details: body?.details ?? null,
    originalError: error,
  };
}

function defaultMessage(status: number): string {
  if (status === 0) {
    return 'No se pudo conectar con el servidor.';
  }
  if (status === 400) {
    return 'La solicitud no es válida.';
  }
  if (status === 401) {
    return 'No estás autorizado.';
  }
  if (status === 403) {
    return 'No tenés permisos para realizar esta acción.';
  }
  if (status === 404) {
    return 'El recurso solicitado no existe.';
  }
  if (status >= 500) {
    return 'Error del servidor. Intentá nuevamente más tarde.';
  }

  return 'Ocurrió un error inesperado.';
}
