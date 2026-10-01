import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';

import { errorCode, errorDetails, errorMessage, errorStatus } from '@core/api/api-error';
import { API_BASE_URL } from '@core/config/api.config';
import {
  ClosedWorkOrderStatus,
  isClosedStatus,
  isValidClosingComment,
  isWorkOrderStatus,
  PaginatedResponse,
  WorkOrder,
  WorkOrderCreateRequest,
  WorkOrderUpdateRequest,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderTaker,
} from '../models/work-order.model';

// Tamaño máximo de página que acepta la API (`size` de 1 a 100).
export const MAX_PAGE_SIZE = 100;

export interface WorkOrdersCriteria {
  title: string;
  status: WorkOrderStatus | '';
  priority: WorkOrderPriority | '';
  page: number;
  perPage: number;
}

export type WorkOrderLoadErrorKind = 'not-found' | 'connection';

export class WorkOrderLoadError extends Error {
  readonly kind: WorkOrderLoadErrorKind;

  constructor(kind: WorkOrderLoadErrorKind, message: string) {
    super(message);
    this.name = 'WorkOrderLoadError';
    this.kind = kind;
  }
}

// Códigos de `400` que dicen que la máquina o la parte elegida no sirve (`POST /work-orders`).
const MACHINE_REF_ERROR_CODES: readonly string[] = [
  'MACHINE_NOT_FOUND',
  'PART_NOT_FOUND',
  'PART_OTHER_MACHINE',
];

export class WorkOrderMachineRefError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkOrderMachineRefError';
  }
}

// `400 VALIDATION_ERROR`: un mensaje por campo (`title`, `description`, `priority`, …).
export class WorkOrderValidationError extends Error {
  constructor(readonly fieldErrors: Readonly<Record<string, string>>) {
    super('Los datos de la orden no son válidos.');
    this.name = 'WorkOrderValidationError';
  }
}

