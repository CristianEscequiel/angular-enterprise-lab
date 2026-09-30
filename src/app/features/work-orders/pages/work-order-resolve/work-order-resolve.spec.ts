import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { AuthUser, TechnicianUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import {
  InvalidClosingNoteError,
  WorkOrderLoadError,
  WorkOrdersService,
  WorkOrderStateError,
} from '../../data-access/work-order.service';
import { WorkOrder, WorkOrderTaker } from '../../models/work-order.model';
import { MACHINE_REF_FIXTURE } from '../../testing/work-order.fixtures';
import { WorkOrderResolve } from './work-order-resolve';

// Guardia mecánica: atiende pronto-intervención.
const guardia: TechnicianUser = {
  id: '2',
  username: 'tecnico',
  displayName: 'Técnico Mecánico de Guardia',
  email: 'tecnico@enterprise-lab.dev',
  role: 'tecnico',
  legajo: '1001',
  specialty: 'mecanico',
  teamType: 'guardia',
};
const preventivo: TechnicianUser = {
  ...guardia,
  id: '5',
  username: 'electricista',
  displayName: 'Técnico Electricista Preventivo',
  legajo: '1002',
  specialty: 'electricista',
  teamType: 'preventivo-correctivo',
};
const teamLeader: AuthUser = {
  id: '3',
  username: 'teamleader',
  displayName: 'Team Leader',
  email: 'teamleader@enterprise-lab.dev',
  role: 'team-leader-mantenimiento',
};

const takenByGuardia: WorkOrderTaker = {
  id: guardia.id,
  name: guardia.displayName,
  at: '2026-09-25T10:00:00.000Z',
};

const inProgress: WorkOrder = {
  id: '7',
  title: 'Falla en cinta',
  description: 'La cinta transportadora se detuvo por completo.',
  machineRef: MACHINE_REF_FIXTURE,
  type: 'pronto-intervencion',
  priority: 'high',
  status: 'in-progress',
  createdAt: '2026-09-25T09:00:00Z',
  takenBy: takenByGuardia,
};

const VALID_COMMENT = 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.';

describe('WorkOrderResolve', () => {
  let fixture: ComponentFixture<WorkOrderResolve>;
  let component: WorkOrderResolve;

  const currentUser = signal<AuthUser | null>(guardia);
  const workOrdersServiceMock = {
    getById: vi.fn(),
    close: vi.fn(),
  };
  const routerMock = { navigate: vi.fn() };

  async function create(
    order: WorkOrder | null = inProgress,
    id: string | null = '7',
  ): Promise<void> {
    if (order) workOrdersServiceMock.getById.mockReturnValue(of(order));

    await TestBed.configureTestingModule({
      imports: [WorkOrderResolve],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id === null ? {} : { id }) } },
        },
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderResolve);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const host = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (host().textContent ?? '').replace(/\s+/g, ' ');
  const message = () => TestBed.inject(MessageService).message();
  const form = (): HTMLFormElement | null => host().querySelector('form');
  const outcomeSelect = (): HTMLSelectElement =>
    host().querySelector('#outcome') as HTMLSelectElement;
  const commentField = (): HTMLTextAreaElement =>
    host().querySelector('#comment') as HTMLTextAreaElement;

  function fill(outcome: string, comment: string): void {
    outcomeSelect().value = outcome;
    outcomeSelect().dispatchEvent(new Event('change'));
    commentField().value = comment;
    commentField().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submitForm(): void {
    form()?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    workOrdersServiceMock.getById.mockReset();
    workOrdersServiceMock.close
      .mockReset()
      .mockReturnValue(of({ ...inProgress, status: 'completed' }));
    routerMock.navigate.mockReset();
    currentUser.set(guardia);
  });

  describe('the order and its two controls', () => {
    it('shows the order read-only: title, machine path, failure comment, type, priority and description', async () => {
      await create();

      expect(text()).toContain('Falla en cinta');
      expect(text()).toContain(`Máquina / parte: ${MACHINE_REF_FIXTURE.breadcrumb}`);
      expect(host().querySelector('#machine-comment')?.textContent).toContain(
        MACHINE_REF_FIXTURE.comment,
      );
      expect(text()).toContain('Tipo: Pronto intervención');
      expect(text()).toContain('Prioridad: Alta');
      expect(text()).toContain('La cinta transportadora se detuvo por completo.');
    });

    it('has exactly two editable controls: the result select and the comment textarea', async () => {
      await create();

      const editable = host().querySelectorAll('form input, form select, form textarea');

      expect(Array.from(editable).map((element) => element.id)).toEqual(['outcome', 'comment']);
    });

    it('offers only completed and cancelled, with no default result', async () => {
      await create();

      expect(Array.from(outcomeSelect().options).map((option) => option.value)).toEqual([
        '',
        'completed',
        'cancelled',
      ]);
      expect(outcomeSelect().value).toBe('');
    });

    it('shows a counter of the characters written against the minimum of 50', async () => {
      await create();

      fill('', 'x'.repeat(23));

      expect(host().querySelector('#comment-counter')?.textContent).toContain('23 / 50 mínimo');
    });
  });

  describe('closing', () => {
    it.each(['completed', 'cancelled'])(
      'blocks a %s closing without a comment: no call to the service, visible error',
      async (outcome) => {
        await create();
        fill(outcome, '');

        submitForm();

        expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
        expect(host().querySelector('#comment-error')?.textContent).toContain('entre 50 y 500');
        expect(commentField().getAttribute('aria-invalid')).toBe('true');
        expect(commentField().getAttribute('aria-describedby')).toContain('comment-error');
      },
    );

    it('blocks the submit without a result, with a visible error', async () => {
      await create();
      fill('', VALID_COMMENT);

      submitForm();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
      expect(host().querySelector('#outcome-error')).not.toBeNull();
      expect(outcomeSelect().getAttribute('aria-invalid')).toBe('true');
    });

    it.each([
      ['49 characters', 'x'.repeat(49)],
      ['only spaces', ' '.repeat(80)],
      ['spaces around a short text', ' '.repeat(60) + 'x'.repeat(10)],
    ])('blocks a comment of %s', async (_label, comment) => {
      await create();
      fill('completed', comment);

      submitForm();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
    });

    it('accepts a comment of exactly 50 characters', async () => {
      await create();
      fill('completed', 'x'.repeat(50));

      submitForm();

      expect(workOrdersServiceMock.close).toHaveBeenCalledTimes(1);
    });

    it('closes with the chosen result and a note carrying the trimmed comment, author and date', async () => {
      await create();
      fill('cancelled', `  ${VALID_COMMENT}  `);

      submitForm();

      expect(workOrdersServiceMock.close).toHaveBeenCalledExactlyOnceWith('7', 'cancelled', {
        comment: VALID_COMMENT,
        authorId: guardia.id,
        authorName: guardia.displayName,
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('confirms and goes back to the list on success', async () => {
      await create();
      fill('completed', VALID_COMMENT);

      submitForm();

      expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders']);
      expect(message()?.variant).toBe('success');
    });

    it('sends a single close request when submitted twice while the first is pending', async () => {
      await create();
      workOrdersServiceMock.close.mockReturnValue(new Subject());
      fill('completed', VALID_COMMENT);

      submitForm();
      submitForm();
      fixture.detectChanges();

      expect(workOrdersServiceMock.close).toHaveBeenCalledTimes(1);
      expect(host().querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
    });

    it('can be retried after a failure', async () => {
      await create();
      workOrdersServiceMock.close.mockReturnValueOnce(throwError(() => new Error('offline')));
      fill('completed', VALID_COMMENT);

      submitForm();
      expect(component.isSubmitting()).toBe(false);
      expect(message()?.variant).toBe('error');
      expect(routerMock.navigate).not.toHaveBeenCalled();

      submitForm();
      expect(workOrdersServiceMock.close).toHaveBeenCalledTimes(2);
    });

    it('shows the reason when the service rejects the note', async () => {
      await create();
      workOrdersServiceMock.close.mockReturnValue(throwError(() => new InvalidClosingNoteError()));
      fill('completed', VALID_COMMENT);

      submitForm();

      expect(message()?.variant).toBe('error');
      expect(message()?.message).toBe('El comentario de cierre no es válido.');
    });

    it('does not call the service when submit() is invoked directly with a short comment', async () => {
      await create();
      component.form.setValue({ outcome: 'completed', comment: 'demasiado corto' });

      component.submit();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
    });

    it('does not call the service when submit() is invoked directly without a result', async () => {
      await create();
      component.form.setValue({ outcome: '', comment: VALID_COMMENT });

      component.submit();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
    });

    it.each(['not-in-progress', 'taken-by-other'] as const)(
      'when the order changed meanwhile (%s): warns, reloads and shows its real state, without overwriting',
      async (reason) => {
        await create();
        const released: WorkOrder = { ...inProgress, status: 'pending', takenBy: null };
        workOrdersServiceMock.close.mockReturnValue(
          throwError(() => new WorkOrderStateError(reason, null, 'pending')),
        );
        workOrdersServiceMock.getById.mockReturnValue(of(released));
        fill('completed', VALID_COMMENT);

        submitForm();

        expect(message()?.variant).toBe('warning');
        expect(message()?.title).toBe('No se pudo cerrar');
        expect(workOrdersServiceMock.getById).toHaveBeenCalledTimes(2);
        expect(routerMock.navigate).not.toHaveBeenCalled();
        // Liberada mientras el técnico escribía: el formulario desaparece.
        expect(form()).toBeNull();
        expect(text()).toContain('Tomá la orden desde el listado');
      },
    );
  });

  describe('who can close it', () => {
    it('shows a warning naming the technician who runs the order, and no form', async () => {
      await create({
        ...inProgress,
        takenBy: { ...takenByGuardia, id: '99', name: 'Otra Persona' },
      });

      expect(text()).toContain('La orden está siendo ejecutada por Otra Persona.');
      expect(form()).toBeNull();
    });

    it('does not name anybody when an in-progress order has no owner recorded (older data)', async () => {
      const { takenBy, ...withoutOwner } = inProgress;
      void takenBy;

      await create(withoutOwner);

      expect(text()).toContain('La orden ya está en ejecución.');
      expect(text()).not.toContain('ejecutada por');
      expect(form()).toBeNull();
    });

    it('shows no form for a pending order and points to the list', async () => {
      await create({ ...inProgress, status: 'pending', takenBy: null });

      expect(text()).toContain('Tomá la orden desde el listado');
      expect(form()).toBeNull();
    });

    it.each(['completed', 'cancelled'] as const)('shows no form for a %s order', async (status) => {
      await create({ ...inProgress, status });

      expect(text()).toContain('La orden ya fue cerrada.');
      expect(form()).toBeNull();
    });

    it('denies a technician whose team does not attend that order type', async () => {
      currentUser.set(preventivo);

      await create();

      expect(text()).toContain('No tiene permiso para cerrar esta orden.');
      expect(form()).toBeNull();
    });

    it.each<[string, AuthUser | null]>([
      ['a team leader', teamLeader],
      ['no session', null],
    ])('denies %s', async (_label, user) => {
      currentUser.set(user);

      await create();

      expect(text()).toContain('No tiene permiso para cerrar esta orden.');
      expect(form()).toBeNull();
    });

    it('does nothing when submit() is invoked before any order is loaded', async () => {
      workOrdersServiceMock.getById.mockReturnValue(
        throwError(() => new WorkOrderLoadError('connection', 'down')),
      );
      await create(null);

      component.submit();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
      expect(message()).toBeNull();
    });

    it('does nothing when submit() is invoked without a session', async () => {
      await create();
      currentUser.set(null);

      component.submit();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
    });

    it('does not close for someone who cannot, even if submit() is invoked', async () => {
      currentUser.set(preventivo);
      await create();
      component.form.setValue({ outcome: 'completed', comment: VALID_COMMENT });

      component.submit();

      expect(workOrdersServiceMock.close).not.toHaveBeenCalled();
      expect(message()?.title).toBe('Acceso denegado');
    });
  });

  describe('loading', () => {
    it('shows "not found" with a retry when the order does not exist', async () => {
      workOrdersServiceMock.getById.mockReturnValue(
        throwError(() => new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.')),
      );
      await create(null);

      expect(text()).toContain('Orden no encontrada');
      expect(form()).toBeNull();
    });

    it('shows a connection error, distinct from "not found", and retries', async () => {
      workOrdersServiceMock.getById.mockReturnValueOnce(
        throwError(() => new WorkOrderLoadError('connection', 'No se pudo conectar.')),
      );
      await create(null);
      expect(text()).toContain('Error de conexión');
      expect(text()).not.toContain('Orden no encontrada');

      workOrdersServiceMock.getById.mockReturnValueOnce(of(inProgress));
      component.retry();
      fixture.detectChanges();

      expect(workOrdersServiceMock.getById).toHaveBeenCalledTimes(2);
      expect(form()).not.toBeNull();
    });

    it('shows "not found" without asking the service when the route has no id', async () => {
      await create(null, null);

      expect(workOrdersServiceMock.getById).not.toHaveBeenCalled();
      expect(text()).toContain('Orden no encontrada');
      expect(component.access()).toBeNull();
    });

    it('goes back to the list from the header button', async () => {
      await create();

      component.navigateToWorkOrdersList();

      expect(routerMock.navigate).toHaveBeenCalledWith(['/work-orders']);
    });
  });
});
