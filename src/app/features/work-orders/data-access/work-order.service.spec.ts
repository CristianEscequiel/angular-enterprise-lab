import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PaginatedResponse, WorkOrder } from '../models/work-order.model';
import { WorkOrdersService } from './work-order.service';

describe('WorkOrdersService', () => {
  const apiUrl = 'http://localhost:3000/work-orders';
  let service: WorkOrdersService;
  let httpMock: HttpTestingController;

  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };
  const page: PaginatedResponse<WorkOrder> = {
    first: 1,
    prev: null,
    next: null,
    last: 1,
    pages: 1,
    items: 1,
    data: [order],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WorkOrdersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('searchByName sends _page, _per_page and title:contains to /work-orders', () => {
    let result: PaginatedResponse<WorkOrder> | undefined;
    service.searchByName('motor', '2', '10').subscribe((value) => (result = value));

    const request = httpMock.expectOne((req) => req.url === apiUrl);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('_page')).toBe('2');
    expect(request.request.params.get('_per_page')).toBe('10');
    expect(request.request.params.get('title:contains')).toBe('motor');
    request.flush(page);

    expect(result).toEqual(page);
  });

  it('searchByName maps HTTP failures to a friendly error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let error: Error | undefined;
    service.searchByName('motor', '1', '10').subscribe({ error: (err) => (error = err) });

    httpMock
      .expectOne((req) => req.url === apiUrl)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(error?.message).toBe('No se pudieron buscar las órdenes de trabajo');
  });

  it('delete issues DELETE /work-orders/:id', () => {
    let completed = false;
    service.delete('7').subscribe({ complete: () => (completed = true) });

    const request = httpMock.expectOne(`${apiUrl}/7`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    expect(completed).toBe(true);
  });
});
