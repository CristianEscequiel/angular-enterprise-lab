import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { LocalStorageService } from '@core/services/localStorage.service';
import { MessageService } from '@core/services/message.service';
import { WorkOrdersCriteria, WorkOrdersService } from '../../data-access/work-order.service';
import {
  PaginatedResponse,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../models/work-order.model';
import { WorkOrdersList } from './work-orders-list';

interface StoredQuery {
  searchValue: string;
  status: string;
  priority: string;
  page: number;
}

describe('WorkOrdersList search and pagination', () => {
  let fixture: ComponentFixture<WorkOrdersList>;
  let component: WorkOrdersList;

  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    type: 'correctivo',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  function response(pages = 4, data: WorkOrder[] = [order]): PaginatedResponse<WorkOrder> {
    return { first: 1, prev: null, next: 2, last: pages, pages, items: pages * 10, data };
  }

  function expected(over: Partial<WorkOrdersCriteria> = {}): WorkOrdersCriteria {
    return { title: '', status: '', priority: '', page: 1, perPage: 10, ...over };
  }

  function stored(over: Partial<StoredQuery> = {}): StoredQuery {
    return { searchValue: '', status: '', priority: '', page: 1, ...over };
  }

  const service = {
    search: vi.fn<(criteria: WorkOrdersCriteria) => Observable<PaginatedResponse<WorkOrder>>>(),
    updateStatus: vi.fn<(id: string, status: WorkOrderStatus) => Observable<WorkOrder>>(),
    delete: vi.fn<(...args: string[]) => Observable<void>>(),
  };
  const storage = {
    get: vi.fn<(...args: string[]) => unknown>(),
    set: vi.fn(),
  };

  const administrador: AuthUser = {
    id: '1',
    username: 'admin',
    displayName: 'Administrador',
    email: 'admin@enterprise-lab.dev',
    role: 'administrador',
  };
  const teamLeader: AuthUser = {
    ...administrador,
    id: '3',
    username: 'teamleader',
    role: 'team-leader-mantenimiento',
  };
  const produccion: AuthUser = {
    ...administrador,
    id: '4',
    username: 'produccion',
    role: 'personal-produccion',
  };
  const tecnico: AuthUser = {
    ...administrador,
    id: '2',
    username: 'tecnico',
    role: 'tecnico',
    legajo: '1001',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  // Por defecto el administrador: puede editar y eliminar, como antes de existir los roles.
  const currentUser = signal<AuthUser | null>(administrador);

  const calls = () => service.search.mock.calls.map(([criteria]) => criteria);

  beforeEach(async () => {
    vi.useFakeTimers();
    service.search.mockReset().mockReturnValue(of(response()));
    service.updateStatus.mockReset();
    service.delete.mockReset().mockReturnValue(of(undefined));
    storage.get.mockReset().mockReturnValue(null);
    storage.set.mockReset().mockReturnValue(true);
    currentUser.set(administrador);

    await TestBed.configureTestingModule({
      imports: [WorkOrdersList],
      providers: [
        provideRouter([]),
        { provide: WorkOrdersService, useValue: service },
        { provide: LocalStorageService, useValue: storage },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  function start(storedQuery: unknown = null): void {
    storage.get.mockReturnValue(storedQuery);
    fixture = TestBed.createComponent(WorkOrdersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function search(text: string): void {
    component.searchControl.setValue(text);
    vi.advanceTimersByTime(300);
  }

  function choose(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  }

  function inlineSelects(): HTMLSelectElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody select'));
  }

  function rowAt(index: number): HTMLTableRowElement {
    const row = rows()[index];
    if (!row) throw new Error(`No hay fila ${index}`);
    return row;
  }

  function selectAt(index: number): HTMLSelectElement {
    const select = inlineSelects()[index];
    if (!select) throw new Error(`No hay select en la fila ${index}`);
    return select;
  }

  function rowBadges(row: HTMLTableRowElement): { priority: HTMLElement; status: HTMLElement } {
    const [priority, status] = Array.from(row.querySelectorAll<HTMLElement>('app-badge .badge'));
    if (!priority || !status) throw new Error('La fila no tiene badges de prioridad y estado');
    return { priority, status };
  }

  it('restores input and page before issuing exactly one request', () => {
    start({ searchValue: ' motor ', page: 3 });
    expect(component.searchControl.value).toBe('motor');
    expect(component.currentPage()).toBe(3);
    expect(component.totalPages()).toBe(4);
    expect(service.search).toHaveBeenCalledExactlyOnceWith(expected({ title: 'motor', page: 3 }));
    expect(storage.set).toHaveBeenLastCalledWith(
      'workOrdersSearch',
      stored({ searchValue: 'motor', page: 3 }),
    );
  });

  it.each([
    null,
    'bad data',
    { searchValue: 'motor', page: -1 },
    { searchValue: 123, page: 1 },
    { searchValue: 'motor', page: 1.5 },
  ])('falls back to a valid initial query for invalid stored state: %j', (storedQuery) => {
    start(storedQuery);
    expect(service.search).toHaveBeenCalledExactlyOnceWith(expected());
  });

  it('debounces typing and resets the page when the filter changes', () => {
    start({ searchValue: 'motor', page: 3 });
    component.searchControl.setValue('bomba');
    vi.advanceTimersByTime(200);
    component.searchControl.setValue(' bombas ');
    vi.advanceTimersByTime(299);
    expect(service.search).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(service.search).toHaveBeenLastCalledWith(expected({ title: 'bombas' }));
    expect(component.currentPage()).toBe(1);
  });

  it('preserves the filter and updates metadata when changing page', () => {
    start({ searchValue: 'motor', page: 1 });
    service.search.mockReturnValue(of(response(3)));
    component.goToPage(2);
    expect(service.search).toHaveBeenLastCalledWith(expected({ title: 'motor', page: 2 }));
    expect(component.currentPage()).toBe(2);
    expect(component.totalPages()).toBe(3);
    expect(storage.set).toHaveBeenLastCalledWith(
      'workOrdersSearch',
      stored({ searchValue: 'motor', page: 2 }),
    );
  });

  it('does not reread storage or duplicate search subscriptions on reload', () => {
    start({ searchValue: 'motor', page: 2 });
    component.loadWorkOrders();
    component.loadWorkOrders();
    service.search.mockClear();
    search('bomba');
    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(service.search).toHaveBeenCalledExactlyOnceWith(expected({ title: 'bomba' }));
  });

  it('cancels a page request when a new search is applied', () => {
    start();
    const oldPage = new Subject<PaginatedResponse<WorkOrder>>();
    service.search.mockReturnValueOnce(oldPage);
    component.goToPage(2);
    const latest = { ...order, id: '2', title: 'Nueva búsqueda' };
    service.search.mockReturnValueOnce(of(response(1, [latest])));
    search('nueva');
    expect(oldPage.observed).toBe(false);
    oldPage.next(response(4, [order]));
    expect(component.workOrders()).toEqual([latest]);
    expect(component.currentPage()).toBe(1);
  });

  it('shows an error and keeps the query stream alive for retry and later searches', () => {
    start();
    service.search.mockReturnValueOnce(throwError(() => new Error('offline')));
    search('motor');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las órdenes');
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
    component.loadWorkOrders();
    expect(component.error()).toBeNull();
    expect(service.search).toHaveBeenLastCalledWith(expected({ title: 'motor' }));
    search('bomba');
    expect(service.search).toHaveBeenLastCalledWith(expected({ title: 'bomba' }));
  });

  it('recovers after an HTTP error: a later search resolves and renders results', () => {
    expect.assertions(5);
    start();
    service.search.mockReturnValueOnce(throwError(() => new Error('offline')));
    search('motor');
    expect(component.error()).not.toBeNull();

    const recovered = { ...order, id: '4', title: 'Bomba reparada' };
    service.search.mockReturnValueOnce(of(response(1, [recovered])));
    search('bomba');

    expect(component.error()).toBeNull();
    expect(component.workOrders()).toEqual([recovered]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Bomba reparada');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('clamps a restored page that no longer exists and persists the correction', () => {
    service.search.mockReturnValueOnce(of(response(2, []))).mockReturnValueOnce(of(response(2)));
    start({ searchValue: 'motor', page: 5 });
    expect(calls()).toEqual([
      expected({ title: 'motor', page: 5 }),
      expected({ title: 'motor', page: 2 }),
    ]);
    expect(component.currentPage()).toBe(2);
    expect(component.workOrders()).toEqual([order]);
    expect(storage.set).toHaveBeenLastCalledWith(
      'workOrdersSearch',
      stored({ searchValue: 'motor', page: 2 }),
    );
  });

  it('reloads after deletion and goes back when the last page disappears', () => {
    start({ searchValue: 'motor', page: 4 });
    service.search.mockReturnValueOnce(of(response(3, []))).mockReturnValueOnce(of(response(3)));
    component.deleteWorkOrder('1');
    expect(service.delete).toHaveBeenCalledExactlyOnceWith('1');
    expect(service.search).toHaveBeenLastCalledWith(expected({ title: 'motor', page: 3 }));
    expect(component.currentPage()).toBe(3);
  });

  it('does not carry over the previous order id when the delete modal is reopened for a different order', () => {
    start();
    expect(component.workOrderDeleted()).toBe('');

    component.openDeleteModal('A');
    expect(component.workOrderDeleted()).toBe('A');

    // Cerrado sin confirmar (Cancelar/Escape/click en el overlay).
    component.deleteModalOpen.set(false);

    component.openDeleteModal('B');
    expect(component.workOrderDeleted()).toBe('B');
  });

  it('uses page 1 when the collection becomes empty', () => {
    service.search.mockReturnValue(of(response(0, [])));
    start({ searchValue: 'motor', page: 2 });
    expect(component.currentPage()).toBe(1);
    expect(component.workOrders()).toEqual([]);
    expect(service.search).toHaveBeenCalledTimes(2);
  });

  it('gives each row a distinct accessible name for its action buttons', () => {
    expect.assertions(3);
    const other = { ...order, id: '2', title: 'Cambiar filtro hidráulico' };
    service.search.mockReturnValueOnce(of(response(1, [order, other])));
    start();
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('tbody button'),
    );
    const labels = buttons.map((button) => button.getAttribute('aria-label'));

    expect(labels).toContain('Eliminar Revisar motor');
    expect(labels).toContain('Eliminar Cambiar filtro hidráulico');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('does not let responses read newer unsubmitted text when persisting a query', () => {
    start();
    const pending = new Subject<PaginatedResponse<WorkOrder>>();
    service.search.mockReturnValueOnce(pending);
    component.goToPage(2);
    component.searchControl.setValue('pendiente de debounce');
    pending.next(response());
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', stored({ page: 2 }));
  });

  it('applies pending text before pagination and skips the later duplicate debounce', () => {
    start();
    component.searchControl.setValue('motor');
    component.goToPage(2);
    vi.advanceTimersByTime(300);
    expect(calls()).toEqual([expected(), expected({ title: 'motor' })]);
  });

  it('compares typed text with the applied query after a click during debounce', () => {
    start();
    search('motor');
    component.searchControl.setValue('bomba');
    component.goToPage(2);
    search('motor');
    expect(service.search).toHaveBeenLastCalledWith(expected({ title: 'motor' }));
  });

  it('updates the empty-search computed immediately and avoids whitespace-only queries', () => {
    start();
    expect(component.isSearchEmpty()).toBe(true);
    search('motor');
    expect(component.isSearchEmpty()).toBe(false);
    const count = service.search.mock.calls.length;
    search(' motor ');
    expect(service.search).toHaveBeenCalledTimes(count);
    component.searchControl.setValue('   ');
    expect(component.isSearchEmpty()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(service.search).toHaveBeenLastCalledWith(expected());
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
    service.search.mockReturnValueOnce(pending);
    component.goToPage(2);
    component.searchControl.setValue('motor');
    fixture.destroy();
    vi.advanceTimersByTime(300);
    expect(pending.observed).toBe(false);
    expect(service.search).toHaveBeenCalledTimes(2);
  });

  it('after searching and deleting the only item on page 2, goes to page 1 and never renders the empty state', () => {
    expect.assertions(9);
    const firstPageOrder = { ...order, id: '3', title: 'X primera' };
    const secondPageOrder = { ...order, id: '2', title: 'X segunda' };
    start();
    service.search.mockReturnValueOnce(of(response(2, [firstPageOrder])));
    search('X');
    service.search.mockReturnValueOnce(of(response(2, [secondPageOrder])));
    component.goToPage(2);

    // Tras eliminar queda una sola página: la 2 vuelve vacía y el re-pedido a la 1 sigue en vuelo.
    const pageOne = new Subject<PaginatedResponse<WorkOrder>>();
    service.search.mockReturnValueOnce(of(response(1, []))).mockReturnValueOnce(pageOne);
    component.deleteWorkOrder('2');

    expect(calls()).toEqual([
      expected(),
      expected({ title: 'X' }),
      expected({ title: 'X', page: 2 }),
      expected({ title: 'X', page: 2 }),
      expected({ title: 'X' }),
    ]);
    expect(component.currentPage()).toBe(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Sin órdenes');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);

    pageOne.next(response(1, [firstPageOrder]));
    fixture.detectChanges();
    expect(component.workOrders()).toEqual([firstPageOrder]);
    expect(component.currentPage()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('X primera');
    expect(fixture.nativeElement.textContent).not.toContain('Sin órdenes');
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', stored({ searchValue: 'X' }));
  });

  it('two overlapping searches: only the latest request resolves even if the older one answers last', () => {
    expect.assertions(7);
    const latest = { ...order, id: '2', title: 'ab resultado' };
    const stale = { ...order, id: '3', title: 'a resultado' };
    start();
    const older = new Subject<PaginatedResponse<WorkOrder>>();
    const newer = new Subject<PaginatedResponse<WorkOrder>>();
    service.search.mockReturnValueOnce(older);
    search('a');
    service.search.mockReturnValueOnce(newer);
    search('ab');

    expect(calls().slice(-2)).toEqual([expected({ title: 'a' }), expected({ title: 'ab' })]);
    expect(older.observed).toBe(false);
    expect(newer.observed).toBe(true);

    newer.next(response(1, [latest]));
    older.next(response(4, [stale]));

    expect(component.workOrders()).toEqual([latest]);
    expect(component.totalPages()).toBe(1);
    expect(component.currentPage()).toBe(1);
    expect(storage.set).toHaveBeenLastCalledWith('workOrdersSearch', stored({ searchValue: 'ab' }));
  });

  it('never keeps more than one active request subscription across search, paging, retry and delete', () => {
    let active = 0;
    // Nunca completa: solo se libera cuando switchMap la reemplaza o se destruye la página.
    const pending = () =>
      new Observable<PaginatedResponse<WorkOrder>>((subscriber) => {
        active++;
        subscriber.next(response());
        return () => {
          active--;
        };
      });
    const failing = () =>
      new Observable<PaginatedResponse<WorkOrder>>((subscriber) => {
        active++;
        subscriber.error(new Error('offline'));
        return () => {
          active--;
        };
      });
    service.search.mockImplementation(pending);

    start();
    expect(active).toBe(1);
    search('motor');
    expect(active).toBe(1);
    component.goToPage(2);
    expect(active).toBe(1);

    service.search.mockImplementationOnce(failing);
    component.goToPage(3);
    expect(component.error()).not.toBeNull();
    expect(active).toBe(0);

    component.loadWorkOrders();
    expect(active).toBe(1);
    component.deleteWorkOrder('1');
    expect(active).toBe(1);

    fixture.destroy();
    expect(active).toBe(0);
  });

  it('navigates to the detail, edit and create routes', () => {
    start();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.viewWorkOrder('1');
    expect(navigateSpy).toHaveBeenLastCalledWith(['/work-orders', '1']);

    component.editWorkOrder('1');
    expect(navigateSpy).toHaveBeenLastCalledWith(['/work-orders', '1', 'edit']);

    component.navigateToCreateWorkOrder();
    expect(navigateSpy).toHaveBeenLastCalledWith(['/work-orders/new']);
  });

  it('shows an error message when deleting a work order fails', () => {
    start();
    const messageService = TestBed.inject(MessageService);
    service.delete.mockReturnValueOnce(throwError(() => new Error('offline')));

    component.deleteWorkOrder('1');

    expect(messageService.message()).toEqual({
      variant: 'error',
      title: 'Error',
      message: 'Error al eliminar la orden.',
    });
  });

  describe('status and priority filters', () => {
    it('sends the status filter as a request parameter and renders the response as received', () => {
      start();
      const completed = { ...order, id: '2', title: 'Otra orden', status: 'completed' as const };
      service.search.mockReturnValueOnce(of(response(1, [order, completed])));

      component.statusFilter.setValue('pending');
      fixture.detectChanges();

      expect(service.search).toHaveBeenLastCalledWith(expected({ status: 'pending' }));
      expect(rows()).toHaveLength(2);
    });

    it('sends search text, status and priority together and keeps them when one changes', () => {
      start();
      search('motor');
      component.statusFilter.setValue('pending');
      component.priorityFilter.setValue('high');
      expect(service.search).toHaveBeenLastCalledWith(
        expected({ title: 'motor', status: 'pending', priority: 'high' }),
      );

      service.search.mockClear();
      component.priorityFilter.setValue('low');
      expect(service.search).toHaveBeenCalledExactlyOnceWith(
        expected({ title: 'motor', status: 'pending', priority: 'low' }),
      );

      component.statusFilter.setValue('');
      expect(service.search).toHaveBeenLastCalledWith(
        expected({ title: 'motor', priority: 'low' }),
      );
    });

    it('applies pending search text when a filter changes and skips the later duplicate debounce', () => {
      start();
      component.searchControl.setValue('motor');
      component.statusFilter.setValue('completed');
      vi.advanceTimersByTime(300);

      expect(calls()).toEqual([expected(), expected({ title: 'motor', status: 'completed' })]);
    });

    it.each<[string, () => void, Partial<WorkOrdersCriteria>]>([
      ['status', () => component.statusFilter.setValue('completed'), { status: 'completed' }],
      ['priority', () => component.priorityFilter.setValue('high'), { priority: 'high' }],
      ['search text', () => search('bomba'), { title: 'bomba' }],
    ])('resets to page 1 when the %s changes from page 2', (_name, apply, criteria) => {
      start({ searchValue: 'motor', page: 2 });
      expect(component.currentPage()).toBe(2);

      apply();

      expect(service.search).toHaveBeenLastCalledWith(
        expected({ title: 'motor', ...criteria, page: 1 }),
      );
      expect(component.currentPage()).toBe(1);
      expect(storage.set).toHaveBeenLastCalledWith(
        'workOrdersSearch',
        expect.objectContaining({ page: 1 }),
      );
    });

    it('keeps every active criterion when paging or retrying', () => {
      start(stored({ searchValue: 'motor', status: 'in-progress', priority: 'high' }));
      const all = { title: 'motor', status: 'in-progress', priority: 'high' } as const;

      component.goToPage(2);
      expect(service.search).toHaveBeenLastCalledWith(expected({ ...all, page: 2 }));

      component.loadWorkOrders();
      expect(service.search).toHaveBeenLastCalledWith(expected({ ...all, page: 2 }));
    });

    it('persists status and priority with the query', () => {
      start();
      component.statusFilter.setValue('pending');
      component.priorityFilter.setValue('low');
      expect(storage.set).toHaveBeenLastCalledWith(
        'workOrdersSearch',
        stored({ status: 'pending', priority: 'low' }),
      );
    });

    it('restores stored filters into the selects with a single request', () => {
      start(stored({ status: 'in-progress', priority: 'low', page: 2 }));

      expect(component.statusFilter.value).toBe('in-progress');
      expect(component.priorityFilter.value).toBe('low');
      expect(fixture.nativeElement.querySelector('#status-filter').value).toBe('in-progress');
      expect(fixture.nativeElement.querySelector('#priority-filter').value).toBe('low');
      expect(service.search).toHaveBeenCalledExactlyOnceWith(
        expected({ status: 'in-progress', priority: 'low', page: 2 }),
      );
    });

    it('restores an older stored query without filters', () => {
      start({ searchValue: 'motor', page: 2 });

      expect(component.statusFilter.value).toBe('');
      expect(component.priorityFilter.value).toBe('');
      expect(service.search).toHaveBeenCalledExactlyOnceWith(expected({ title: 'motor', page: 2 }));
    });

    it('drops stored filter values that are not valid', () => {
      start(stored({ searchValue: 'motor', status: 'archived', priority: 'urgent', page: 2 }));

      expect(component.statusFilter.value).toBe('');
      expect(component.priorityFilter.value).toBe('');
      expect(service.search).toHaveBeenCalledExactlyOnceWith(expected({ title: 'motor', page: 2 }));
    });

    it('cancels the previous request when a filter changes and keeps only the latest', () => {
      start();
      const older = new Subject<PaginatedResponse<WorkOrder>>();
      service.search.mockReturnValueOnce(older);
      component.statusFilter.setValue('pending');
      const latest = { ...order, id: '2', title: 'Última' };
      service.search.mockReturnValueOnce(of(response(1, [latest])));
      component.priorityFilter.setValue('high');

      expect(older.observed).toBe(false);
      older.next(response(4, [order]));
      expect(component.workOrders()).toEqual([latest]);
    });

    it('offers every status and priority in the filter selects', () => {
      start();
      const options = (id: string) =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
            `#${id} option`,
          ),
        ).map((option) => option.value);

      expect(options('status-filter')).toEqual(['', 'pending', 'in-progress', 'completed']);
      expect(options('priority-filter')).toEqual(['', 'low', 'medium', 'high']);
    });

    it('keeps the filter selects visible when there are no results', () => {
      service.search.mockReturnValue(of(response(0, [])));
      start(stored({ status: 'pending' }));

      expect(fixture.nativeElement.textContent).toContain(
        'No hay órdenes que coincidan con los filtros.',
      );
      expect(fixture.nativeElement.querySelector('#status-filter')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#priority-filter')).not.toBeNull();
    });

    it('keeps the original empty message when no criteria are active', () => {
      service.search.mockReturnValue(of(response(0, [])));
      start();

      expect(fixture.nativeElement.textContent).toContain(
        'No existen órdenes de trabajo registradas.',
      );
      expect(fixture.nativeElement.textContent).not.toContain('coincidan con los filtros');
    });
  });

  describe('status and priority badges', () => {
    it.each<[WorkOrderStatus, string, string]>([
      ['pending', 'badge--warning', 'Pendiente'],
      ['in-progress', 'badge--info', 'En progreso'],
      ['completed', 'badge--success', 'Completada'],
    ])('shows the %s status with the %s variant and label "%s"', (status, cssClass, label) => {
      service.search.mockReturnValueOnce(of(response(1, [{ ...order, status }])));
      start();

      const badge = rowBadges(rowAt(0)).status;
      expect(badge.classList.contains(cssClass)).toBe(true);
      expect(badge.classList.contains('badge--neutral')).toBe(false);
      expect(badge.textContent?.trim()).toBe(label);
    });

    it.each<[WorkOrderPriority, string, string]>([
      ['low', 'badge--neutral', 'Baja'],
      ['medium', 'badge--warning', 'Media'],
      ['high', 'badge--error', 'Alta'],
    ])('shows the %s priority with the %s variant and label "%s"', (priority, cssClass, label) => {
      service.search.mockReturnValueOnce(of(response(1, [{ ...order, priority }])));
      start();

      const badge = rowBadges(rowAt(0)).priority;
      expect(badge.classList.contains(cssClass)).toBe(true);
      expect(badge.textContent?.trim()).toBe(label);
    });
  });

  describe('inline status change', () => {
    const second: WorkOrder = { ...order, id: '2', title: 'Segunda orden', status: 'pending' };

    function startWithTwoRows(storedQuery: unknown = null): void {
      service.search.mockReturnValueOnce(of(response(4, [order, second])));
      start(storedQuery);
    }

    it('gives each row select its own accessible name and the three status options', () => {
      startWithTwoRows();

      const selects = inlineSelects();
      expect(selects.map((select) => select.getAttribute('aria-label'))).toEqual([
        'Cambiar estado de Revisar motor',
        'Cambiar estado de Segunda orden',
      ]);
      expect(Array.from(selectAt(0).options).map((option) => option.value)).toEqual([
        'pending',
        'in-progress',
        'completed',
      ]);
      expect(selects.map((select) => select.value)).toEqual(['pending', 'pending']);
    });

    it('patches only the changed row without reloading the list', () => {
      startWithTwoRows();
      service.updateStatus.mockReturnValue(of({ ...second, status: 'completed' }));

      choose(selectAt(1), 'completed');
      fixture.detectChanges();

      expect(service.updateStatus).toHaveBeenCalledExactlyOnceWith('2', 'completed');
      expect(service.search).toHaveBeenCalledTimes(1);
      expect(component.workOrders().map((item) => item.status)).toEqual(['pending', 'completed']);
      expect(rowBadges(rowAt(0)).status.classList.contains('badge--warning')).toBe(true);
      expect(rowBadges(rowAt(1)).status.classList.contains('badge--success')).toBe(true);
      expect(inlineSelects().map((select) => select.value)).toEqual(['pending', 'completed']);
    });

    it('confirms the change with a success message', () => {
      startWithTwoRows();
      service.updateStatus.mockReturnValue(of({ ...second, status: 'in-progress' }));

      choose(selectAt(1), 'in-progress');

      expect(TestBed.inject(MessageService).message()).toEqual(
        expect.objectContaining({ variant: 'success', message: 'Estado actualizado.' }),
      );
    });

    it('reloads the current query when the row no longer matches the active status filter', () => {
      startWithTwoRows(stored({ status: 'pending', page: 2 }));
      service.updateStatus.mockReturnValue(of({ ...second, status: 'completed' }));
      service.search.mockClear();
      service.search.mockReturnValueOnce(of(response(4, [order])));

      choose(selectAt(1), 'completed');
      fixture.detectChanges();

      expect(service.search).toHaveBeenCalledExactlyOnceWith(
        expected({ status: 'pending', page: 2 }),
      );
      expect(rows()).toHaveLength(1);
    });

    it('does not reload when only a priority filter is active', () => {
      startWithTwoRows(stored({ priority: 'medium' }));
      service.updateStatus.mockReturnValue(of({ ...second, status: 'completed' }));
      service.search.mockClear();

      choose(selectAt(1), 'completed');

      expect(service.updateStatus).toHaveBeenCalledExactlyOnceWith('2', 'completed');
      expect(service.search).not.toHaveBeenCalled();
      expect(component.workOrders().map((item) => item.status)).toEqual(['pending', 'completed']);
    });

    it('does not call the service when the selected status is the current one', () => {
      startWithTwoRows();

      choose(selectAt(0), 'pending');

      expect(service.updateStatus).not.toHaveBeenCalled();
    });

    it('restores the select and shows an error when the update fails', () => {
      startWithTwoRows();
      service.updateStatus.mockReturnValue(throwError(() => new Error('offline')));

      choose(selectAt(1), 'completed');
      fixture.detectChanges();

      expect(selectAt(1).value).toBe('pending');
      expect(component.workOrders().map((item) => item.status)).toEqual(['pending', 'pending']);
      expect(rowBadges(rowAt(1)).status.classList.contains('badge--warning')).toBe(true);
      expect(TestBed.inject(MessageService).message()).toEqual({
        variant: 'error',
        title: 'Error',
        message: 'No se pudo actualizar el estado.',
      });
      expect(selectAt(1).disabled).toBe(false);
    });

    it('disables the row select while its update is in flight and ignores a second change', () => {
      startWithTwoRows();
      const inFlight = new Subject<WorkOrder>();
      service.updateStatus.mockReturnValue(inFlight);

      choose(selectAt(1), 'completed');
      fixture.detectChanges();
      expect(selectAt(1).disabled).toBe(true);
      expect(selectAt(0).disabled).toBe(false);

      choose(selectAt(1), 'in-progress');
      expect(service.updateStatus).toHaveBeenCalledTimes(1);

      inFlight.next({ ...second, status: 'completed' });
      inFlight.complete();
      fixture.detectChanges();
      expect(selectAt(1).disabled).toBe(false);
    });

    it('ignores a value that is not a valid status', () => {
      startWithTwoRows();
      const select = selectAt(0);

      choose(select, 'archived');

      expect(service.updateStatus).not.toHaveBeenCalled();
      expect(select.value).toBe('pending');
    });
  });

  describe('permissions by role', () => {
    const other = {
      ...order,
      id: '2',
      title: 'Cambiar filtro hidráulico',
      type: 'preventivo' as const,
    };

    function startAs(user: AuthUser | null): void {
      currentUser.set(user);
      service.search.mockReturnValue(of(response(1, [order, other])));
      start();
      fixture.detectChanges();
    }

    function rowActionLabels(): string[] {
      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('tbody button'),
      );
      return buttons
        .map((button) => button.getAttribute('aria-label') ?? '')
        .filter((label) => /^(Ver|Editar|Eliminar) /.test(label));
    }

    function createButton(): HTMLButtonElement | undefined {
      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      return buttons.find((button) => button.textContent?.includes('Crear Orden de Trabajo'));
    }

    function confirmDeletion(id: string): void {
      component.openDeleteModal(id);
      fixture.detectChanges();
      const confirmButton = fixture.nativeElement.querySelector('[role="dialog"] .btn--danger');
      if (!confirmButton) throw new Error('No se abrió la confirmación de eliminación');
      (confirmButton as HTMLButtonElement).click();
    }

    describe('administrador', () => {
      it('sees Ver, Editar and Eliminar for every order', () => {
        startAs(administrador);

        expect(rowActionLabels()).toEqual([
          'Ver Revisar motor',
          'Editar Revisar motor',
          'Eliminar Revisar motor',
          'Ver Cambiar filtro hidráulico',
          'Editar Cambiar filtro hidráulico',
          'Eliminar Cambiar filtro hidráulico',
        ]);
      });

      it('deletes an order after confirming: sends DELETE and reloads', () => {
        expect.assertions(3);
        startAs(administrador);

        confirmDeletion('1');

        expect(service.delete).toHaveBeenCalledExactlyOnceWith('1');
        expect(service.search).toHaveBeenCalledTimes(2);
        expect(TestBed.inject(MessageService).message()?.variant).toBe('success');
      });

      it('does not offer to create orders (creating is not part of its role)', () => {
        startAs(administrador);

        expect(createButton()).toBeUndefined();
      });
    });

    describe('team leader', () => {
      it('sees Ver and Editar but not Eliminar', () => {
        startAs(teamLeader);

        expect(rowActionLabels()).toEqual([
          'Ver Revisar motor',
          'Editar Revisar motor',
          'Ver Cambiar filtro hidráulico',
          'Editar Cambiar filtro hidráulico',
        ]);
      });

      it('sees the button to create orders', () => {
        startAs(teamLeader);

        expect(createButton()).toBeDefined();
      });

      it('cannot delete: no DELETE request is sent and a warning is shown', () => {
        expect.assertions(3);
        startAs(teamLeader);

        component.deleteWorkOrder('1');

        expect(service.delete).not.toHaveBeenCalled();
        expect(TestBed.inject(MessageService).message()?.variant).toBe('warning');
        expect(TestBed.inject(MessageService).message()?.title).toBe('Acceso denegado');
      });

      it('cannot open the delete confirmation, so it never reaches deleteWorkOrder', () => {
        expect.assertions(3);
        startAs(teamLeader);

        component.openDeleteModal('1');

        expect(component.deleteModalOpen()).toBe(false);
        expect(component.workOrderDeleted()).toBe('');
        expect(service.delete).not.toHaveBeenCalled();
      });
    });

    describe('personal-produccion', () => {
      it('sees only Ver, plus the button to create orders', () => {
        expect.assertions(2);
        startAs(produccion);

        expect(rowActionLabels()).toEqual(['Ver Revisar motor', 'Ver Cambiar filtro hidráulico']);
        expect(createButton()).toBeDefined();
      });
    });

    describe.each<[string, AuthUser | null]>([
      ['tecnico', tecnico],
      ['no session', null],
    ])('%s', (_label, user) => {
      it('sees only Ver and no button to create orders', () => {
        expect.assertions(2);
        startAs(user);

        expect(rowActionLabels()).toEqual(['Ver Revisar motor', 'Ver Cambiar filtro hidráulico']);
        expect(createButton()).toBeUndefined();
      });

      it('cannot delete', () => {
        expect.assertions(2);
        startAs(user);

        component.deleteWorkOrder('1');

        expect(service.delete).not.toHaveBeenCalled();
        expect(TestBed.inject(MessageService).message()?.variant).toBe('warning');
      });
    });

    describe('type column', () => {
      it('shows the type of each order with its label', () => {
        expect.assertions(3);
        startAs(administrador);

        const headers = Array.from(fixture.nativeElement.querySelectorAll('thead th')).map((th) =>
          (th as HTMLElement).textContent?.trim(),
        );
        const typeIndex = headers.indexOf('Tipo');

        expect(typeIndex).toBeGreaterThanOrEqual(0);
        expect(rowAt(0).cells[typeIndex]?.textContent?.trim()).toBe('Correctivo');
        expect(rowAt(1).cells[typeIndex]?.textContent?.trim()).toBe('Preventivo');
      });
    });
  });
});
