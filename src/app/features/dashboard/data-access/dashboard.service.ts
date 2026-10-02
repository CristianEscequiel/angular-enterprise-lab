import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import { DashboardSummary, WorkloadItem } from '../models/dashboard.model';

// Lecturas agregadas que la API calcula en el momento sobre las órdenes (sin caché).
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/dashboard`;

  // Sin `from` ni `to`: los 30 días que terminan hoy.
  getSummary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.apiUrl}/summary`);
  }

  // Solo administrador y team leader; el resto recibe `403`.
  getWorkload(): Observable<WorkloadItem[]> {
    return this.http.get<WorkloadItem[]>(`${this.apiUrl}/workload`);
  }
}