function fieldErrors(details: Record<string, unknown> | null): Record<string, string> {
  return Object.fromEntries(
    Object.entries(details ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
// El comentario de cierre no cumple la regla (50 a 500 caracteres, sin contar los bordes) o el estado
// de destino no es un estado cerrado. No sale ningún request.
export class InvalidClosingNoteError extends Error {
  constructor(message = 'El comentario de cierre no es válido.') {
    super(message);
    this.name = 'InvalidClosingNoteError';
  }
}

export type WorkOrderStateErrorReason = 'not-pending' | 'not-in-progress' | 'taken-by-other';

// Qué razón corresponde a cada `code` de `409` de las transiciones.
const STATE_ERROR_REASONS: Readonly<Record<string, WorkOrderStateErrorReason | undefined>> = {
  WORK_ORDER_NOT_PENDING: 'not-pending',
  WORK_ORDER_NOT_IN_PROGRESS: 'not-in-progress',
  WORK_ORDER_TAKEN_BY_OTHER: 'taken-by-other',
};

// Quién tiene la orden según el `409` (`details.takenById` y `details.takenByName`). No trae el
// instante de la toma: no hace falta para avisar quién la ejecuta.
export type WorkOrderOwner = Pick<WorkOrderTaker, 'id' | 'name'>;

// La orden no está en el estado que la operación exige. Lleva el dueño actual (`takenBy`) para que la
// pantalla pueda decir quién la ejecuta: la lista o la página que la mostraba puede estar
// desactualizada (otro técnico la tomó, la cerraron o la liberaron mientras tanto).
export class WorkOrderStateError extends Error {
  constructor(
    readonly reason: WorkOrderStateErrorReason,
    readonly takenBy: WorkOrderOwner | null = null,
    // Estado real de la orden cuando falló la operación: distingue "ya la cerraron" de "la ejecuta otro".
    readonly status: WorkOrderStatus | null = null,
  ) {
    super(WorkOrderStateError.messageFor(reason, takenBy, status));
    this.name = 'WorkOrderStateError';
  }

  private static messageFor(
    reason: WorkOrderStateErrorReason,
    takenBy: WorkOrderOwner | null,
    status: WorkOrderStatus | null,
  ): string {
    if (isClosedStatus(status)) {
      return 'La orden ya fue cerrada.';
    }

    if (takenBy && reason !== 'not-in-progress') {
      return `La orden está siendo ejecutada por ${takenBy.name}.`;
    }

    return reason === 'not-pending'
      ? 'La orden ya no está pendiente.'
      : 'La orden ya no está en progreso.';
  }
}

@Injectable({
  providedIn: 'root',
})
export class WorkOrdersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/work-orders`;

  getAll(): Observable<WorkOrder[]> {
    return this.http.get<WorkOrder[]>(this.apiUrl);
  }

  getById(id: string): Observable<WorkOrder> {
    return this.http.get<WorkOrder>(`${this.apiUrl}/${id}`).pipe(
      catchError((error: unknown) => {
        console.error('Error al buscar la orden:', error);

        const status = (error as { status?: number } | null)?.status;
        if (status === 404) {
          return throwError(
            () => new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.'),
          );
        }

        return throwError(
          () => new WorkOrderLoadError('connection', 'No se pudo conectar con el servidor.'),
        );
      }),
    );
  }

  // El servidor fija el estado inicial (`pending`), el `createdAt` y el `breadcrumb`: el cliente solo
  // manda lo que el usuario eligió. Los `400` de referencia y de validación se traducen a errores
  // tipados para que la página los muestre en su lugar.
  create(workOrder: WorkOrderCreateRequest): Observable<WorkOrder> {
    return this.http
      .post<WorkOrder>(this.apiUrl, workOrder)
      .pipe(catchError((error: unknown) => throwError(() => this.translateWriteError(error))));
  }

  // Solo título, descripción y prioridad: el tipo y la máquina no cambian.
  update(id: string, changes: WorkOrderUpdateRequest): Observable<WorkOrder> {
    const body: WorkOrderUpdateRequest = {
      title: changes.title,
      description: changes.description,
      priority: changes.priority,
    };

    return this.http
      .put<WorkOrder>(this.url(id), body)
      .pipe(catchError((error: unknown) => throwError(() => this.translateWriteError(error))));
  }

  // Las tres transiciones de estado (spec 013d). La API las valida y las hace atómicas: el dueño sale
  // del token (nunca del cuerpo) y un conflicto responde `409` con el estado real y, si hay dueño,
  // quién es. Acá solo se traduce ese `409` a `WorkOrderStateError`; no se lee la orden antes.

  // Tomar una orden pendiente: pasa a `in-progress` a nombre del usuario del token.
  take(id: string): Observable<WorkOrder> {
    return this.http
      .post<WorkOrder>(`${this.url(id)}/take`, null)
      .pipe(catchError((error: unknown) => throwError(() => this.translateTransitionError(error))));
  }

  // Cerrar una orden propia con el resultado y un comentario de 50 a 500 caracteres. Con un resultado
  // o un comentario que no cumplen la regla no sale ningún request.
  close(id: string, outcome: ClosedWorkOrderStatus, comment: string): Observable<WorkOrder> {
    if (!isClosedStatus(outcome) || !isValidClosingComment(comment)) {
      return throwError(() => new InvalidClosingNoteError());
    }

    return this.http
      .post<WorkOrder>(`${this.url(id)}/close`, { outcome, comment: comment.trim() })
      .pipe(catchError((error: unknown) => throwError(() => this.translateTransitionError(error))));
  }

  // Devuelve una orden `in-progress` a `pending` sin dueño (administrador y team leader).
  release(id: string): Observable<WorkOrder> {
    return this.http
      .post<WorkOrder>(`${this.url(id)}/release`, null)
      .pipe(catchError((error: unknown) => throwError(() => this.translateTransitionError(error))));
  }

  private translateTransitionError(error: unknown): unknown {
    const reason = errorCode(error) === null ? null : STATE_ERROR_REASONS[errorCode(error) ?? ''];

    if (reason === undefined || reason === null) {
      return error;
    }

    const details = errorDetails(error);
    const status = details?.['status'];
    const takenById = details?.['takenById'];
    const takenByName = details?.['takenByName'];

    return new WorkOrderStateError(
      reason,
      typeof takenById === 'string' && typeof takenByName === 'string'
        ? { id: takenById, name: takenByName }
        : null,
      isWorkOrderStatus(status) ? status : null,
    );
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<void>(this.url(id))
      .pipe(catchError((error: unknown) => throwError(() => this.translateWriteError(error))));
  }

  // `404` → la orden ya no existe; `400` de referencia o de validación → errores tipados; el resto
  // (incluido `403`, que el interceptor ya avisó) se propaga tal cual.
  private translateWriteError(error: unknown): unknown {
    const code = errorCode(error);

    if (errorStatus(error) === 404) {
      return new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.');
    }

    if (code !== null && MACHINE_REF_ERROR_CODES.includes(code)) {
      return new WorkOrderMachineRefError(
        code,
        errorMessage(error, 'La máquina o la parte no es válida.'),
      );
    }

    if (code === 'VALIDATION_ERROR') {
      return new WorkOrderValidationError(fieldErrors(errorDetails(error)));
    }

    return error;
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  search(criteria: WorkOrdersCriteria): Observable<PaginatedResponse<WorkOrder>> {
    let params = new HttpParams()
      .set('page', criteria.page.toString())
      .set('size', criteria.perPage.toString());

    if (criteria.title) params = params.set('title', criteria.title);
    if (criteria.status) params = params.set('status', criteria.status);
    if (criteria.priority) params = params.set('priority', criteria.priority);

    return this.http.get<PaginatedResponse<WorkOrder>>(this.apiUrl, { params }).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error buscando ordenes:', error);

        return throwError(() => new Error('No se pudieron buscar las órdenes de trabajo'));
      }),
    );
  }

  // Primera página (hasta 100, el máximo de la API) de las órdenes en un estado. El tablero de turno
  // arma sus listas con esto; `totalItems` dice si hay más de las que se devuelven.
  listByStatus(status: WorkOrderStatus): Observable<PaginatedResponse<WorkOrder>> {
    return this.search({ title: '', status, priority: '', page: 1, perPage: MAX_PAGE_SIZE });
  }
}
