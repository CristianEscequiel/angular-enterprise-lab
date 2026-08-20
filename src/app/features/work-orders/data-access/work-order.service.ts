import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { WorkOrder, WorkOrderCreateRequest } from '../models/work-order.model';

@Injectable({
  providedIn: 'root',
})
export class WorkOrdersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/work-orders';

  getAll(): Observable<WorkOrder[]> {
    return this.http.get<WorkOrder[]>(this.apiUrl);
  }

  getById(id: number): Observable<WorkOrder> {
    return this.http.get<WorkOrder>(`${this.apiUrl}/${id}`);
  }

  create(workOrder: WorkOrderCreateRequest): Observable<WorkOrder> {
    return this.http.post<WorkOrder>(this.apiUrl, workOrder);
  }

  update(id: number, workOrder: WorkOrder): Observable<WorkOrder> {
    return this.http.put<WorkOrder>(`${this.apiUrl}/${id}`, workOrder);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
