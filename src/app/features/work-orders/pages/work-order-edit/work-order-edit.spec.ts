import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { WorkOrderEdit } from './work-order-edit';
import { WorkOrderLoadError, WorkOrdersService } from '../../data-access/work-order.service';

describe('WorkOrderEdit', () => {
  let component: WorkOrderEdit;
  let fixture: ComponentFixture<WorkOrderEdit>;

  const mockWorkOrder = {
    id: '1',
    title: 'Orden de prueba',
    description: 'Descripción de prueba',
    asset: 'Máquina 1',
    priority: 'medium',
    status: 'pending',
  };

  const changedPayload = {
    title: 'Orden de prueba actualizada',
    description: 'Descripción de prueba',
    asset: 'Máquina 1',
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
});
