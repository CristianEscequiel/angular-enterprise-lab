import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { WorkOrderEdit } from './work-order-edit';
import { MessageService } from '@core/services/message.service';
import { WorkOrderLoadError, WorkOrdersService } from '../../data-access/work-order.service';
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

    it('keeps the original machineRef in the PUT when the rest of the order changes', async () => {
      expect.assertions(1);
      await createComponent();

      component.onSubmitEdit(changedPayload);

      expect(workOrdersServiceMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ machineRef: MACHINE_REF_FIXTURE }),
      );
    });

    // Aunque el formulario emitiera otra máquina/parte (p. ej. manipulando el DOM), la página no la envía.
    it('never sends a machine, part or comment different from the stored ones', async () => {
      expect.assertions(2);
      await createComponent();

      component.onSubmitEdit({
        ...changedPayload,
        machineId: '2',
        partId: '9',
        comment: 'Otro comentario',
      });

      const sent = workOrdersServiceMock.update.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(sent['machineRef']).toEqual(MACHINE_REF_FIXTURE);
      // Los campos sueltos del formulario no son campos de la orden.
      expect(Object.keys(sent)).not.toEqual(expect.arrayContaining(['machineId', 'partId']));
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

  describe('owner and closing note (spec 013d)', () => {
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

    it.each([
      ['in-progress', { takenBy }],
      ['completed', { takenBy, closingNote }],
      ['cancelled', { takenBy, closingNote }],
    ])('keeps takenBy and closingNote in the PUT of a %s order', async (status, extra) => {
      workOrdersServiceMock.getById.mockReturnValue(of({ ...mockWorkOrder, status, ...extra }));
      await createComponent();

      component.onSubmitEdit(changedPayload);

      expect(workOrdersServiceMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ status, ...extra }),
      );
    });

    it('does not touch the status while editing', async () => {
      await createComponent();

      component.onSubmitEdit(changedPayload);

      expect(workOrdersServiceMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ status: 'pending' }),
      );
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

    it('keeps the original type in the PUT when the rest of the order changes', async () => {
      expect.assertions(2);
      await createComponent();

      component.onSubmitEdit(changedPayload);

      expect(workOrdersServiceMock.update).toHaveBeenCalledTimes(1);
      expect(workOrdersServiceMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          id: '1',
          title: 'Orden de prueba actualizada',
          type: 'correctivo',
        }),
      );
    });

    // Aunque el formulario emitiera otro tipo (p. ej. manipulando el DOM), la página no lo envía.
    it('never sends a type different from the stored one', async () => {
      expect.assertions(1);
      await createComponent();

      component.onSubmitEdit({ ...changedPayload, type: 'pronto-intervencion' });

      expect(workOrdersServiceMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ type: 'correctivo' }),
      );
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

    it('sends the stored type when the form is submitted from the screen', async () => {
      expect.assertions(1);
      await createComponent();
      const title = fixture.nativeElement.querySelector('#title') as HTMLInputElement;
      title.value = 'Título modificado desde la pantalla';
      title.dispatchEvent(new Event('input'));

      fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

      expect(workOrdersServiceMock.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          title: 'Título modificado desde la pantalla',
          type: 'correctivo',
        }),
      );
    });
  });
});
