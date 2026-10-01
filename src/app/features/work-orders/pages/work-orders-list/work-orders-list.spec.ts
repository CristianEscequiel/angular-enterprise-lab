import { MACHINE_ONLY_REF_FIXTURE, MACHINE_REF_FIXTURE } from '../../testing/work-order.fixtures';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { LocalStorageService } from '@core/services/localStorage.service';
import { MessageService } from '@core/services/message.service';
import {
  WorkOrdersCriteria,
  WorkOrdersService,
  WorkOrderStateError,
} from '../../data-access/work-order.service';
import {
  PaginatedResponse,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderTaker,
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
    machineRef: MACHINE_REF_FIXTURE,
    type: 'correctivo',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  function response(pages = 4, data: WorkOrder[] = [order]): PaginatedResponse<WorkOrder> {
    return { data, page: 1, size: 10, totalItems: pages * 10, totalPages: pages };
  }

  function expected(over: Partial<WorkOrdersCriteria> = {}): WorkOrdersCriteria {
    return { title: '', status: '', priority: '', page: 1, perPage: 10, ...over };
  }

  function stored(over: Partial<StoredQuery> = {}): StoredQuery {
    return { searchValue: '', status: '', priority: '', page: 1, ...over };
  }

  const service = {
    search: vi.fn<(criteria: WorkOrdersCriteria) => Observable<PaginatedResponse<WorkOrder>>>(),
    take: vi.fn<(id: string, taker: WorkOrderTaker) => Observable<WorkOrder>>(),
    release: vi.fn<(id: string) => Observable<WorkOrder>>(),
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
    service.take.mockReset();
    service.release.mockReset();
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

  function rows(): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  }

  function rowAt(index: number): HTMLTableRowElement {
    const row = rows()[index];
    if (!row) throw new Error(`No hay fila ${index}`);
    return row;
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

  it('shows the stored machine path of each order in its row', () => {
    expect.assertions(3);
    const other = {
      ...order,
      id: '2',
      title: 'Cambiar filtro hidráulico',
      machineRef: MACHINE_ONLY_REF_FIXTURE,
    };
    service.search.mockReturnValueOnce(of(response(1, [order, other])));
    start();
    fixture.detectChanges();

    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));

    expect(fixture.nativeElement.textContent).toContain('Máquina / parte');
    expect(rows[0]?.textContent).toContain(MACHINE_REF_FIXTURE.breadcrumb);
    expect(rows[1]?.textContent).toContain('Envasadora línea 1');
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

      expect(options('status-filter')).toEqual([
        '',
        'pending',
        'in-progress',
        'completed',
        'cancelled',
      ]);
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

  // Spec 014 (REQ-3.1, 3.3, 3.4): bajo md la fila se muestra como tarjeta. El CSS toma la etiqueta
  // de cada valor de `data-label`, que tiene que coincidir con el encabezado de su columna.
  describe('card layout on small screens', () => {
    it('labels every cell with the header of its column', () => {
      start();

      const headers = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('thead th'),
      ).map((header) => header.textContent?.trim());
      const cells = Array.from<HTMLElement>(rowAt(0).querySelectorAll('td'));

      expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual(headers);
    });

    it.each<[WorkOrderStatus, string]>([
      ['pending', 'Pendiente'],
      ['in-progress', 'En progreso'],
      ['completed', 'Completada'],
      ['cancelled', 'Cancelada'],
    ])('stripes a %s order with its status class and keeps the badge text', (status, label) => {
      service.search.mockReturnValueOnce(of(response(1, [{ ...order, status }])));
      start();

      expect(rowAt(0).classList).toContain(`row--${status}`);
      expect(rowBadges(rowAt(0)).status.textContent?.trim()).toBe(label);
    });

    it('gives each order only the stripe of its own status', () => {
      service.search.mockReturnValueOnce(
        of(
          response(1, [
            { ...order, id: '1', status: 'pending' },
            { ...order, id: '2', status: 'completed' },
          ]),
        ),
      );
      start();

      expect(rowAt(0).classList).not.toContain('row--completed');
      expect(rowAt(1).classList).toContain('row--completed');
      expect(rowAt(1).classList).not.toContain('row--pending');
    });

    it('groups every action of the row in a wrapping container', () => {
      start();

      const buttons = rowAt(0).querySelectorAll('button');

      expect(buttons.length).toBeGreaterThan(0);
      expect(rowAt(0).querySelectorAll('.row-actions button')).toHaveLength(buttons.length);
      expect(rowAt(0).querySelector('td.row-actions-cell')).not.toBeNull();
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

  // Tomar, continuar y liberar (spec 013d). El estado ya no se cambia con un <select>.
  describe('take, continue and release', () => {
    const at = '2026-09-25T10:00:00.000Z';
    const me = { id: '2', name: 'Técnico Mecánico de Guardia', at };
    const someoneElse = { id: '5', name: 'Luis Paz', at };
    const note = {
      comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
      authorId: '2',
      authorName: me.name,
      at,
    };

    const pending: WorkOrder = {
      ...order,
      id: '10',
      title: 'Falla en cinta',
      type: 'pronto-intervencion',
      status: 'pending',
    };
    const mine: WorkOrder = {
      ...pending,
      id: '11',
      title: 'Parada de sellado',
      status: 'in-progress',
      takenBy: me,
    };
    const running: WorkOrder = {
      ...pending,
      id: '12',
      title: 'Fuga de aire',
      status: 'in-progress',
      takenBy: someoneElse,
    };
    const closed: WorkOrder = {
      ...pending,
      id: '13',
      title: 'Cinta reparada',
      status: 'completed',
      takenBy: me,
      closingNote: note,
    };
    const preventive: WorkOrder = {
      ...order,
      id: '14',
      title: 'Lubricar guías',
      type: 'preventivo',
      status: 'pending',
    };

    let navigate: ReturnType<typeof vi.spyOn>;

    function startAs(user: AuthUser | null, orders: WorkOrder[]): void {
      currentUser.set(user);
      service.search.mockReset().mockReturnValue(of(response(1, orders)));
      start();
      navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
    }

    const message = () => TestBed.inject(MessageService).message();

    function labelsOf(prefix: string): string[] {
      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('tbody button'),
      );

      return buttons
        .map((button) => button.getAttribute('aria-label') ?? '')
        .filter((label) => label.startsWith(prefix));
    }

    function click(label: string): void {
      const button = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('tbody button'),
      ).find((candidate) => candidate.getAttribute('aria-label') === label);

      if (!button) throw new Error(`No hay el botón "${label}"`);
      button.click();
      fixture.detectChanges();
    }

    it('no longer offers a select to change the status by hand', () => {
      startAs(administrador, [pending, mine]);

      expect(fixture.nativeElement.querySelectorAll('tbody select')).toHaveLength(0);
    });

    describe('technician of the guardia team', () => {
      it('sees "Tomar orden" on a pending order and "Continuar" on the one they took', () => {
        startAs(tecnico, [pending, mine]);

        expect(labelsOf('Tomar orden')).toEqual(['Tomar orden Falla en cinta']);
        expect(labelsOf('Continuar')).toEqual(['Continuar Parada de sellado']);
      });

      it('sees "Tomar orden" on an order that someone else is running (to be warned)', () => {
        startAs(tecnico, [running]);

        expect(labelsOf('Tomar orden')).toEqual(['Tomar orden Fuga de aire']);
        expect(labelsOf('Continuar')).toEqual([]);
      });

      it('sees neither button on a closed order', () => {
        startAs(tecnico, [closed]);

        expect(labelsOf('Tomar orden')).toEqual([]);
        expect(labelsOf('Continuar')).toEqual([]);
      });

      it('does not see "Tomar orden" on an order type that their team does not attend', () => {
        startAs(tecnico, [preventive]);

        expect(labelsOf('Tomar orden')).toEqual([]);
      });

      it('shows who runs each in-progress order next to its status', () => {
        startAs(tecnico, [pending, mine, running]);

        const owners = Array.from(
          fixture.nativeElement.querySelectorAll('.work-orders-status__owner'),
        ).map((element) => (element as HTMLElement).textContent?.trim());

        expect(owners).toEqual(['Tomada por Técnico Mecánico de Guardia', 'Tomada por Luis Paz']);
      });

      it('takes the order and only then opens its closing page', () => {
        const taking = new Subject<WorkOrder>();
        service.take.mockReturnValue(taking);
        startAs(tecnico, [pending]);

        click('Tomar orden Falla en cinta');

        expect(service.take).toHaveBeenCalledExactlyOnceWith(
          '10',
          expect.objectContaining({ id: '2', name: tecnico.displayName }),
        );
        // Todavía no terminó de tomarla: no se abre la página de cierre.
        expect(navigate).not.toHaveBeenCalled();

        taking.next({ ...pending, status: 'in-progress', takenBy: me });
        taking.complete();

        expect(navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders', '10', 'resolve']);
        expect(message()?.variant).not.toBe('error');
      });

      it('does not navigate when taking the order fails', () => {
        service.take.mockReturnValue(throwError(() => new Error('offline')));
        startAs(tecnico, [pending]);

        click('Tomar orden Falla en cinta');

        expect(navigate).not.toHaveBeenCalled();
        expect(message()?.variant).toBe('error');
        // El botón vuelve a estar disponible para reintentar.
        expect(component.isBusy('10')).toBe(false);
      });

      it('continues an order they already took without calling the service', () => {
        startAs(tecnico, [mine]);

        click('Continuar Parada de sellado');

        expect(service.take).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders', '11', 'resolve']);
      });

      it('warns who is running an order taken by someone else, without calling the service or navigating', () => {
        startAs(tecnico, [running]);

        click('Tomar orden Fuga de aire');

        expect(service.take).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(message()?.variant).toBe('warning');
        expect(message()?.message).toBe('La orden está siendo ejecutada por Luis Paz.');
      });

      it('with a stale list: another technician took it meanwhile → same warning, reload, no navigation', () => {
        service.take.mockReturnValue(
          throwError(() => new WorkOrderStateError('not-pending', someoneElse, 'in-progress')),
        );
        startAs(tecnico, [pending]);
        service.search.mockClear();

        click('Tomar orden Falla en cinta');

        expect(message()?.message).toBe('La orden está siendo ejecutada por Luis Paz.');
        expect(message()?.variant).toBe('warning');
        expect(service.search).toHaveBeenCalledTimes(1);
        expect(navigate).not.toHaveBeenCalled();
      });

      it('with a stale list: it was already theirs → continues to the closing page', () => {
        service.take.mockReturnValue(
          throwError(() => new WorkOrderStateError('not-pending', me, 'in-progress')),
        );
        startAs(tecnico, [pending]);

        click('Tomar orden Falla en cinta');

        expect(navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders', '10', 'resolve']);
      });

      it('with a stale list: it was closed meanwhile → says so and does not navigate', () => {
        service.take.mockReturnValue(
          throwError(() => new WorkOrderStateError('not-pending', me, 'completed')),
        );
        startAs(tecnico, [pending]);

        click('Tomar orden Falla en cinta');

        expect(message()?.message).toBe('La orden ya fue cerrada.');
        expect(navigate).not.toHaveBeenCalled();
      });

      it('warns without naming anybody when an in-progress order has no owner recorded (older data)', () => {
        const { takenBy, ...withoutOwner } = running;
        void takenBy;
        startAs(tecnico, [withoutOwner]);

        click('Tomar orden Fuga de aire');

        expect(service.take).not.toHaveBeenCalled();
        expect(message()?.message).toBe('La orden ya no está pendiente.');
      });

      it('sends a single take request on a double click', () => {
        service.take.mockReturnValue(new Subject<WorkOrder>());
        startAs(tecnico, [pending]);

        component.takeWorkOrder(pending);
        component.takeWorkOrder(pending);

        expect(service.take).toHaveBeenCalledTimes(1);
      });

      it('cannot take an order of a type their team does not attend, even if the method is invoked', () => {
        startAs(tecnico, [preventive]);

        component.takeWorkOrder(preventive);

        expect(service.take).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(message()?.title).toBe('Acceso denegado');
      });
    });

    describe.each<[string, AuthUser | null]>([
      ['administrador', administrador],
      ['team leader', teamLeader],
      ['personal-produccion', produccion],
      ['no session', null],
    ])('%s', (_label, user) => {
      it('sees no "Tomar orden" nor "Continuar", and cannot take even if the method is invoked', () => {
        startAs(user, [pending, mine]);

        expect(labelsOf('Tomar orden')).toEqual([]);
        expect(labelsOf('Continuar')).toEqual([]);

        component.takeWorkOrder(pending);

        expect(service.take).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
      });
    });

    describe('release', () => {
      it.each<[string, AuthUser]>([
        ['administrador', administrador],
        ['team leader', teamLeader],
      ])('%s sees "Liberar" only on in-progress orders', (_label, user) => {
        startAs(user, [pending, mine, running, closed]);

        expect(labelsOf('Liberar')).toEqual(['Liberar Parada de sellado', 'Liberar Fuga de aire']);
      });

      it.each<[string, AuthUser | null]>([
        ['the technician who owns the order', tecnico],
        ['personal-produccion', produccion],
        ['no session', null],
      ])('%s does not see "Liberar"', (_label, user) => {
        startAs(user, [mine, running]);

        expect(labelsOf('Liberar')).toEqual([]);
      });

      it('asks for confirmation naming the owner, and does not call the service until confirmed', () => {
        startAs(administrador, [running]);

        click('Liberar Fuga de aire');

        expect(component.releaseModalOpen()).toBe(true);
        expect(component.releaseMessage()).toContain('Luis Paz');
        expect(service.release).not.toHaveBeenCalled();
      });

      it("the dialog's confirm button releases the order", () => {
        service.release.mockReturnValue(of({ ...running, status: 'pending', takenBy: null }));
        startAs(administrador, [running]);
        click('Liberar Fuga de aire');

        (
          fixture.nativeElement.querySelector('.modal__actions .btn--danger') as HTMLElement
        ).click();

        expect(service.release).toHaveBeenCalledExactlyOnceWith('12');
      });

      it('does nothing when confirmed with no order selected', () => {
        startAs(administrador, [running]);

        component.confirmRelease();

        expect(service.release).not.toHaveBeenCalled();
      });

      it('cancelling the confirmation makes no request', () => {
        startAs(administrador, [running]);
        click('Liberar Fuga de aire');

        component.releaseModalOpen.set(false);
        fixture.detectChanges();

        expect(service.release).not.toHaveBeenCalled();
      });

      it('confirming releases the order and reloads the list with it pending and without an owner', () => {
        const released: WorkOrder = { ...running, status: 'pending', takenBy: null };
        service.release.mockReturnValue(of(released));
        startAs(administrador, [running]);
        service.search.mockClear();
        service.search.mockReturnValue(of(response(1, [released])));

        click('Liberar Fuga de aire');
        component.confirmRelease();
        fixture.detectChanges();

        expect(service.release).toHaveBeenCalledExactlyOnceWith('12');
        expect(service.search).toHaveBeenCalledTimes(1);
        expect(fixture.nativeElement.querySelector('.work-orders-status__owner')).toBeNull();
        expect(labelsOf('Liberar')).toEqual([]);
      });

      it('cannot release without permission, even if the method is invoked', () => {
        startAs(tecnico, [mine]);
        component.workOrderToRelease.set(mine);

        component.confirmRelease();
        component.openReleaseModal(mine);

        expect(service.release).not.toHaveBeenCalled();
        expect(component.releaseModalOpen()).toBe(false);
        expect(message()?.title).toBe('Acceso denegado');
      });

      it('warns and reloads when the order was no longer in progress', () => {
        service.release.mockReturnValue(
          throwError(() => new WorkOrderStateError('not-in-progress', null, 'completed')),
        );
        startAs(administrador, [running]);
        service.search.mockClear();

        click('Liberar Fuga de aire');
        component.confirmRelease();

        expect(message()?.variant).toBe('warning');
        expect(message()?.message).toBe('La orden ya fue cerrada.');
        expect(service.search).toHaveBeenCalledTimes(1);
      });

      it('shows an error when releasing fails for another reason', () => {
        service.release.mockReturnValue(throwError(() => new Error('offline')));
        startAs(administrador, [running]);

        click('Liberar Fuga de aire');
        component.confirmRelease();

        expect(message()?.variant).toBe('error');
      });

      it('sends a single release request when confirmed twice', () => {
        service.release.mockReturnValue(new Subject<WorkOrder>());
        startAs(administrador, [running]);
        click('Liberar Fuga de aire');

        component.confirmRelease();
        component.confirmRelease();

        expect(service.release).toHaveBeenCalledTimes(1);
      });
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
