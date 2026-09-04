
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { PaginatedResponse, WorkOrder, WorkOrderCreateRequest } from '../models/work-order.model';

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
    return this.http.get<WorkOrder>(`${this.apiUrl}/${id}`);
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
  searchByName(title: string): Observable<PaginatedResponse<WorkOrder>> {
    return this.http.get<PaginatedResponse<WorkOrder>>(this.apiUrl, {
      params: {
        _page: '1',
        _per_page: '10',
        'title:contains': title
      }
    });
  }
}
