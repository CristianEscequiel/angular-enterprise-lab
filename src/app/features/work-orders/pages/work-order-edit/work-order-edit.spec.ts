import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { WorkOrderEdit } from './work-order-edit';
import { MessageService } from '@core/services/message.service';
import { WorkOrderLoadError, WorkOrdersService } from '../../data-access/work-order.service';

describe('WorkOrderEdit', () => {
  let component: WorkOrderEdit;
  let fixture: ComponentFixture<WorkOrderEdit>;

  const mockWorkOrder = {
    id: '1',
    title: 'Orden de prueba',
    description: 'Descripción de prueba',
    asset: 'Máquina 1',
    type: 'correctivo',
    priority: 'medium',
    status: 'pending',
  };

  const changedPayload = {
    title: 'Orden de prueba actualizada',
    description: 'Descripción de prueba',
    asset: 'Máquina 1',
    type: 'correctivo' as const,
    priority: 'medium' as const,
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
        asset: mockWorkOrder.asset,
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
