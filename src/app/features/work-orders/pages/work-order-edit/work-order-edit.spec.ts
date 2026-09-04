import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { WorkOrderEdit } from './work-order-edit';
import { WorkOrdersService } from '../../data-access/work-order.service';

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

  const workOrdersServiceMock = {
    getById: vi.fn().mockReturnValue(of(mockWorkOrder)),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkOrderEdit],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                id: '1',
              }),
            },
          },
        },
        {
          provide: WorkOrdersService,
          useValue: workOrdersServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderEdit);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // it('should load work order using route id', () => {
  //   expect(workOrdersServiceMock.getById).toHaveBeenCalledWith('1');
  // });
});
