import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { map, Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { WorkOrdersService } from '@features/work-orders/data-access/work-order.service';
import {
  PaginatedResponse,
  WorkOrder,
  WorkOrderStatus,
} from '@features/work-orders/models/work-order.model';
import { MACHINE_REF_FIXTURE } from '@features/work-orders/testing/work-order.fixtures';
import { DashboardService } from '../../data-access/dashboard.service';
import { DashboardSummary, WorkloadItem } from '../../models/dashboard.model';
import { DashboardPage } from './dashboard-page';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;

  const tecnico: AuthUser = {
    id: '2',
    username: 'tecnico',
    displayName: 'Técnico de Mantenimiento',
    email: 'tecnico@enterprise-lab.dev',
    role: 'tecnico',
    legajo: '1001',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const currentUser = signal<AuthUser | null>(tecnico);
  // `getAll` es el origen de verdad de las órdenes de cada test; `listByStatus` (lo único que la página
  // le pide al servicio) devuelve, por estado, la página con las órdenes de ese estado.
  const service = {
    getAll: vi.fn<() => Observable<WorkOrder[]>>(),
    listByStatus: vi.fn<(status: WorkOrderStatus) => Observable<PaginatedResponse<WorkOrder>>>(),
  };
  const dashboard = {
    getSummary: vi.fn<() => Observable<DashboardSummary>>(),
    getWorkload: vi.fn<() => Observable<WorkloadItem[]>>(),
  };
  const summaryFixture: DashboardSummary = {
    period: { from: '2026-09-01', to: '2026-09-30' },
    byStatus: { pending: 0, 'in-progress': 0, completed: 0, cancelled: 0 },
    byPriority: { low: 0, medium: 0, high: 0 },
    byType: { preventivo: 0, correctivo: 0, 'pronto-intervencion': 0 },
    total: 32,
    open: 21,
    closedInPeriod: { completed: 3, cancelled: 1, total: 4 },
    averageResolutionMinutes: 150,
  };
  const pageOf = (data: WorkOrder[], totalItems = data.length): PaginatedResponse<WorkOrder> => ({
    data,
    page: 1,
    size: 100,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / 100)),
  });

  // Mediodía de hoy (local) y de ayer: las órdenes "cerradas hoy" dependen del reloj real de la página.
  const todayNoon = new Date();
  todayNoon.setHours(12, 0, 0, 0);
  const yesterdayNoon = new Date(todayNoon);
  yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
  const createdOn = (daysAgo: number): string => {
    const date = new Date(todayNoon);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  };

  function order(id: string, over: Partial<WorkOrder> = {}): WorkOrder {
    return {
      id,
      title: `Orden ${id}`,
      description: 'Descripción de la orden',
      machineRef: MACHINE_REF_FIXTURE,
      type: 'correctivo',
      priority: 'medium',
      status: 'pending',
      createdAt: createdOn(5),
      ...over,
    };
  }
  const taken = (userId: string) => ({
    id: userId,
    name: `Técnico ${userId}`,
    at: todayNoon.toISOString(),
  });
  const closedAt = (userId: string, when: Date): Partial<WorkOrder> => ({
    status: 'completed',
    takenBy: taken(userId),
    closingNote: {
      comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
      authorId: userId,
      authorName: `Técnico ${userId}`,
      at: when.toISOString(),
    },
  });

  beforeEach(async () => {
    currentUser.set(tecnico);
    service.getAll.mockReset().mockReturnValue(of([]));
    service.listByStatus
      .mockReset()
      .mockImplementation((status) =>
        service
          .getAll()
          .pipe(map((orders) => pageOf(orders.filter((item) => item.status === status)))),
      );
    dashboard.getSummary.mockReset().mockReturnValue(of(summaryFixture));
    dashboard.getWorkload.mockReset().mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        { provide: WorkOrdersService, useValue: service },
        { provide: DashboardService, useValue: dashboard },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();
  });

  function start(): void {
    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  }

  const el = (selector: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(selector);
  const all = (selector: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector));
  const text = (selector: string): string =>
    (el(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('should create', () => {
    start();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('has a single h1, "Turno de hoy"', () => {
    start();

    expect(all('h1')).toHaveLength(1);
    expect(text('h1')).toBe('Turno de hoy');
  });

  describe('loading', () => {
    it('shows a status message and no board while the orders load, then the board', () => {
      const response = new Subject<WorkOrder[]>();
      service.getAll.mockReturnValue(response);
      start();

      expect(el('p[role="status"]')?.textContent).toContain('Cargando');
      expect(el('.shift__board')).toBeNull();

      response.next([order('1')]);
      response.complete();
      fixture.detectChanges();

      expect(el('p[role="status"]')).toBeNull();
      expect(el('.shift__board')).not.toBeNull();
    });

    it('asks for the orders once on open', () => {
      start();

      expect(dashboard.getSummary).toHaveBeenCalledTimes(1);
      expect(service.listByStatus.mock.calls.map(([status]) => status).sort()).toEqual([
        'cancelled',
        'completed',
        'in-progress',
        'pending',
      ]);
    });
  });

  describe('the three columns', () => {
    it('counts pending, in progress and closed today', () => {
      service.getAll.mockReturnValue(
        of([
          order('1'),
          order('2'),
          order('3', { status: 'in-progress', takenBy: taken('2') }),
          order('4', closedAt('2', todayNoon)),
          order('5', closedAt('2', todayNoon)),
          order('6', closedAt('2', todayNoon)),
        ]),
      );
      start();

      expect(text('#shift-pending-count')).toBe('2');
      expect(text('#shift-progress-count')).toBe('1');
      expect(text('#shift-closed-count')).toBe('3');
    });

    it('names each column with its own heading', () => {
      start();

      expect(all('.shift__column h2').map((heading) => heading.textContent?.trim())).toEqual([
        'Pendientes',
        'En curso',
        'Cerradas hoy',
      ]);
    });

    it('shows zeros, not blanks, when there is nothing', () => {
      start();

      expect(text('#shift-pending-count')).toBe('0');
      expect(text('#shift-progress-count')).toBe('0');
      expect(text('#shift-closed-count')).toBe('0');
    });

    it('says how many of the pending ones are high priority', () => {
      service.getAll.mockReturnValue(
        of([
          order('1', { priority: 'high' }),
          order('2', { priority: 'high' }),
          order('3', { priority: 'low' }),
        ]),
      );
      start();

      expect(text('#shift-pending-high')).toBe('2 de prioridad alta');
    });

    it.each<[number, string]>([
      [0, '0 son tuyas'],
      [1, '1 es tuya'],
      [2, '2 son tuyas'],
    ])('says how many of the ones in progress are mine: %i → "%s"', (mine, expected) => {
      service.getAll.mockReturnValue(
        of([
          order('x', { status: 'in-progress', takenBy: taken('9') }),
          ...Array.from({ length: mine }, (_, index) =>
            order(`m${index}`, { status: 'in-progress', takenBy: taken('2') }),
          ),
        ]),
      );
      start();

      expect(text('#shift-progress-mine')).toBe(expected);
    });

    it('counts as closed today only what was closed today', () => {
      service.getAll.mockReturnValue(
        of([
          order('today', closedAt('2', todayNoon)),
          order('yesterday', closedAt('2', yesterdayNoon)),
        ]),
      );
      start();

      expect(text('#shift-closed-count')).toBe('1');
    });
  });

  describe('the orders listed under each column', () => {
    const titles = (column: string): string[] =>
      all(`${column} .shift__list a`).map((link) => link.textContent?.trim() ?? '');

    it('lists at most three, the newest first', () => {
      service.getAll.mockReturnValue(
        of([
          order('1', { createdAt: createdOn(9) }),
          order('2', { createdAt: createdOn(1) }),
          order('3', { createdAt: createdOn(7) }),
          order('4', { createdAt: createdOn(2) }),
          order('5', { createdAt: createdOn(3) }),
        ]),
      );
      start();

      expect(titles('[aria-labelledby="shift-pending-title"]')).toEqual([
        'Orden 2',
        'Orden 4',
        'Orden 5',
      ]);
      // El contador sigue diciendo cuántas hay en total, no cuántas se listan.
      expect(text('#shift-pending-count')).toBe('5');
    });

    it('links each one to its detail', () => {
      service.getAll.mockReturnValue(of([order('12')]));
      start();

      expect(
        el('[aria-labelledby="shift-pending-title"] .shift__list a')?.getAttribute('href'),
      ).toBe('/work-orders/12');
    });

    it('lists the closed ones by closing time, the latest first', () => {
      const early = new Date(todayNoon);
      early.setHours(8, 0);
      const late = new Date(todayNoon);
      late.setHours(11, 0);
      service.getAll.mockReturnValue(
        of([order('early', closedAt('2', early)), order('late', closedAt('2', late))]),
      );
      start();

      expect(titles('[aria-labelledby="shift-closed-title"]')).toEqual([
        'Orden late',
        'Orden early',
      ]);
    });
  });

  describe('my orders in progress', () => {
    it('lists mine as links to their detail, with the machine', () => {
      service.getAll.mockReturnValue(
        of([
          order('7', { status: 'in-progress', takenBy: taken('2') }),
          order('8', { status: 'in-progress', takenBy: taken('9') }),
        ]),
      );
      start();

      const links = all('.shift__mine-link');
      expect(links).toHaveLength(1);
      expect(links[0]?.getAttribute('href')).toBe('/work-orders/7');
      expect(links[0]?.textContent).toContain('Orden 7');
      expect(links[0]?.textContent).toContain(MACHINE_REF_FIXTURE.breadcrumb);
      expect(el('#shift-mine-empty')).toBeNull();
    });

    it('shows a message and a link to the pending orders when I have none', () => {
      service.getAll.mockReturnValue(
        of([order('8', { status: 'in-progress', takenBy: taken('9') }), order('1')]),
      );
      start();

      expect(all('.shift__mine-link')).toHaveLength(0);
      expect(text('#shift-mine-empty')).toBe('No tenés órdenes en curso.');
      const link = el('.shift__mine a.btn');
      expect(link?.textContent?.trim()).toBe('Ver órdenes pendientes');
      expect(link?.getAttribute('href')).toBe('/work-orders');
    });

    it('shows that message too when there are no orders at all', () => {
      start();

      expect(el('#shift-mine-empty')).not.toBeNull();
    });
  });

  describe('when loading fails', () => {
    it('shows an error alert with a retry button, and no board', () => {
      service.getAll.mockReturnValue(throwError(() => new Error('down')));
      start();

      expect(el('app-alert')?.textContent).toContain('No pudimos cargar el turno');
      expect(el('.shift__board')).toBeNull();
      expect(el('p[role="status"]')).toBeNull();
      expect(all('button').some((button) => button.textContent?.includes('Reintentar'))).toBe(true);
    });

    it('repeats the request on retry and shows the board when it works', () => {
      service.getAll.mockReturnValueOnce(throwError(() => new Error('down')));
      service.getAll.mockReturnValue(of([order('1'), order('2')]));
      start();

      all('button')
        .find((button) => button.textContent?.includes('Reintentar'))
        ?.click();
      fixture.detectChanges();

      expect(dashboard.getSummary).toHaveBeenCalledTimes(2);
      expect(el('app-alert')).toBeNull();
      expect(text('#shift-pending-count')).toBe('2');
    });

    it('fails again cleanly when the retry fails too', () => {
      service.getAll.mockReturnValue(throwError(() => new Error('down')));
      start();

      all('button')
        .find((button) => button.textContent?.includes('Reintentar'))
        ?.click();
      fixture.detectChanges();

      expect(dashboard.getSummary).toHaveBeenCalledTimes(2);
      expect(el('app-alert')).not.toBeNull();
      expect(el('.shift__board')).toBeNull();
    });
  });

  describe('summary figures (spec 018, REQ-11.1 and 11.6)', () => {
    it('asks the summary once, without a period, and shows the four figures', () => {
      start();

      expect(dashboard.getSummary).toHaveBeenCalledExactlyOnceWith();
      expect(text('#summary-total')).toBe('32');
      expect(text('#summary-open')).toBe('21');
      expect(text('#summary-closed')).toBe('4');
      expect(text('#summary-average')).toBe('2 h 30 min');
    });

    it('names the period the closed figure covers', () => {
      start();

      expect(text('.shift__summary')).toContain('Cerradas del 2026-09-01 al 2026-09-30');
    });

    it('shows "Sin datos" when no order was completed in the period (null average)', () => {
      dashboard.getSummary.mockReturnValue(
        of({ ...summaryFixture, averageResolutionMinutes: null }),
      );
      start();

      expect(text('#summary-average')).toBe('Sin datos');
    });

    it('shows zeros, not blanks, when the API counts nothing', () => {
      dashboard.getSummary.mockReturnValue(
        of({
          ...summaryFixture,
          total: 0,
          open: 0,
          closedInPeriod: { completed: 0, cancelled: 0, total: 0 },
        }),
      );
      start();

      expect(text('#summary-total')).toBe('0');
      expect(text('#summary-closed')).toBe('0');
    });
  });

  describe('lists by status (spec 018, REQ-11.2 and 11.3)', () => {
    it('builds the board from the four filtered lists, closed ones included', () => {
      service.getAll.mockReturnValue(
        of([
          order('1'),
          order('2', { status: 'in-progress', takenBy: taken('2') }),
          order('3', closedAt('2', todayNoon)),
          order('4', { ...closedAt('2', todayNoon), status: 'cancelled' }),
        ]),
      );
      start();

      expect(text('#shift-pending-count')).toBe('1');
      expect(text('#shift-progress-count')).toBe('1');
      expect(text('#shift-closed-count')).toBe('2');
    });

    it('says how many are shown out of the total when a status has more than came back', () => {
      service.listByStatus.mockImplementation((status) =>
        of(status === 'pending' ? pageOf([order('1'), order('2')], 250) : pageOf([], 0)),
      );
      start();

      expect(text('#shift-pending-truncated')).toBe('Mostrando las primeras 2 de 250');
      expect(el('#shift-progress-truncated')).toBeNull();
      expect(el('#shift-closed-truncated')).toBeNull();
    });

    it('adds up completed and cancelled for the closed column notice', () => {
      service.listByStatus.mockImplementation((status) =>
        of(
          status === 'completed'
            ? pageOf([order('1', closedAt('2', todayNoon))], 150)
            : status === 'cancelled'
              ? pageOf([], 30)
              : pageOf([], 0),
        ),
      );
      start();

      expect(text('#shift-closed-truncated')).toBe('Mostrando las primeras 1 de 180');
    });

    it('shows no notice when everything came back', () => {
      service.getAll.mockReturnValue(of([order('1'), order('2')]));
      start();

      expect(el('#shift-pending-truncated')).toBeNull();
    });
  });

  describe('workload (spec 018, REQ-11.4 and 11.5)', () => {
    const workload: WorkloadItem[] = [
      { takenById: '5', takenByName: 'Técnico Electricista Preventivo', inProgress: 5 },
      { takenById: '4', takenByName: 'Técnico Mecánico de Guardia', inProgress: 2 },
    ];
    const administrador: AuthUser = {
      id: '1',
      username: 'admin',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    };

    it.each([
      ['administrador', administrador],
      ['team leader', { ...administrador, id: '3', role: 'team-leader-mantenimiento' } as AuthUser],
    ])('a %s asks for it and sees every technician with their count', (_label, user) => {
      currentUser.set(user);
      dashboard.getWorkload.mockReturnValue(of(workload));
      start();

      expect(dashboard.getWorkload).toHaveBeenCalledTimes(1);
      expect(
        all('#workload-list .shift__workload-name').map((item) => item.textContent?.trim()),
      ).toEqual(['Técnico Electricista Preventivo', 'Técnico Mecánico de Guardia']);
      expect(
        all('#workload-list .shift__workload-count').map((item) => item.textContent?.trim()),
      ).toEqual(['5', '2']);
    });

    it.each([
      ['a technician', tecnico],
      [
        'personal de producción',
        { ...administrador, id: '4', role: 'personal-produccion' } as AuthUser,
      ],
    ])('%s neither asks for it nor sees the section', (_label, user) => {
      currentUser.set(user);
      start();

      expect(dashboard.getWorkload).not.toHaveBeenCalled();
      expect(el('.shift__workload')).toBeNull();
    });

    it('says so when nobody has orders in progress', () => {
      currentUser.set(administrador);
      dashboard.getWorkload.mockReturnValue(of([]));
      start();

      expect(el('#workload-empty')).not.toBeNull();
      expect(el('#workload-list')).toBeNull();
    });

    it('shows the error state, not a half board, when the workload fails', () => {
      currentUser.set(administrador);
      dashboard.getWorkload.mockReturnValue(throwError(() => ({ status: 500 })));
      start();

      expect(el('app-alert')).not.toBeNull();
      expect(el('.shift__board')).toBeNull();
    });
  });

  describe('when any reading fails (spec 018, REQ-11.7)', () => {
    it('the summary failing shows the error with a retry, and no board', () => {
      dashboard.getSummary.mockReturnValue(throwError(() => ({ status: 500 })));
      start();

      expect(el('app-alert')?.textContent).toContain('No pudimos cargar el turno');
      expect(el('.shift__board')).toBeNull();
      expect(all('button').some((button) => button.textContent?.includes('Reintentar'))).toBe(true);
    });

    it('one list failing shows the error with a retry, and no board', () => {
      service.listByStatus.mockImplementation((status) =>
        status === 'cancelled' ? throwError(() => ({ status: 500 })) : of(pageOf([])),
      );
      start();

      expect(el('app-alert')).not.toBeNull();
      expect(el('.shift__board')).toBeNull();
    });

    it('retrying asks everything again', () => {
      dashboard.getSummary.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      start();

      all('button')
        .find((button) => button.textContent?.includes('Reintentar'))
        ?.click();
      fixture.detectChanges();

      expect(dashboard.getSummary).toHaveBeenCalledTimes(2);
      expect(service.listByStatus).toHaveBeenCalledTimes(8);
      expect(el('app-alert')).toBeNull();
      expect(el('.shift__board')).not.toBeNull();
    });
  });
});
