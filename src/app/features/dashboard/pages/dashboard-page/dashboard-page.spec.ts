import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { WorkOrdersService } from '@features/work-orders/data-access/work-order.service';
import { WorkOrder } from '@features/work-orders/models/work-order.model';
import { MACHINE_REF_FIXTURE } from '@features/work-orders/testing/work-order.fixtures';
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
  const service = { getAll: vi.fn<() => Observable<WorkOrder[]>>() };

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

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        { provide: WorkOrdersService, useValue: service },
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
      fixture.detectChanges();

      expect(el('p[role="status"]')).toBeNull();
      expect(el('.shift__board')).not.toBeNull();
    });

    it('asks for the orders once on open', () => {
      start();

      expect(service.getAll).toHaveBeenCalledTimes(1);
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

      expect(service.getAll).toHaveBeenCalledTimes(2);
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

      expect(service.getAll).toHaveBeenCalledTimes(2);
      expect(el('app-alert')).not.toBeNull();
      expect(el('.shift__board')).toBeNull();
    });
  });
});
