import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { MessageService } from '../services/message.service';

export interface AppHttpError {
  status: number;
  message: string;
  originalError: HttpErrorResponse;
}

export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messageService = inject(MessageService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const appError = mapHttpError(error);

        messageService.showError(appError.message);

        return throwError(() => appError);
      }

      messageService.showError('Ocurrió un error inesperado.');

      return throwError(() => error);
    })
  );
};

function mapHttpError(error: HttpErrorResponse): AppHttpError {
  let message = getBackendMessage(error);
  console.log(error, 'mensaje', message)
  if (!message) {
    if (error.status === 0) {
      message = 'No se pudo conectar con el servidor.';
    } else if (error.status === 400) {
      message = 'La solicitud no es válida.';
    } else if (error.status === 401) {
      message = 'No estás autorizado.';
    } else if (error.status === 403) {
      message = 'No tenés permisos para realizar esta acción.';
    } else if (error.status === 404) {
      message = 'El recurso solicitado no existe.';
    } else if (error.status >= 500) {
      message = 'Error del servidor. Intentá nuevamente más tarde.';
    } else {
      message = 'Ocurrió un error inesperado.';
    }
  }

  return {
    status: error.status,
    message,
    originalError: error,
  };
}

function getBackendMessage(error: HttpErrorResponse): string | null {
  const backendError = error.error;
  console.log(backendError)
  if (
    backendError &&
    typeof backendError === 'object' &&
    typeof backendError.message === 'string'
  ) {
    return backendError.message;
  }

  return null;
}
