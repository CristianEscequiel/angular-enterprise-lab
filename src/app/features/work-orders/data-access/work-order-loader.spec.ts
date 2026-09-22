import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { WorkOrder } from '../models/work-order.model';
import { WorkOrderLoader } from './work-order-loader';
import { WorkOrderLoadError, WorkOrdersService } from './work-order.service';

describe('WorkOrderLoader', () => {
  let loader: WorkOrderLoader;

  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  const service = {
    getById: vi.fn<(id: string) => Observable<WorkOrder>>(),
  };

  beforeEach(() => {
    service.getById.mockReset().mockReturnValue(of(order));

    TestBed.configureTestingModule({
      providers: [WorkOrderLoader, { provide: WorkOrdersService, useValue: service }],
    });
    loader = TestBed.inject(WorkOrderLoader);
  });

  it('sets the work order and clears any previous error on success', () => {
    loader.error.set('connection');
    loader.load('1');
    expect(loader.workOrder()).toEqual(order);
    expect(loader.error()).toBeNull();
  });

  it('sets a not-found error and clears the work order on a not-found failure', () => {
    service.getById.mockReturnValue(
      throwError(() => new WorkOrderLoadError('not-found', 'no existe')),
    );
    loader.load('missing');
    expect(loader.workOrder()).toBeNull();
    expect(loader.error()).toBe('not-found');
  });

  it('falls back to a connection error for an unrecognized failure', () => {
    service.getById.mockReturnValue(throwError(() => new Error('boom')));
    loader.load('1');
    expect(loader.error()).toBe('connection');
  });

  it('retry re-issues the request for the last id passed to load', () => {
    loader.load('42');
    service.getById.mockClear();
    loader.retry();
    expect(service.getById).toHaveBeenCalledExactlyOnceWith('42');
  });

  it('retry does nothing if load was never called', () => {
    loader.retry();
    expect(service.getById).not.toHaveBeenCalled();
  });
});
