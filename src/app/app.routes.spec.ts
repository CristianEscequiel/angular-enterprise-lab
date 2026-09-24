import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { routes } from './app.routes';
import { AuthSession, UserRecord } from './core/auth/auth.model';
import { AUTH_STORAGE_KEY, AuthService } from './core/auth/auth.service';
import { API_BASE_URL } from './core/config/api.config';
import { MessageService } from './core/services/message.service';
import { WorkOrdersService } from './features/work-orders/data-access/work-order.service';
import { WorkOrder } from './features/work-orders/models/work-order.model';

describe('app routes', () => {
  const order: WorkOrder = {
    id: '1',
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    asset: 'Motor 1',
    type: 'correctivo',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00Z',
  };

  const session: AuthSession = {
    token: 'mock-token.1.1700000000000',
    user: {
      id: '1',
      username: 'admin',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    },
  };

  const workOrdersServiceMock = {
    getById: vi.fn().mockReturnValue(of(order)),
    search: vi
      .fn()
      .mockReturnValue(
        of({ first: 1, prev: null, next: null, last: 1, pages: 1, items: 1, data: [order] }),
      ),
  };

  let harness: RouterTestingHarness;
  let router: Router;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  // Cada test arranca con sesión activa; los de "sin sesión" la cierran en su propio beforeEach.
  beforeEach(async () => {
    workOrdersServiceMock.getById.mockClear();
    workOrdersServiceMock.search.mockClear();
    localStorage.clear();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));

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
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function pathname(): string {
    return router.url.split('?')[0] ?? '';
  }

  function returnUrl(): string | null {
    return router.parseUrl(router.url).queryParamMap.get('returnUrl');
  }

  const users = {
    admin: {
      id: '1',
      username: 'admin',
      password: 'admin123',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    },
    teamLeader: {
      id: '3',
      username: 'teamleader',
      password: 'teamleader123',
      displayName: 'Team Leader',
      email: 'teamleader@enterprise-lab.dev',
      role: 'team-leader-mantenimiento',
    },
    produccion: {
      id: '4',
      username: 'produccion',
      password: 'produccion123',
      displayName: 'Producción',
      email: 'produccion@enterprise-lab.dev',
      role: 'personal-produccion',
    },
    tecnico: {
      id: '2',
      username: 'tecnico',
      password: 'tecnico123',
      displayName: 'Técnico',
      email: 'tecnico@enterprise-lab.dev',
      role: 'tecnico',
      legajo: '1001',
    },
  } satisfies Record<string, UserRecord>;

  // Reemplaza la sesión del beforeEach por la de otro usuario, por el mismo camino que el login real.
  function loginAs(record: UserRecord): void {
    authService.logout();
    authService.login({ username: record.username, password: record.password }).subscribe();
    httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`).flush([record]);

    // El técnico completa su perfil con el maestro (`/tecnicos/:legajo`).
    if (record.role === 'tecnico') {
      httpMock
        .expectOne(`${API_BASE_URL}/tecnicos/${record.legajo}`)
        .flush({ specialty: 'mecanico', teamType: 'guardia' });
    }
  }

  describe('with an active session', () => {
    it('renders NotFound for an undefined root route', async () => {
      await harness.navigateByUrl('/no-existe');

      expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
    });

    it('lets the user into /work-orders without redirecting', async () => {
      expect.assertions(3);

      await harness.navigateByUrl('/work-orders');

      expect(router.url).toBe('/work-orders');
      expect(workOrdersServiceMock.search).toHaveBeenCalled();
      expect(harness.routeNativeElement?.textContent).not.toContain('Iniciar sesión');
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

    it('resolves /work-orders/new to WorkOrderCreate for a role that can create orders', async () => {
      expect.assertions(2);
      loginAs(users.teamLeader);

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

    it('redirects /login to /dashboard without rendering the login form', async () => {
      expect.assertions(3);

      await harness.navigateByUrl('/login');

      expect(router.url).toBe('/dashboard');
      expect(harness.routeNativeElement?.querySelector('#username')).toBeNull();
      expect(harness.routeNativeElement?.textContent).not.toContain('Iniciar sesión');
    });

    it('redirects /login to a valid returnUrl instead of showing the form', async () => {
      expect.assertions(2);

      await harness.navigateByUrl('/login?returnUrl=%2Fwork-orders%2F5');

      expect(router.url).toBe('/work-orders/5');
      expect(harness.routeNativeElement?.querySelector('#username')).toBeNull();
    });

    it('ignores an external returnUrl when redirecting away from /login', async () => {
      await harness.navigateByUrl('/login?returnUrl=%2F%2Fevil.com');

      expect(router.url).toBe('/dashboard');
    });

    it('protects navigation between children once the session is gone', async () => {
      expect.assertions(3);
      await harness.navigateByUrl('/work-orders');
      expect(router.url).toBe('/work-orders');

      authService.logout();
      await harness.navigateByUrl('/work-orders/1');

      expect(pathname()).toBe('/login');
      expect(returnUrl()).toBe('/work-orders/1');
    });
  });

  describe('without a session', () => {
    beforeEach(() => {
      authService.logout();
    });

    it('redirects /work-orders to login keeping the url for the return', async () => {
      expect.assertions(4);

      await harness.navigateByUrl('/work-orders');

      expect(pathname()).toBe('/login');
      expect(returnUrl()).toBe('/work-orders');
      expect(harness.routeNativeElement?.querySelector('#username')).not.toBeNull();
      expect(workOrdersServiceMock.search).not.toHaveBeenCalled();
    });

    it.each(['/dashboard', '/work-orders/new', '/work-orders/5', '/work-orders/5/edit'])(
      'redirects %s to login with that url as returnUrl',
      async (url) => {
        expect.assertions(3);

        await harness.navigateByUrl(url);

        expect(pathname()).toBe('/login');
        expect(returnUrl()).toBe(url);
        expect(workOrdersServiceMock.getById).not.toHaveBeenCalled();
      },
    );

    it('returns to /work-orders/5 after logging in from the redirect made by the guard', async () => {
      expect.assertions(4);

      await harness.navigateByUrl('/work-orders/5');
      expect(pathname()).toBe('/login');

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
            role: 'administrador',
          },
        ]);
      await harness.fixture.whenStable();

      expect(authService.isAuthenticated()).toBe(true);
      expect(router.url).toBe('/work-orders/5');
      expect(workOrdersServiceMock.getById).toHaveBeenCalledWith('5');
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

    it('keeps the 404 page public', async () => {
      expect.assertions(2);

      await harness.navigateByUrl('/no-existe');

      expect(router.url).toBe('/no-existe');
      expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
    });
  });

  describe('role restrictions on work order routes', () => {
    function deniedWarning() {
      return TestBed.inject(MessageService).message();
    }

    it.each([
      ['team leader', users.teamLeader],
      ['personal-produccion', users.produccion],
    ])('lets %s into /work-orders/new', async (_label, record) => {
      expect.assertions(3);
      loginAs(record);

      await harness.navigateByUrl('/work-orders/new');

      expect(router.url).toBe('/work-orders/new');
      expect(harness.routeNativeElement?.textContent).toContain('Crear Orden de Trabajo');
      expect(deniedWarning()).toBeNull();
    });

    it.each([
      ['administrador', users.admin],
      ['tecnico', users.tecnico],
    ])(
      'sends %s away from /work-orders/new to /dashboard with a warning',
      async (_label, record) => {
        expect.assertions(4);
        loginAs(record);

        await harness.navigateByUrl('/work-orders/new');

        expect(router.url).toBe('/dashboard');
        expect(harness.routeNativeElement?.textContent).not.toContain('Crear Orden de Trabajo');
        expect(deniedWarning()?.variant).toBe('warning');
        expect(deniedWarning()?.title).toBe('Acceso denegado');
      },
    );

    it.each([
      ['team leader', users.teamLeader],
      ['administrador', users.admin],
    ])('lets %s edit an order', async (_label, record) => {
      expect.assertions(3);
      loginAs(record);

      await harness.navigateByUrl('/work-orders/1/edit');

      expect(router.url).toBe('/work-orders/1/edit');
      expect(workOrdersServiceMock.getById).toHaveBeenCalledWith('1');
      expect(deniedWarning()).toBeNull();
    });

    it.each([
      ['personal-produccion', users.produccion],
      ['tecnico', users.tecnico],
    ])(
      'sends %s away from /work-orders/1/edit to /dashboard with a warning',
      async (_label, record) => {
        expect.assertions(3);
        loginAs(record);

        await harness.navigateByUrl('/work-orders/1/edit');

        expect(router.url).toBe('/dashboard');
        expect(workOrdersServiceMock.getById).not.toHaveBeenCalled();
        expect(deniedWarning()?.title).toBe('Acceso denegado');
      },
    );

    // Lo que no se restringe: ver el listado y el detalle sigue abierto a cualquier rol con sesión.
    it.each(Object.entries(users))(
      'still lets %s view the list and the detail',
      async (_name, record) => {
        expect.assertions(3);
        loginAs(record);

        await harness.navigateByUrl('/work-orders');
        expect(router.url).toBe('/work-orders');

        await harness.navigateByUrl('/work-orders/1');
        expect(router.url).toBe('/work-orders/1');
        expect(deniedWarning()).toBeNull();
      },
    );

    // /dashboard es el destino del rechazo: si se restringiera, el rechazo entraría en bucle.
    it.each(Object.entries(users))('never restricts /dashboard (%s)', async (_name, record) => {
      loginAs(record);

      await harness.navigateByUrl('/dashboard');

      expect(router.url).toBe('/dashboard');
    });

    it('sends an anonymous user to login and, after logging in as produccion, returns to /work-orders/new', async () => {
      expect.assertions(5);
      authService.logout();

      await harness.navigateByUrl('/work-orders/new');
      expect(pathname()).toBe('/login');
      expect(returnUrl()).toBe('/work-orders/new');

      const page = harness.routeNativeElement;
      const username = page?.querySelector<HTMLInputElement>('#username');
      const password = page?.querySelector<HTMLInputElement>('#password');
      if (!page || !username || !password) {
        throw new Error('login form not rendered');
      }
      username.value = users.produccion.username;
      username.dispatchEvent(new Event('input'));
      password.value = users.produccion.password;
      password.dispatchEvent(new Event('input'));
      page.querySelector('form')?.dispatchEvent(new Event('submit'));

      httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`).flush([users.produccion]);
      await harness.fixture.whenStable();

      expect(router.url).toBe('/work-orders/new');
      expect(harness.routeNativeElement?.textContent).toContain('Crear Orden de Trabajo');
      expect(deniedWarning()).toBeNull();
    });

    it('returns a user without permission to /dashboard, not to the login, even after coming from login', async () => {
      expect.assertions(2);
      authService.logout();

      await harness.navigateByUrl('/work-orders/new');
      expect(pathname()).toBe('/login');

      loginAs(users.tecnico);
      await harness.navigateByUrl('/work-orders/new');

      expect(router.url).toBe('/dashboard');
    });
  });
});
