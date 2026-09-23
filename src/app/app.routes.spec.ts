import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { API_BASE_URL } from './core/config/api.config';
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
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    workOrdersServiceMock.getById.mockClear();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
      ],
    });

    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
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

  it('resolves /login to the login form and sets its document title', async () => {
    expect.assertions(4);

    await harness.navigateByUrl('/login');

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Iniciar sesión',
    );
    expect(harness.routeNativeElement?.querySelector('#username')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Página no encontrada');
    expect(document.title).toContain('Iniciar sesión');
  });

  it('returns to /work-orders/5 after logging in from the login url built for it', async () => {
    expect.assertions(4);
    const authService = TestBed.inject(AuthService);

    // Es la URL que va a construir el guard de spec 011 al bloquear /work-orders/5.
    await harness.navigateByUrl(router.serializeUrl(authService.loginUrlFor('/work-orders/5')));
    expect(router.url).toContain('/login');

    const page = harness.routeNativeElement;
    const username = page?.querySelector<HTMLInputElement>('#username');
    const password = page?.querySelector<HTMLInputElement>('#password');
    if (!page || !username || !password) {
      throw new Error('login form not rendered');
    }
    username.value = 'admin';
    username.dispatchEvent(new Event('input'));
    password.value = 'admin123';
    password.dispatchEvent(new Event('input'));
    page.querySelector('form')?.dispatchEvent(new Event('submit'));

    httpMock
      .expectOne((req) => req.url === `${API_BASE_URL}/users`)
      .flush([
        {
          id: '1',
          username: 'admin',
          password: 'admin123',
          displayName: 'Administrador',
          email: 'admin@enterprise-lab.dev',
        },
      ]);
    await harness.fixture.whenStable();

    expect(authService.isAuthenticated()).toBe(true);
    expect(router.url).toBe('/work-orders/5');
    expect(workOrdersServiceMock.getById).toHaveBeenCalledWith('5');
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
