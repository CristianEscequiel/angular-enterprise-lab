import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { routes } from './app.routes';
import { WorkOrdersService } from './features/work-orders/data-access/work-order.service';
import { WorkOrder } from './features/work-orders/models/work-order.model';

describe('app routes', () => {
  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  const workOrdersServiceMock = {
    getById: vi.fn().mockReturnValue(of(order)),
    searchByName: vi
      .fn()
      .mockReturnValue(
        of({ first: 1, prev: null, next: null, last: 1, pages: 1, items: 1, data: [order] }),
      ),
  };

  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    workOrdersServiceMock.getById.mockClear();

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
      ],
    });

    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it('renders NotFound for an undefined root route', async () => {
    await harness.navigateByUrl('/no-existe');

    expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
  });

  it('sets a distinct document title per route', async () => {
    expect.assertions(3);

    await harness.navigateByUrl('/dashboard');
    expect(document.title).toContain('Dashboard');

    await harness.navigateByUrl('/work-orders');
    expect(document.title).toContain('Órdenes de trabajo');

    await harness.navigateByUrl('/no-existe');
    expect(document.title).toContain('Página no encontrada');
  });

  it('renders NotFound for a work order id with an invalid format, without loading WorkOrderDetail', async () => {
    expect.assertions(2);

    await harness.navigateByUrl('/work-orders/abc');

    expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
    expect(workOrdersServiceMock.getById).not.toHaveBeenCalled();
  });

  it('resolves /work-orders/new to WorkOrderCreate', async () => {
    expect.assertions(2);

    await harness.navigateByUrl('/work-orders/new');

    expect(harness.routeNativeElement?.textContent).toContain('Crear Orden de Trabajo');
    expect(harness.routeNativeElement?.textContent).not.toContain('Página no encontrada');
  });

  it('still resolves numeric ids to WorkOrderDetail and WorkOrderEdit', async () => {
    expect.assertions(4);

    await harness.navigateByUrl('/work-orders/1');
    expect(harness.routeNativeElement?.textContent).not.toContain('Página no encontrada');
    expect(workOrdersServiceMock.getById).toHaveBeenCalledWith('1');

    await harness.navigateByUrl('/work-orders/1/edit');
    expect(harness.routeNativeElement?.textContent).not.toContain('Página no encontrada');
    expect(workOrdersServiceMock.getById).toHaveBeenCalledWith('1');
  });

  it("navigates back to /dashboard from the 404 page's link", async () => {
    await harness.navigateByUrl('/no-existe');
    expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');

    const link: HTMLAnchorElement | null = harness.routeNativeElement?.querySelector('a') ?? null;
    link?.click();
    await harness.fixture.whenStable();

    expect(router.url).toBe('/dashboard');
    expect(harness.routeNativeElement?.textContent).not.toContain('Página no encontrada');
  });
});
