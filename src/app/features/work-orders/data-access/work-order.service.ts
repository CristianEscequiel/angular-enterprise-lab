
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';

import { PaginatedResponse, WorkOrder, WorkOrderCreateRequest } from '../models/work-order.model';

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
          return throwError(() =>
            new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.'));
        }

        return throwError(() =>
          new WorkOrderLoadError('connection', 'No se pudo conectar con el servidor.'));
      })
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

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
  searchByName(title: string, page: string, per_page: string): Observable<PaginatedResponse<WorkOrder>> {
    return this.http.get<PaginatedResponse<WorkOrder>>(this.apiUrl, {
      params: {
        _page: page,
        _per_page: per_page,
        'title:contains': title
      }
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error buscando ordenes:', error);

        return throwError(() =>
          new Error('No se pudieron buscar las órdenes de trabajo'));
      })
    );
  }
}
