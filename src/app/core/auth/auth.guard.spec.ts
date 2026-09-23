import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MessageService } from '../services/message.service';
import { AuthSession, UserRole } from './auth.model';
import { AUTH_STORAGE_KEY, AuthService } from './auth.service';
import { authGuard, guestGuard, requireRole } from './auth.guard';

const created: string[] = [];

@Component({ template: 'protected page' })
class ProtectedStub {
  constructor() {
    created.push('protected');
  }
}

@Component({ template: 'login page' })
class LoginStub {
  constructor() {
    created.push('login');
  }
}

@Component({ template: 'dashboard page' })
class DashboardStub {
  constructor() {
    created.push('dashboard');
  }
}

@Component({ template: 'admin page' })
class AdminStub {
  constructor() {
    created.push('admin');
  }
}

@Component({ template: 'work order page' })
class WorkOrderStub {
  constructor() {
    created.push('work-order');
  }
}

function sessionFor(role: UserRole): AuthSession {
  return {
    token: 'mock-token.1.1700000000000',
    user: {
      id: role === 'admin' ? '1' : '2',
      username: role,
      displayName: role,
      email: `${role}@enterprise-lab.dev`,
      role,
    },
  };
}

describe('auth guards', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  async function setup(session?: AuthSession): Promise<void> {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    }

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'protected', component: ProtectedStub, canActivate: [authGuard] },
          { path: 'login', component: LoginStub, canActivate: [guestGuard] },
          { path: 'dashboard', component: DashboardStub },
          { path: 'work-orders/:id', component: WorkOrderStub },
          { path: 'admin-only', component: AdminStub, canActivate: [requireRole('admin')] },
          {
            path: 'shared-roles',
            component: AdminStub,
            canActivate: [requireRole('admin', 'tecnico')],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  }

  function returnUrl(): string | null {
    return router.parseUrl(router.url).queryParamMap.get('returnUrl');
  }

  function pathname(): string {
    return router.url.split('?')[0] ?? '';
  }

  beforeEach(() => {
    localStorage.clear();
    created.length = 0;
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('authGuard', () => {
    it('redirects to login keeping the requested url as returnUrl when there is no session', async () => {
      expect.assertions(3);
      await setup();

      await harness.navigateByUrl('/protected?x=1');

      expect(pathname()).toBe('/login');
      expect(returnUrl()).toBe('/protected?x=1');
      expect(created).not.toContain('protected');
    });

    it('lets an authenticated user through', async () => {
      expect.assertions(2);
      await setup(sessionFor('tecnico'));

      await harness.navigateByUrl('/protected');

      expect(router.url).toBe('/protected');
      expect(created).toContain('protected');
    });

    it('evaluates the current session on every navigation', async () => {
      expect.assertions(2);
      await setup(sessionFor('admin'));
      await harness.navigateByUrl('/protected');
      expect(router.url).toBe('/protected');

      TestBed.inject(AuthService).logout();
      await harness.navigateByUrl('/dashboard');
      await harness.navigateByUrl('/protected');

      expect(pathname()).toBe('/login');
    });
  });

  describe('guestGuard', () => {
    it('renders the login page when there is no session', async () => {
      expect.assertions(2);
      await setup();

      await harness.navigateByUrl('/login');

      expect(router.url).toBe('/login');
      expect(created).toContain('login');
    });

    it('redirects an authenticated user to /dashboard without ever creating the login page', async () => {
      expect.assertions(3);
      await setup(sessionFor('admin'));

      await harness.navigateByUrl('/login');

      expect(router.url).toBe('/dashboard');
      expect(created).not.toContain('login');
      expect(created).toContain('dashboard');
    });

    it('redirects an authenticated user to a valid internal returnUrl', async () => {
      expect.assertions(2);
      await setup(sessionFor('admin'));

      await harness.navigateByUrl('/login?returnUrl=%2Fwork-orders%2F5');

      expect(router.url).toBe('/work-orders/5');
      expect(created).not.toContain('login');
    });

    it.each([
      ['a protocol-relative url', '//evil.com'],
      ['an absolute url', 'https://evil.com'],
      ['the login page itself', '/login'],
    ])('falls back to /dashboard when returnUrl is %s', async (_label, unsafe) => {
      expect.assertions(2);
      await setup(sessionFor('admin'));

      await harness.navigateByUrl(`/login?returnUrl=${encodeURIComponent(unsafe)}`);

      expect(router.url).toBe('/dashboard');
      expect(created).not.toContain('login');
    });
  });

  describe('requireRole', () => {
    it('lets a user with an allowed role through', async () => {
      expect.assertions(3);
      await setup(sessionFor('admin'));

      await harness.navigateByUrl('/admin-only');

      expect(router.url).toBe('/admin-only');
      expect(created).toContain('admin');
      expect(TestBed.inject(MessageService).message()).toBeNull();
    });

    it('blocks a user without the role, sends them to /dashboard and warns', async () => {
      expect.assertions(4);
      await setup(sessionFor('tecnico'));

      await harness.navigateByUrl('/admin-only');

      expect(router.url).toBe('/dashboard');
      expect(created).not.toContain('admin');
      expect(TestBed.inject(MessageService).message()?.variant).toBe('warning');
      expect(TestBed.inject(MessageService).message()?.title).toBe('Acceso denegado');
    });

    it.each<UserRole>(['admin', 'tecnico'])(
      'accepts any of several allowed roles (%s)',
      async (role) => {
        expect.assertions(2);
        await setup(sessionFor(role));

        await harness.navigateByUrl('/shared-roles');

        expect(router.url).toBe('/shared-roles');
        expect(created).toContain('admin');
      },
    );

    it('sends an anonymous user to login (not to a denied page) keeping the returnUrl', async () => {
      expect.assertions(3);
      await setup();

      await harness.navigateByUrl('/admin-only');

      expect(pathname()).toBe('/login');
      expect(returnUrl()).toBe('/admin-only');
      expect(TestBed.inject(MessageService).message()).toBeNull();
    });
  });
});
