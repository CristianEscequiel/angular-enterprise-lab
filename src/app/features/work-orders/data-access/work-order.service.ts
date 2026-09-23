import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';

import {
  PaginatedResponse,
  WorkOrder,
  WorkOrderCreateRequest,
  WorkOrderPriority,
  WorkOrderStatus,
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

@Injectable({
  providedIn: 'root',
})
export class WorkOrdersService {
  private readonly http = inject(HttpClient);
  // '/api/work-orders'
  private readonly apiUrl = 'http://localhost:3000/work-orders';

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

  updateStatus(id: string, status: WorkOrderStatus): Observable<WorkOrder> {
    return this.http.patch<WorkOrder>(`${this.apiUrl}/${id}`, { status });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
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
