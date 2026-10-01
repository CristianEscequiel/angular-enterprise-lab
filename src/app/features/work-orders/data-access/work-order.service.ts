import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, Observable, of, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import {
  ClosedWorkOrderStatus,
  isClosedStatus,
  isWorkOrderClosingNote,
  PaginatedResponse,
  WorkOrder,
  WorkOrderClosingNote,
  WorkOrderCreateRequest,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderTaker,
} from '../models/work-order.model';

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

// El comentario de cierre no cumple la regla (50 a 500 caracteres, sin contar los bordes), falta el
// autor o el estado de destino no es un estado cerrado. No sale ningún request.
export class InvalidClosingNoteError extends Error {
  constructor(message = 'El comentario de cierre no es válido.') {
    super(message);
    this.name = 'InvalidClosingNoteError';
  }
}

export type WorkOrderStateErrorReason = 'not-pending' | 'not-in-progress' | 'taken-by-other';

// La orden no está en el estado que la operación exige. Lleva el dueño actual (`takenBy`) para que la
// pantalla pueda decir quién la ejecuta: la lista o la página que la mostraba puede estar
// desactualizada (otro técnico la tomó, la cerraron o la liberaron mientras tanto).
export class WorkOrderStateError extends Error {
  constructor(
    readonly reason: WorkOrderStateErrorReason,
    readonly takenBy: WorkOrderTaker | null = null,
    // Estado real de la orden cuando falló la operación: distingue "ya la cerraron" de "la ejecuta otro".
    readonly status: WorkOrderStatus | null = null,
  ) {
    super(WorkOrderStateError.messageFor(reason, takenBy, status));
    this.name = 'WorkOrderStateError';
  }

  private static messageFor(
    reason: WorkOrderStateErrorReason,
    takenBy: WorkOrderTaker | null,
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
  // '/api/work-orders'
  private readonly apiUrl = `${API_BASE_URL}/work-orders`;

  getAll(): Observable<WorkOrder[]> {
    return this.http.get<WorkOrder[]>(this.apiUrl);
  }

  getPaginated(page: number, limit: number): Observable<PaginatedResponse<WorkOrder>> {
    const params = {
      _page: page.toString(),
      _per_page: limit.toString(),
    };
    return this.http.get<PaginatedResponse<WorkOrder>>(this.apiUrl, { params });
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

  create(workOrder: WorkOrderCreateRequest): Observable<WorkOrder> {
    const payload = {
      ...workOrder,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    return this.http.post<WorkOrder>(this.apiUrl, payload);
  }

  update(id: string, workOrder: WorkOrder): Observable<WorkOrder> {
    return this.http.put<WorkOrder>(`${this.apiUrl}/${id}`, workOrder);
  }

  // Las tres transiciones de estado (spec 013d). Todas leen la orden FRESCA antes de escribir (la
  // pantalla puede estar desactualizada) y, si no se cumple la condición, no sale ningún `PATCH`.
  // Un error de red o 5xx en esa lectura se propaga tal cual: nunca se interpreta como "no cumple".
  // La lectura y la escritura no son atómicas (dos usuarios simultáneos pueden colarse en la
  // ventana): es aceptable en el mock y el backend real lo cierra con una actualización condicional.

  // Tomar una orden pendiente: pasa a `in-progress` a nombre de `taker`. Tras escribir vuelve a
  // leer: si otro escribió en medio, el dueño ya no es `taker` y se avisa en vez de creerse dueño.
  take(id: string, taker: WorkOrderTaker): Observable<WorkOrder> {
    return this.readFresh(id).pipe(
      switchMap((order) =>
        order.status === 'pending'
          ? this.http.patch<WorkOrder>(this.url(id), { status: 'in-progress', takenBy: taker })
          : throwError(
              () => new WorkOrderStateError('not-pending', order.takenBy ?? null, order.status),
            ),
      ),
      switchMap(() => this.readFresh(id)),
      switchMap((order) =>
        order.takenBy?.id === taker.id
          ? of(order)
          : throwError(
              () => new WorkOrderStateError('taken-by-other', order.takenBy ?? null, order.status),
            ),
      ),
    );
  }

  // Cerrar (completar o cancelar) una orden en progreso. Solo la cierra quien la tomó, y con un
  // comentario válido: sin él no se lee ni se escribe nada.
  close(
    id: string,
    outcome: ClosedWorkOrderStatus,
    note: WorkOrderClosingNote,
  ): Observable<WorkOrder> {
    if (!isClosedStatus(outcome) || !isWorkOrderClosingNote(note)) {
      return throwError(() => new InvalidClosingNoteError());
    }

    const closingNote: WorkOrderClosingNote = { ...note, comment: note.comment.trim() };

    return this.readFresh(id).pipe(
      switchMap((order) => {
        if (order.status !== 'in-progress') {
          return throwError(
            () => new WorkOrderStateError('not-in-progress', order.takenBy ?? null, order.status),
          );
        }

        if (order.takenBy?.id !== note.authorId) {
          return throwError(
            () => new WorkOrderStateError('taken-by-other', order.takenBy ?? null, order.status),
          );
        }

        return this.http.patch<WorkOrder>(this.url(id), { status: outcome, closingNote });
      }),
    );
  }

  // Liberar una orden en progreso: vuelve a `pending` sin dueño (`takenBy: null`). Quién puede
  // hacerlo lo decide la política (`canReleaseWorkOrder`); acá solo se exige el estado.
  release(id: string): Observable<WorkOrder> {
    return this.readFresh(id).pipe(
      switchMap((order) =>
        order.status === 'in-progress'
          ? this.http.patch<WorkOrder>(this.url(id), { status: 'pending', takenBy: null })
          : throwError(
              () => new WorkOrderStateError('not-in-progress', order.takenBy ?? null, order.status),
            ),
      ),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  private url(id: string): string {
    return `${this.apiUrl}/${encodeURIComponent(id)}`;
  }

  private readFresh(id: string): Observable<WorkOrder> {
    return this.http.get<WorkOrder>(this.url(id));
  }

  search(criteria: WorkOrdersCriteria): Observable<PaginatedResponse<WorkOrder>> {
    let params = new HttpParams()
      .set('_page', criteria.page.toString())
      .set('_per_page', criteria.perPage.toString());

    if (criteria.title) params = params.set('title:contains', criteria.title);
    if (criteria.status) params = params.set('status', criteria.status);
    if (criteria.priority) params = params.set('priority', criteria.priority);

    return this.http.get<PaginatedResponse<WorkOrder>>(this.apiUrl, { params }).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error buscando ordenes:', error);

        return throwError(() => new Error('No se pudieron buscar las órdenes de trabajo'));
      }),
    );
  }
}
