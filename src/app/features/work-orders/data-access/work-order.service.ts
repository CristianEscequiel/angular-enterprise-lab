import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { WorkOrder } from '../models/work-order.model';

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
}
