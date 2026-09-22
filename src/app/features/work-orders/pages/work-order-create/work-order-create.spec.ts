import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { WorkOrderCreate } from './work-order-create';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder, WorkOrderCreateRequest } from '../../models/work-order.model';

describe('WorkOrderCreate', () => {
  let component: WorkOrderCreate;
  let fixture: ComponentFixture<WorkOrderCreate>;

  const payload: WorkOrderCreateRequest = {
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    priority: 'medium',
  };

  const created: WorkOrder = {
    id: '1',
    ...payload,
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  const workOrdersServiceMock = {
    create: vi.fn<(...args: unknown[]) => Observable<WorkOrder>>(),
  };
  const routerMock = {
    navigate: vi.fn(),
  };

  beforeEach(async () => {
    workOrdersServiceMock.create.mockReset().mockReturnValue(of(created));
    routerMock.navigate.mockReset();

    await TestBed.configureTestingModule({
      imports: [WorkOrderCreate],
      providers: [
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderCreate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('creates the work order and navigates to the list on success', () => {
    component.onSubmit(payload);

    expect(workOrdersServiceMock.create).toHaveBeenCalledExactlyOnceWith(payload);
    expect(routerMock.navigate).toHaveBeenCalledExactlyOnceWith(['/work-orders']);
  });

  it('sends a single create request when a second submit arrives while the first is still pending', () => {
    const pending = new Subject<WorkOrder>();
    workOrdersServiceMock.create.mockReturnValue(pending);

    component.onSubmit(payload);
    component.onSubmit(payload);

    expect(workOrdersServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it('re-enables submitting after a failed create so a retry is possible', () => {
    expect.assertions(2);
    workOrdersServiceMock.create.mockReturnValueOnce(throwError(() => new Error('boom')));

    component.onSubmit(payload);
    expect(component.isSubmitting()).toBe(false);

    workOrdersServiceMock.create.mockReturnValueOnce(of(created));
    component.onSubmit(payload);
    expect(workOrdersServiceMock.create).toHaveBeenCalledTimes(2);
  });

  it("reflects the pending state on the nested form's submit button", () => {
    expect.assertions(2);
    const pending = new Subject<WorkOrder>();
    workOrdersServiceMock.create.mockReturnValue(pending);

    component.onSubmit(payload);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const submitButton = buttons.find((button) => button.textContent?.includes('Guardando'));
    expect(submitButton).toBeDefined();
    expect(submitButton?.disabled).toBe(true);
  });
});
