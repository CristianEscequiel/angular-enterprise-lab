import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { LocalStorageService } from '../../../../core/services/localStorage.service';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { PaginatedResponse, WorkOrder } from '../../models/work-order.model';
import { WorkOrdersList } from './work-orders-list';

describe('WorkOrdersList search and pagination', () => {
  let fixture: ComponentFixture<WorkOrdersList>;
  let component: WorkOrdersList;

  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  function response(pages = 4, data: WorkOrder[] = [order]): PaginatedResponse<WorkOrder> {
    return { first: 1, prev: null, next: 2, last: pages, pages, items: pages * 10, data };
  }

  const service = {
    searchByName: vi.fn<(...args: string[]) => Observable<PaginatedResponse<WorkOrder>>>(),
    delete: vi.fn<(...args: string[]) => Observable<void>>(),
  };
  const storage = {
    get: vi.fn<(...args: string[]) => unknown>(),
    set: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    service.searchByName.mockReset().mockReturnValue(of(response()));
    service.delete.mockReset().mockReturnValue(of(undefined));
    storage.get.mockReset().mockReturnValue(null);
    storage.set.mockReset().mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [WorkOrdersList],
      providers: [
        provideRouter([]),
        { provide: WorkOrdersService, useValue: service },
        { provide: LocalStorageService, useValue: storage },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  function start(stored: unknown = null): void {
    storage.get.mockReturnValue(stored);
    fixture = TestBed.createComponent(WorkOrdersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function search(text: string): void {
    component.searchControl.setValue(text);
    vi.advanceTimersByTime(300);
  }

  it('restores input and page before issuing exactly one request', () => {
    start({ searchValue: ' motor ', page: 3 });
    expect(component.searchControl.value).toBe('motor');
    expect(component.currentPage()).toBe(3);
    expect(component.totalPages()).toBe(4);
    expect(service.searchByName).toHaveBeenCalledExactlyOnceWith('motor', '3', '10');
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', {
      searchValue: 'motor',
      page: 3,
    });
  });

  it.each([
    null,
    'bad data',
    { searchValue: 'motor', page: -1 },
    { searchValue: 123, page: 1 },
    { searchValue: 'motor', page: 1.5 },
  ])('falls back to a valid initial query for invalid stored state: %j', (stored) => {
    start(stored);
    expect(service.searchByName).toHaveBeenCalledExactlyOnceWith('', '1', '10');
  });

  it('debounces typing and resets the page when the filter changes', () => {
    start({ searchValue: 'motor', page: 3 });
    component.searchControl.setValue('bomba');
    vi.advanceTimersByTime(200);
    component.searchControl.setValue(' bombas ');
    vi.advanceTimersByTime(299);
    expect(service.searchByName).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(service.searchByName).toHaveBeenLastCalledWith('bombas', '1', '10');
    expect(component.currentPage()).toBe(1);
  });

  it('preserves the filter and updates metadata when changing page', () => {
    start({ searchValue: 'motor', page: 1 });
    service.searchByName.mockReturnValue(of(response(3)));
    component.goToPage(2);
    expect(service.searchByName).toHaveBeenLastCalledWith('motor', '2', '10');
    expect(component.currentPage()).toBe(2);
    expect(component.totalPages()).toBe(3);
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', {
      searchValue: 'motor',
      page: 2,
    });
  });

  it('does not reread storage or duplicate search subscriptions on reload', () => {
    start({ searchValue: 'motor', page: 2 });
    component.loadWorkOrders();
    component.loadWorkOrders();
    service.searchByName.mockClear();
    search('bomba');
    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(service.searchByName).toHaveBeenCalledExactlyOnceWith('bomba', '1', '10');
  });

  it('cancels a page request when a new search is applied', () => {
    start();
    const oldPage = new Subject<PaginatedResponse<WorkOrder>>();
    service.searchByName.mockReturnValueOnce(oldPage);
    component.goToPage(2);
    const latest = { ...order, id: '2', title: 'Nueva búsqueda' };
    service.searchByName.mockReturnValueOnce(of(response(1, [latest])));
    search('nueva');
    expect(oldPage.observed).toBe(false);
    oldPage.next(response(4, [order]));
    expect(component.workOrders()).toEqual([latest]);
    expect(component.currentPage()).toBe(1);
  });

  it('shows an error and keeps the query stream alive for retry and later searches', () => {
    start();
    service.searchByName.mockReturnValueOnce(throwError(() => new Error('offline')));
    search('motor');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las órdenes');
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
    component.loadWorkOrders();
    expect(component.error()).toBeNull();
    expect(service.searchByName).toHaveBeenLastCalledWith('motor', '1', '10');
    search('bomba');
    expect(service.searchByName).toHaveBeenLastCalledWith('bomba', '1', '10');
  });

  it('clamps a restored page that no longer exists and persists the correction', () => {
    service.searchByName
      .mockReturnValueOnce(of(response(2, [])))
      .mockReturnValueOnce(of(response(2)));
    start({ searchValue: 'motor', page: 5 });
    expect(service.searchByName.mock.calls).toEqual([
      ['motor', '5', '10'],
      ['motor', '2', '10'],
    ]);
    expect(component.currentPage()).toBe(2);
    expect(component.workOrders()).toEqual([order]);
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', {
      searchValue: 'motor',
      page: 2,
    });
  });

  it('reloads after deletion and goes back when the last page disappears', () => {
    start({ searchValue: 'motor', page: 4 });
    service.searchByName
      .mockReturnValueOnce(of(response(3, [])))
      .mockReturnValueOnce(of(response(3)));
    component.deleteWorkOrder('1');
    expect(service.delete).toHaveBeenCalledExactlyOnceWith('1');
    expect(service.searchByName).toHaveBeenLastCalledWith('motor', '3', '10');
    expect(component.currentPage()).toBe(3);
  });

  it('uses page 1 when the collection becomes empty', () => {
    service.searchByName.mockReturnValue(of(response(0, [])));
    start({ searchValue: 'motor', page: 2 });
    expect(component.currentPage()).toBe(1);
    expect(component.workOrders()).toEqual([]);
    expect(service.searchByName).toHaveBeenCalledTimes(2);
  });

  it('does not let responses read newer unsubmitted text when persisting a query', () => {
    start();
    const pending = new Subject<PaginatedResponse<WorkOrder>>();
    service.searchByName.mockReturnValueOnce(pending);
    component.goToPage(2);
    component.searchControl.setValue('pendiente de debounce');
    pending.next(response());
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', { searchValue: '', page: 2 });
  });

  it('applies pending text before pagination and skips the later duplicate debounce', () => {
    start();
    component.searchControl.setValue('motor');
    component.goToPage(2);
    vi.advanceTimersByTime(300);
    expect(service.searchByName.mock.calls).toEqual([
      ['', '1', '10'],
      ['motor', '1', '10'],
    ]);
  });

  it('compares typed text with the applied query after a click during debounce', () => {
    start();
    search('motor');
    component.searchControl.setValue('bomba');
    component.goToPage(2);
    search('motor');
    expect(service.searchByName).toHaveBeenLastCalledWith('motor', '1', '10');
  });

  it('updates the empty-search computed immediately and avoids whitespace-only queries', () => {
    start();
    expect(component.isSearchEmpty()).toBe(true);
    search('motor');
    expect(component.isSearchEmpty()).toBe(false);
    const count = service.searchByName.mock.calls.length;
    search(' motor ');
    expect(service.searchByName).toHaveBeenCalledTimes(count);
    component.searchControl.setValue('   ');
    expect(component.isSearchEmpty()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(service.searchByName).toHaveBeenLastCalledWith('', '1', '10');
  });

  it('keeps working if optional persistence cannot write', () => {
    storage.set.mockReturnValue(false);
    start();
    search('motor');
    expect(component.workOrders()).toEqual([order]);
    expect(component.error()).toBeNull();
  });

  it('cancels pending HTTP and debounce work when the page is destroyed', () => {
    start();
    const pending = new Subject<PaginatedResponse<WorkOrder>>();
    service.searchByName.mockReturnValueOnce(pending);
    component.goToPage(2);
    component.searchControl.setValue('motor');
    fixture.destroy();
    vi.advanceTimersByTime(300);
    expect(pending.observed).toBe(false);
    expect(service.searchByName).toHaveBeenCalledTimes(2);
  });
});
