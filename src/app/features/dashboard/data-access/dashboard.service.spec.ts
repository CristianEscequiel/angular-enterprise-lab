import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '@core/config/api.config';
import { DashboardSummary, WorkloadItem } from '../models/dashboard.model';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  const summary: DashboardSummary = {
    period: { from: '2026-08-31', to: '2026-09-29' },
    byStatus: { pending: 12, 'in-progress': 9, completed: 9, cancelled: 2 },
    byPriority: { low: 10, medium: 12, high: 10 },
    byType: { preventivo: 10, correctivo: 12, 'pronto-intervencion': 10 },
    total: 32,
    open: 21,
    closedInPeriod: { completed: 3, cancelled: 1, total: 4 },
    averageResolutionMinutes: 150,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gets the summary with GET /dashboard/summary and no period (the API uses the last 30 days)', () => {
    expect.assertions(4);
    let result: DashboardSummary | undefined;
    service.getSummary().subscribe((value) => (result = value));

    const request = httpMock.expectOne(`${API_BASE_URL}/dashboard/summary`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush(summary);

    expect(result).toEqual(summary);
    expect(result?.closedInPeriod.total).toBe(4);
  });

  it('keeps a null average when no order was completed in the period', () => {
    let result: DashboardSummary | undefined;
    service.getSummary().subscribe((value) => (result = value));

    httpMock
      .expectOne(`${API_BASE_URL}/dashboard/summary`)
      .flush({ ...summary, averageResolutionMinutes: null });

    expect(result?.averageResolutionMinutes).toBeNull();
  });

  it('gets the workload with GET /dashboard/workload', () => {
    expect.assertions(3);
    const workload: WorkloadItem[] = [
      { takenById: '5', takenByName: 'Técnico Electricista Preventivo', inProgress: 5 },
    ];
    let result: WorkloadItem[] | undefined;
    service.getWorkload().subscribe((value) => (result = value));

    const request = httpMock.expectOne(`${API_BASE_URL}/dashboard/workload`);
    expect(request.request.method).toBe('GET');
    request.flush(workload);

    expect(result).toEqual(workload);
    expect(result?.[0]?.inProgress).toBe(5);
  });

  it('propagates a 403 on the workload untouched', () => {
    expect.assertions(1);
    let error: unknown;
    service.getWorkload().subscribe({ error: (e: unknown) => (error = e) });

    httpMock
      .expectOne(`${API_BASE_URL}/dashboard/workload`)
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(error).toMatchObject({ status: 403 });
  });
});
