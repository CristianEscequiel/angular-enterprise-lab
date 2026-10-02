import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { WorkOrderEdit } from './work-order-edit';
import { MessageService } from '@core/services/message.service';
import {
  WorkOrderLoadError,
  WorkOrdersService,
  WorkOrderValidationError,
} from '../../data-access/work-order.service';
import { WorkOrderFormValue } from '../../components/form/form';
import { MACHINE_REF_FIXTURE } from '../../testing/work-order.fixtures';

describe('WorkOrderEdit', () => {
  let component: WorkOrderEdit;
  let fixture: ComponentFixture<WorkOrderEdit>;

  const mockWorkOrder = {
    id: '1',
    title: 'Orden de prueba',
    description: 'Descripción de prueba',
    machineRef: MACHINE_REF_FIXTURE,
    type: 'correctivo',
    priority: 'medium',
    status: 'pending',
  };

  // Lo que emite el formulario: la máquina/parte viaja como campos sueltos (sin breadcrumb).
  const changedPayload: WorkOrderFormValue = {
    title: 'Orden de prueba actualizada',
    description: 'Descripción de prueba',
    machineId: MACHINE_REF_FIXTURE.machineId,
    partId: MACHINE_REF_FIXTURE.partId,
    comment: MACHINE_REF_FIXTURE.comment,
    type: 'correctivo',
    priority: 'medium',
  };

  const workOrdersServiceMock = {
    getById: vi.fn().mockReturnValue(of(mockWorkOrder)),
    update: vi.fn().mockReturnValue(of(mockWorkOrder)),
  };
  const routerMock = {
    navigate: vi.fn(),
  };

  async function createComponent(id = '1'): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [WorkOrderEdit],
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderEdit);
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
    workOrdersServiceMock.update.mockReset().mockReturnValue(of(mockWorkOrder));
    routerMock.navigate.mockReset();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('loads the work order using the route id', async () => {
    await createComponent('1');
    expect(workOrdersServiceMock.getById).toHaveBeenCalledExactlyOnceWith('1');
    expect(fixture.nativeElement.querySelector('app-form')).not.toBeNull();
  });

  it('renders the not-found error state instead of an empty form when the id does not exist', async () => {
    expect.assertions(3);
    workOrdersServiceMock.getById.mockReturnValue(
      throwError(() => new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.')),
    );
    await createComponent('missing');

    expect(fixture.nativeElement.textContent).toContain('Orden no encontrada');
    expect(fixture.nativeElement.querySelector('app-form')).toBeNull();
    expect(component.workOrder()).toBeNull();
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
    expect(fixture.nativeElement.querySelector('app-form')).toBeNull();
  });

  it('retrying after an error re-fetches and renders the form with the loaded data', async () => {
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
    expect(fixture.nativeElement.querySelector('app-form')).not.toBeNull();
  });

  it('sends a single update request when a second submit arrives while the first is still pending', async () => {
    await createComponent();
    const pending = new Subject();
    workOrdersServiceMock.update.mockReturnValue(pending);

    component.onSubmitEdit(changedPayload);
    component.onSubmitEdit(changedPayload);

    expect(workOrdersServiceMock.update).toHaveBeenCalledTimes(1);
  });

  it('re-enables submitting after a failed update so a retry is possible', async () => {
    expect.assertions(2);
    await createComponent();
    workOrdersServiceMock.update.mockReturnValueOnce(throwError(() => new Error('boom')));

    component.onSubmitEdit(changedPayload);
    expect(component.isSubmitting()).toBe(false);

    workOrdersServiceMock.update.mockReturnValueOnce(of(mockWorkOrder));
    component.onSubmitEdit(changedPayload);
    expect(workOrdersServiceMock.update).toHaveBeenCalledTimes(2);
  });

  describe('machine reference', () => {
    it('shows the stored path and comment read-only, without a machine selector', async () => {
      expect.assertions(3);
      await createComponent();

      expect(fixture.nativeElement.querySelector('#machine-select')).toBeNull();
      expect(fixture.nativeElement.querySelector('#machine-locked')?.textContent).toContain(
        MACHINE_REF_FIXTURE.breadcrumb,
      );
      expect(fixture.nativeElement.querySelector('#comment-locked')?.textContent).toContain(
        MACHINE_REF_FIXTURE.comment,
      );
    });

    it('sends no machine, part, comment or breadcrumb in the PUT: they cannot change', async () => {
      expect.assertions(2);
      await createComponent();

      component.onSubmitEdit({
        ...changedPayload,
        machineId: '2',
        partId: '9',
        comment: 'Otro comentario',
      });

      const sent = workOrdersServiceMock.update.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(Object.keys(sent).sort()).toEqual(['description', 'priority', 'title']);
      expect(sent).not.toHaveProperty('machineRef');
    });

    it('does not treat a machine-only difference as a change', async () => {
      expect.assertions(2);
      await createComponent();

      component.onSubmitEdit({
        title: mockWorkOrder.title,
        description: mockWorkOrder.description,
        machineId: '2',
        partId: null,
        comment: 'Otro comentario',
        type: 'correctivo',
        priority: 'medium',
      });

      expect(workOrdersServiceMock.update).not.toHaveBeenCalled();
      expect(TestBed.inject(MessageService).message()?.message).toBe('No hubo cambios en la orden');
    });
  });

  describe('owner, status and closing note (spec 013d)', () => {
    const takenBy = {
      id: '2',
      name: 'Técnico Mecánico de Guardia',
      at: '2026-09-25T13:00:00.000Z',
    };
    const closingNote = {
      comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
      authorId: '2',
      authorName: 'Técnico Mecánico de Guardia',
      at: '2026-09-25T15:00:00.000Z',
    };

    // El dueño, el estado y la nota de cierre cambian solo por tomar, cerrar y liberar: el PUT nunca
    // los lleva, en ningún estado de la orden.
    it.each([
      ['pending', {}],
      ['in-progress', { takenBy }],
      ['completed', { takenBy, closingNote }],
      ['cancelled', { takenBy, closingNote }],
    ])('edits a %s order sending only title, description and priority', async (status, extra) => {
      expect.assertions(1);
      workOrdersServiceMock.getById.mockReturnValue(of({ ...mockWorkOrder, status, ...extra }));
      await createComponent();

      component.onSubmitEdit(changedPayload);

      expect(workOrdersServiceMock.update).toHaveBeenCalledExactlyOnceWith('1', {
        title: 'Orden de prueba actualizada',
        description: 'Descripción de prueba',
        priority: 'medium',
      });
    });
  });

  describe('order type', () => {
    function typeSelect(): HTMLSelectElement {
      const select = fixture.nativeElement.querySelector('#type') as HTMLSelectElement | null;
      if (!select) throw new Error('No se renderizó el select de tipo');
      return select;
    }

    it('shows the stored type in a disabled select', async () => {
      expect.assertions(2);
      await createComponent();

      expect(typeSelect().value).toBe('correctivo');
      expect(typeSelect().disabled).toBe(true);
    });

    it('never sends a type: not the stored one nor a different one', async () => {
      expect.assertions(3);
      await createComponent();

      component.onSubmitEdit({ ...changedPayload, type: 'pronto-intervencion' });

      expect(workOrdersServiceMock.update).toHaveBeenCalledTimes(1);
      const sent = workOrdersServiceMock.update.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(sent).not.toHaveProperty('type');
      expect(sent['title']).toBe('Orden de prueba actualizada');
    });

    it('does not treat a type-only difference as a change', async () => {
      expect.assertions(2);
      await createComponent();

      component.onSubmitEdit({
        title: mockWorkOrder.title,
        description: mockWorkOrder.description,
        machineId: MACHINE_REF_FIXTURE.machineId,
        partId: MACHINE_REF_FIXTURE.partId,
        comment: MACHINE_REF_FIXTURE.comment,
        type: 'pronto-intervencion',
        priority: 'medium',
      });

      expect(workOrdersServiceMock.update).not.toHaveBeenCalled();
      expect(TestBed.inject(MessageService).message()?.message).toBe('No hubo cambios en la orden');
    });

    it('submits only the editable fields when the form is sent from the screen', async () => {
      expect.assertions(1);
      await createComponent();
      const title = fixture.nativeElement.querySelector('#title') as HTMLInputElement;
      title.value = 'Título modificado desde la pantalla';
      title.dispatchEvent(new Event('input'));

      fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

      expect(workOrdersServiceMock.update).toHaveBeenCalledExactlyOnceWith('1', {
        title: 'Título modificado desde la pantalla',
        description: 'Descripción de prueba',
        priority: 'medium',
      });
    });
  });

  describe('errors answered by the API', () => {
    it('a 404 on save shows the not-found state instead of the form', async () => {
      expect.assertions(3);
      await createComponent();
      workOrdersServiceMock.update.mockReturnValue(
        throwError(() => new WorkOrderLoadError('not-found', 'La orden de trabajo no existe.')),
      );

      component.onSubmitEdit(changedPayload);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Orden no encontrada');
      expect(fixture.nativeElement.querySelector('app-form')).toBeNull();
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('a validation error shows each message next to its field and keeps the form', async () => {
      expect.assertions(3);
      await createComponent();
      workOrdersServiceMock.update.mockReturnValue(
        throwError(
          () => new WorkOrderValidationError({ title: 'Debe tener entre 3 y 150 caracteres' }),
        ),
      );

      component.onSubmitEdit(changedPayload);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#title-server-error')?.textContent).toContain(
        'entre 3 y 150',
      );
      expect(fixture.nativeElement.querySelector('app-form')).not.toBeNull();
      expect(TestBed.inject(MessageService).message()).toBeNull();
    });

    it('a 403 adds no message of its own and keeps the screen as it is', async () => {
      expect.assertions(3);
      await createComponent();
      workOrdersServiceMock.update.mockReturnValue(throwError(() => ({ status: 403 })));

      component.onSubmitEdit(changedPayload);
      fixture.detectChanges();

      expect(TestBed.inject(MessageService).message()).toBeNull();
      expect(fixture.nativeElement.querySelector('app-form')).not.toBeNull();
      expect(component.isSubmitting()).toBe(false);
    });

    it('any other failure shows the generic error', async () => {
      await createComponent();
      workOrdersServiceMock.update.mockReturnValue(throwError(() => ({ status: 500 })));

      component.onSubmitEdit(changedPayload);

      expect(TestBed.inject(MessageService).message()).toMatchObject({
        variant: 'error',
        message: 'Error actualizando la orden de trabajo',
      });
    });
  });
});
