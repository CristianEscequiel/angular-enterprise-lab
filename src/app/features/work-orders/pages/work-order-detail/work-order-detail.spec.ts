import { MACHINE_ONLY_REF_FIXTURE, MACHINE_REF_FIXTURE } from '../../testing/work-order.fixtures';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { WorkOrderDetail } from './work-order-detail';
import {
  WorkOrderLoadError,
  WorkOrdersService,
  WorkOrderStateError,
} from '../../data-access/work-order.service';

describe('WorkOrderDetail', () => {
  let component: WorkOrderDetail;
  let fixture: ComponentFixture<WorkOrderDetail>;

  const mockWorkOrder = {
    id: '1',
    title: 'Orden de prueba',
    description: 'Descripción de prueba',
    machineRef: MACHINE_REF_FIXTURE,
    type: 'pronto-intervencion',
    priority: 'medium',
    status: 'pending',
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
  const currentUser = signal<AuthUser | null>(administrador);

  const workOrdersServiceMock = {
    getById: vi.fn().mockReturnValue(of(mockWorkOrder)),
    cancel: vi.fn(),
  };
  const routerMock = {
    navigate: vi.fn(),
  };

  async function createComponent(id = '1', user: AuthUser | null = administrador): Promise<void> {
    currentUser.set(user);
    await TestBed.configureTestingModule({
      imports: [WorkOrderDetail],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id }),
            },
          },
        },
        {
          provide: WorkOrdersService,
          useValue: workOrdersServiceMock,
        },
        {
          provide: Router,
          useValue: routerMock,
        },
        {
          provide: AuthService,
          useValue: { currentUser: currentUser.asReadonly() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function clickRetry(): void {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const retryButton = buttons.find((button) => button.textContent?.includes('Reintentar'));
    retryButton?.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    workOrdersServiceMock.getById.mockReset().mockReturnValue(of(mockWorkOrder));
    workOrdersServiceMock.cancel.mockReset();
    routerMock.navigate.mockReset();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it.each([
    ['preventivo', 'Preventivo'],
    ['correctivo', 'Correctivo'],
    ['pronto-intervencion', 'Pronto intervención'],
  ])('renders the %s type as "%s"', async (type, label) => {
    expect.assertions(2);
    workOrdersServiceMock.getById.mockReturnValue(of({ ...mockWorkOrder, type }));
    await createComponent();

    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain(`Tipo: ${label}`);
    expect(text).not.toContain('undefined');
  });

  it('renders the work order normally on success', async () => {
    await createComponent();
    expect(fixture.nativeElement.textContent).toContain('Orden de prueba');
    expect(fixture.nativeElement.textContent).toContain(MACHINE_REF_FIXTURE.breadcrumb);
    expect(component.loadError()).toBeNull();
  });

  describe('machine reference (spec 013d)', () => {
    const text = (): string => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');

    it('shows the stored path and the failure comment in separate elements', async () => {
      expect.assertions(4);
      await createComponent();

      const comment = fixture.nativeElement.querySelector('#machine-comment') as HTMLElement;
      expect(comment.textContent).toContain(MACHINE_REF_FIXTURE.comment);
      expect(comment.textContent).not.toContain(MACHINE_REF_FIXTURE.breadcrumb);
      expect(text()).toContain(`Máquina / parte: ${MACHINE_REF_FIXTURE.breadcrumb}`);
      // El comentario no se mezcla en la línea de la ruta.
      expect(text()).not.toContain(
        `${MACHINE_REF_FIXTURE.breadcrumb} ${MACHINE_REF_FIXTURE.comment}`,
      );
    });

    it('shows the snapshot saved in the order, whatever the master says today', async () => {
      expect.assertions(1);
      workOrdersServiceMock.getById.mockReturnValue(
        of({
          ...mockWorkOrder,
          machineRef: {
            ...MACHINE_REF_FIXTURE,
            breadcrumb: 'Envasadora línea 1 > Nombre de antes',
          },
        }),
      );
      await createComponent();

      expect(text()).toContain('Envasadora línea 1 > Nombre de antes');
    });

    it('omits the comment line when the order has no comment', async () => {
      expect.assertions(2);
      workOrdersServiceMock.getById.mockReturnValue(
        of({ ...mockWorkOrder, machineRef: MACHINE_ONLY_REF_FIXTURE }),
      );
      await createComponent();

      expect(fixture.nativeElement.querySelector('#machine-comment')).toBeNull();
      expect(text()).toContain('Máquina / parte: Envasadora línea 1');
    });
  });

  // Spec 014 (REQ-4.4, 4.5): el detalle se lee de arriba abajo en un orden fijo.
  describe('layout (spec 014)', () => {
    const text = (): string => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    const order = { ...mockWorkOrder, createdAt: '2026-09-20T10:30:00.000Z' };
    const note = {
      comment: 'Se reemplazó el rodamiento delantero.',
      authorId: '2',
      authorName: 'Técnico Mecánico de Guardia',
      at: '2026-09-25T15:00:00.000Z',
    };

    const precedes = (first: Element, second: Element): boolean =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('opens with the order number and its status, then the title, then the facts', async () => {
      workOrdersServiceMock.getById.mockReturnValue(of(order));
      await createComponent();

      const summary = fixture.nativeElement.querySelector('.order-detail__summary') as Element;
      const title = fixture.nativeElement.querySelector('h2.card__header') as Element;
      const facts = fixture.nativeElement.querySelector('.card__content') as Element;

      expect(summary.textContent).toContain('Orden N.º 1');
      expect(precedes(summary, title)).toBe(true);
      expect(precedes(title, facts)).toBe(true);
    });

    it('lists machine, priority, type, creation date and description in that order', async () => {
      workOrdersServiceMock.getById.mockReturnValue(of(order));
      await createComponent();

      const body = text();
      const positions = [
        'Máquina / parte:',
        'Prioridad: Media',
        'Tipo: Pronto intervención',
        'Creada: 20/09/2026',
        order.description,
      ].map((fragment) => body.indexOf(fragment));

      expect(positions.every((position) => position >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it.each<[string, string, string]>([
      ['pending', 'Pendiente', 'badge--warning'],
      ['in-progress', 'En progreso', 'badge--info'],
      ['completed', 'Completada', 'badge--success'],
      ['cancelled', 'Cancelada', 'badge--error'],
    ])(
      'shows a %s order as "%s" in a badge, not as the raw status',
      async (status, label, cssClass) => {
        workOrdersServiceMock.getById.mockReturnValue(of({ ...order, status }));
        await createComponent();

        const badge = fixture.nativeElement.querySelector('.order-detail__summary .badge');
        expect(badge?.textContent?.trim()).toBe(label);
        expect(badge?.classList).toContain(cssClass);
        expect(text()).not.toContain(`Estado: ${status}`);
      },
    );

    it('shows the closing note as its own labelled block after the order facts', async () => {
      workOrdersServiceMock.getById.mockReturnValue(
        of({ ...order, status: 'completed', closingNote: note }),
      );
      await createComponent();

      const closing = fixture.nativeElement.querySelector('#closing-note') as HTMLElement;
      const facts = fixture.nativeElement.querySelector('.card__content') as Element;
      const title = fixture.nativeElement.querySelector(
        `#${closing.getAttribute('aria-labelledby')}`,
      );

      expect(closing.tagName).toBe('SECTION');
      expect(title?.textContent).toContain('Cierre de la orden');
      expect(precedes(facts, closing)).toBe(true);
    });

    it('shows no closing block on an order that was not closed', async () => {
      workOrdersServiceMock.getById.mockReturnValue(of(order));
      await createComponent();

      expect(fixture.nativeElement.querySelector('.order-detail__closing')).toBeNull();
    });
  });

  describe('who took it and how it was closed (spec 013d)', () => {
    const text = (): string => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    const taker = { id: '2', name: 'Técnico Mecánico de Guardia', at: '2026-09-25T13:00:00.000Z' };
    const note = {
      comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
      authorId: '2',
      authorName: 'Técnico Mecánico de Guardia',
      at: '2026-09-25T15:00:00.000Z',
    };

    it('shows nothing about an owner or a closing on a pending order (even a released one)', async () => {
      workOrdersServiceMock.getById.mockReturnValue(of({ ...mockWorkOrder, takenBy: null }));
      await createComponent();

      expect(fixture.nativeElement.querySelector('#taken-by')).toBeNull();
      expect(fixture.nativeElement.querySelector('#closing-note')).toBeNull();
    });

    it('shows who took an in-progress order, and no closing note', async () => {
      workOrdersServiceMock.getById.mockReturnValue(
        of({ ...mockWorkOrder, status: 'in-progress', takenBy: taker }),
      );
      await createComponent();

      expect(fixture.nativeElement.querySelector('#taken-by')?.textContent).toContain(
        'Tomada por: Técnico Mecánico de Guardia',
      );
      expect(fixture.nativeElement.querySelector('#closing-note')).toBeNull();
    });

    it.each(['completed', 'cancelled'])(
      'shows the comment, author and date of a %s order in their own element',
      async (status) => {
        workOrdersServiceMock.getById.mockReturnValue(
          of({ ...mockWorkOrder, status, takenBy: taker, closingNote: note }),
        );
        await createComponent();

        const closing = fixture.nativeElement.querySelector('#closing-note') as HTMLElement;
        expect(closing.textContent).toContain(note.comment);
        expect(closing.textContent).toContain('Cerrada por: Técnico Mecánico de Guardia');
        expect(closing.textContent).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
      },
    );

    it('keeps the technician comment apart from the failure comment and the machine path', async () => {
      workOrdersServiceMock.getById.mockReturnValue(
        of({ ...mockWorkOrder, status: 'completed', takenBy: taker, closingNote: note }),
      );
      await createComponent();

      const closing = fixture.nativeElement.querySelector('#closing-note') as HTMLElement;
      const failure = fixture.nativeElement.querySelector('#machine-comment') as HTMLElement;

      expect(closing.textContent).not.toContain(MACHINE_REF_FIXTURE.comment);
      expect(failure.textContent).not.toContain(note.comment);
      expect(text()).not.toContain(`${MACHINE_REF_FIXTURE.breadcrumb} ${note.comment}`);
    });
  });

  it('exposes the work order title as a heading, not a loose paragraph', async () => {
    await createComponent();

    const heading: HTMLElement | null = fixture.nativeElement.querySelector('h2.card__header');
    expect(heading?.textContent).toContain('Orden de prueba');
  });

  it('renders the not-found error state and no card when the id does not exist', async () => {
    expect.assertions(3);
    workOrdersServiceMock.getById.mockReturnValue(
      throwError(() => new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.')),
    );
    await createComponent('missing');

    expect(fixture.nativeElement.textContent).toContain('Orden no encontrada');
    expect(fixture.nativeElement.textContent).not.toContain('undefined');
    expect(fixture.nativeElement.querySelector('.card')).toBeNull();
  });

  it('renders a distinct connection error state on a network/server failure', async () => {
    expect.assertions(3);
    workOrdersServiceMock.getById.mockReturnValue(
      throwError(
        () => new WorkOrderLoadError('connection', 'No se pudo conectar con el servidor.'),
      ),
    );
    await createComponent();

    expect(fixture.nativeElement.textContent).toContain('Error de conexión');
    expect(fixture.nativeElement.textContent).not.toContain('Orden no encontrada');
    expect(fixture.nativeElement.querySelector('.card')).toBeNull();
  });

  it('retrying after an error re-fetches and renders the work order', async () => {
    expect.assertions(4);
    workOrdersServiceMock.getById.mockReturnValueOnce(
      throwError(
        () => new WorkOrderLoadError('connection', 'No se pudo conectar con el servidor.'),
      ),
    );
    await createComponent();
    expect(fixture.nativeElement.textContent).toContain('Error de conexión');

    workOrdersServiceMock.getById.mockReturnValueOnce(of(mockWorkOrder));
    clickRetry();

    expect(workOrdersServiceMock.getById).toHaveBeenCalledTimes(2);
    expect(component.loadError()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Orden de prueba');
  });

  it('navigates back to the work orders list', async () => {
    await createComponent();

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const backButton = buttons.find((button) => button.textContent?.includes('Volver a Lista'));
    backButton?.click();

    expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders']);
  });

  // Cancelar una orden pendiente (spec 019): administrador y team leader, con confirmación.
  describe('cancel order (spec 019)', () => {
    const pendingOrder = { ...mockWorkOrder, createdAt: '2026-09-20T10:30:00.000Z' };
    const cancelledResult = { ...pendingOrder, status: 'cancelled' };
    const message = () => TestBed.inject(MessageService).message();

    function pageButton(): HTMLButtonElement | undefined {
      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );

      return buttons.find(
        (button) =>
          button.textContent?.trim() === 'Cancelar orden' && !button.closest('[role="dialog"]'),
      );
    }

    function dialog(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    }

    function openFromPage(): void {
      const button = pageButton();
      if (!button) throw new Error('No hay el botón "Cancelar orden"');
      button.click();
      fixture.detectChanges();
    }

    function confirmInDialog(): void {
      const confirmButton = dialog()?.querySelector<HTMLButtonElement>(
        '.modal__actions .btn--danger',
      );
      if (!confirmButton) throw new Error('No se abrió el modal de cancelación');
      confirmButton.click();
      fixture.detectChanges();
    }

    function dismissInDialog(): void {
      const dismissButton = dialog()?.querySelector<HTMLButtonElement>(
        '.modal__actions .btn--secondary',
      );
      if (!dismissButton) throw new Error('No se abrió el modal de cancelación');
      dismissButton.click();
      fixture.detectChanges();
    }

    async function startAs(user: AuthUser | null, order: object = pendingOrder): Promise<void> {
      workOrdersServiceMock.getById.mockReturnValue(of(order));
      await createComponent('1', user);
    }

    describe('visibility of the button', () => {
      it.each<[string, AuthUser]>([
        ['administrador', administrador],
        ['team leader', teamLeader],
      ])('REQ-3.1: %s sees "Cancelar orden" on a pending order', async (_label, user) => {
        await startAs(user);

        expect(pageButton()).toBeDefined();
      });

      it.each<[string, AuthUser | null]>([
        ['tecnico', tecnico],
        ['personal-produccion', produccion],
        ['no session', null],
      ])('REQ-3.2: %s does not get the "Cancelar orden" button', async (_label, user) => {
        await startAs(user);

        expect(pageButton()).toBeUndefined();
      });

      it.each(['in-progress', 'completed', 'cancelled'])(
        'REQ-3.2: administrador does not get the button on a %s order',
        async (status) => {
          await startAs(administrador, { ...pendingOrder, status });

          expect(pageButton()).toBeUndefined();
        },
      );

      it('REQ-3.4: there is no button while the order is loading', async () => {
        workOrdersServiceMock.getById.mockReturnValue(new Subject());
        await createComponent('1', administrador);

        expect(pageButton()).toBeUndefined();
        expect(dialog()).toBeNull();
      });

      it.each<[string, WorkOrderLoadError]>([
        ['not-found', new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.')],
        ['connection', new WorkOrderLoadError('connection', 'No se pudo conectar.')],
      ])('REQ-3.4: there is no button when loading failed (%s)', async (_kind, error) => {
        workOrdersServiceMock.getById.mockReturnValue(throwError(() => error));
        await createComponent('1', administrador);

        expect(pageButton()).toBeUndefined();
      });
    });

    describe('confirmation modal', () => {
      it('REQ-2.3: pressing "Cancelar orden" opens a modal that names the order, without calling the API', async () => {
        await startAs(administrador);

        openFromPage();

        expect(component.cancelModalOpen()).toBe(true);
        expect(dialog()?.textContent).toContain('Orden de prueba');
        expect(workOrdersServiceMock.cancel).not.toHaveBeenCalled();
      });

      it('REQ-2.4: confirming calls cancel with the id of the order', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(of(cancelledResult));
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        expect(workOrdersServiceMock.cancel).toHaveBeenCalledExactlyOnceWith('1');
      });

      it('REQ-2.5: dismissing the modal makes no request and leaves the order unchanged', async () => {
        await startAs(administrador);

        openFromPage();
        dismissInDialog();

        expect(workOrdersServiceMock.cancel).not.toHaveBeenCalled();
        expect(dialog()).toBeNull();
        expect(
          fixture.nativeElement.querySelector('.order-detail__summary .badge')?.textContent?.trim(),
        ).toBe('Pendiente');
        expect(pageButton()).toBeDefined();
      });
    });

    describe('success', () => {
      it('REQ-2.6: closes the modal and shows a success toast', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(of(cancelledResult));
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        expect(component.cancelModalOpen()).toBe(false);
        expect(dialog()).toBeNull();
        expect(message()).toMatchObject({ variant: 'success', message: 'Orden cancelada.' });
      });

      it('REQ-3.3: shows the returned order as "Cancelada" and hides the button', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(of(cancelledResult));
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        const badge = fixture.nativeElement.querySelector('.order-detail__summary .badge');
        expect(badge?.textContent?.trim()).toBe('Cancelada');
        expect(badge?.classList).toContain('badge--error');
        expect(pageButton()).toBeUndefined();
      });
    });

    describe('errors', () => {
      it('REQ-5.2: a WorkOrderStateError shows its message, closes the modal and loads the order again', async () => {
        const stateError = new WorkOrderStateError('not-pending', null, 'in-progress');
        workOrdersServiceMock.cancel.mockReturnValue(throwError(() => stateError));
        await startAs(administrador);
        workOrdersServiceMock.getById.mockClear();
        workOrdersServiceMock.getById.mockReturnValue(
          of({ ...pendingOrder, status: 'in-progress' }),
        );

        openFromPage();
        confirmInDialog();

        expect(message()).toMatchObject({ variant: 'warning', message: stateError.message });
        expect(dialog()).toBeNull();
        expect(workOrdersServiceMock.getById).toHaveBeenCalledTimes(1);
        expect(
          fixture.nativeElement.querySelector('.order-detail__summary .badge')?.textContent?.trim(),
        ).toBe('En progreso');
        expect(pageButton()).toBeUndefined();
      });

      it('REQ-5.3: a not-found error shows the "Orden no encontrada" alert, closes the modal and leaves no button', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(
          throwError(() => new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.')),
        );
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        expect(fixture.nativeElement.textContent).toContain('Orden no encontrada');
        expect(dialog()).toBeNull();
        expect(pageButton()).toBeUndefined();
      });

      it('REQ-5.4: a 403 closes the modal and adds no message of its own', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(throwError(() => ({ status: 403 })));
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        expect(message()).toBeNull();
        expect(dialog()).toBeNull();
        expect(workOrdersServiceMock.cancel).toHaveBeenCalledExactlyOnceWith('1');
      });

      it('REQ-5.5: another error shows a generic connection toast and leaves the order unchanged', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(throwError(() => new Error('offline')));
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        expect(message()).toMatchObject({
          variant: 'error',
          message: 'No se pudo cancelar la orden. Verificá tu conexión e intentá nuevamente.',
        });
        expect(
          fixture.nativeElement.querySelector('.order-detail__summary .badge')?.textContent?.trim(),
        ).toBe('Pendiente');
        expect(pageButton()).toBeDefined();
        expect(pageButton()?.disabled).toBe(false);
      });
    });

    describe('double submit', () => {
      it('REQ-5.6: while the cancellation is in flight the button is disabled and a second confirmation sends nothing', async () => {
        workOrdersServiceMock.cancel.mockReturnValue(new Subject());
        await startAs(administrador);

        openFromPage();
        confirmInDialog();

        expect(pageButton()?.disabled).toBe(true);

        component.confirmCancel();

        expect(workOrdersServiceMock.cancel).toHaveBeenCalledTimes(1);
      });
    });

    describe('defense in depth', () => {
      it.each<[string, AuthUser | null]>([
        ['tecnico', tecnico],
        ['personal-produccion', produccion],
        ['no session', null],
      ])(
        'REQ-6.1: %s cannot open the modal even if openCancelModal is invoked',
        async (_l, user) => {
          await startAs(user);

          component.openCancelModal();
          fixture.detectChanges();

          expect(component.cancelModalOpen()).toBe(false);
          expect(dialog()).toBeNull();
          expect(workOrdersServiceMock.cancel).not.toHaveBeenCalled();
          expect(message()).toMatchObject({ variant: 'warning' });
        },
      );

      it('REQ-6.1: confirmCancel without permission makes no request and warns', async () => {
        await startAs(tecnico);

        component.confirmCancel();

        expect(workOrdersServiceMock.cancel).not.toHaveBeenCalled();
        expect(message()).toMatchObject({ variant: 'warning' });
      });
    });
  });
});
