import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { WorkOrderDetail } from './work-order-detail';
import { WorkOrderLoadError, WorkOrdersService } from '../../data-access/work-order.service';

describe('WorkOrderDetail', () => {
  let component: WorkOrderDetail;
  let fixture: ComponentFixture<WorkOrderDetail>;

  const mockWorkOrder = {
    id: '1',
    title: 'Orden de prueba',
    description: 'Descripción de prueba',
    asset: 'Máquina 1',
    priority: 'medium',
    status: 'pending',
  };

  const workOrdersServiceMock = {
    getById: vi.fn().mockReturnValue(of(mockWorkOrder)),
  };

  async function createComponent(id = '1'): Promise<void> {
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
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('renders the work order normally on success', async () => {
    await createComponent();
    expect(fixture.nativeElement.textContent).toContain('Orden de prueba');
    expect(fixture.nativeElement.textContent).toContain('Máquina 1');
    expect(component.loadError()).toBeNull();
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
});
