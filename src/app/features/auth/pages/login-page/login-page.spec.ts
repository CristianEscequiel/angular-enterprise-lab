import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { UserRecord } from '@core/auth/auth.model';
import { AUTH_STORAGE_KEY, AuthService } from '@core/auth/auth.service';
import { API_BASE_URL } from '@core/config/api.config';
import { LoginPage } from './login-page';

@Component({ template: 'stub page' })
class StubPage {}

describe('LoginPage', () => {
  const admin: UserRecord = {
    id: '1',
    username: 'admin',
    password: 'admin123',
    displayName: 'Administrador',
    email: 'admin@enterprise-lab.dev',
    role: 'admin',
  };

  let harness: RouterTestingHarness;
  let router: Router;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  async function setup(url = '/login'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: LoginPage },
          { path: 'dashboard', component: StubPage },
          { path: 'work-orders/:id', component: StubPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    await harness.navigateByUrl(url);
  }

  function element(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function fill(username: string, password: string): void {
    const usernameInput = element().querySelector<HTMLInputElement>('#username');
    const passwordInput = element().querySelector<HTMLInputElement>('#password');

    if (!usernameInput || !passwordInput) {
      throw new Error('login form fields not found');
    }
    usernameInput.value = username;
    usernameInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    element().querySelector('form')?.dispatchEvent(new Event('submit'));
    harness.detectChanges();
  }

  function usersRequests() {
    return httpMock.match((req) => req.url === `${API_BASE_URL}/users`);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('renders the login form', async () => {
    expect.assertions(4);
    await setup();

    expect(element().querySelector('h1')?.textContent).toContain('Iniciar sesión');
    expect(element().querySelector('#username')).not.toBeNull();
    expect(element().querySelector('#password')?.getAttribute('type')).toBe('password');
    expect(element().querySelector('button[type="submit"]')?.textContent).toContain('Ingresar');
  });

  describe('successful login', () => {
    it('authenticates the user and leaves the login screen for the dashboard', async () => {
      expect.assertions(5);
      await setup();
      fill('admin', 'admin123');

      submit();
      const [request] = usersRequests();
      request?.flush([admin]);
      await harness.fixture.whenStable();

      expect(request?.request.params.get('username')).toBe('admin');
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.currentUser()?.username).toBe('admin');
      expect(router.url).toBe('/dashboard');
      expect(router.url).not.toContain('/login');
    });

    it('returns to the originally requested url instead of the dashboard', async () => {
      expect.assertions(2);
      await setup('/login?returnUrl=%2Fwork-orders%2F5');
      fill('admin', 'admin123');

      submit();
      usersRequests()[0]?.flush([admin]);
      await harness.fixture.whenStable();

      expect(authService.isAuthenticated()).toBe(true);
      expect(router.url).toBe('/work-orders/5');
    });

    it.each([
      ['an external url', '/login?returnUrl=https%3A%2F%2Fevil.com'],
      ['a protocol-relative url', '/login?returnUrl=%2F%2Fevil.com'],
      ['the login route itself', '/login?returnUrl=%2Flogin'],
    ])('falls back to the dashboard when returnUrl is %s', async (_label, url) => {
      expect.assertions(1);
      await setup(url);
      fill('admin', 'admin123');

      submit();
      usersRequests()[0]?.flush([admin]);
      await harness.fixture.whenStable();

      expect(router.url).toBe('/dashboard');
    });
  });

  describe('failed login', () => {
    it('shows an error and keeps the user unauthenticated on invalid credentials', async () => {
      expect.assertions(5);
      await setup();
      const navigateSpy = vi.spyOn(router, 'navigateByUrl');
      fill('admin', 'incorrecta');

      submit();
      usersRequests()[0]?.flush([]);
      harness.detectChanges();

      expect(element().querySelector('[role="alert"]')?.textContent).toContain(
        'Usuario o contraseña incorrectos.',
      );
      expect(authService.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(router.url).toContain('/login');
    });

    it('re-enables the submit button after a rejected login', async () => {
      expect.assertions(2);
      await setup();
      fill('admin', 'incorrecta');

      submit();
      const button = element().querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(button?.disabled).toBe(true);

      usersRequests()[0]?.flush([]);
      harness.detectChanges();

      expect(button?.disabled).toBe(false);
    });

    it('clears the previous error when submitting again', async () => {
      expect.assertions(2);
      await setup();
      fill('admin', 'incorrecta');
      submit();
      usersRequests()[0]?.flush([]);
      harness.detectChanges();
      expect(element().querySelector('[role="alert"]')).not.toBeNull();

      fill('admin', 'admin123');
      submit();

      expect(element().querySelector('[role="alert"]')).toBeNull();
      usersRequests()[0]?.flush([admin]);
    });

    it('does not show the inline credentials error on a connection failure', async () => {
      expect.assertions(2);
      await setup();
      fill('admin', 'admin123');

      submit();
      usersRequests()[0]?.flush('boom', { status: 500, statusText: 'Server Error' });
      harness.detectChanges();

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('form validation', () => {
    it('does not send any request and shows the validation errors when the form is empty', async () => {
      expect.assertions(3);
      await setup();

      submit();

      expect(usersRequests()).toHaveLength(0);
      expect(element().querySelector('#username-error')).not.toBeNull();
      expect(element().querySelector('#password-error')).not.toBeNull();
    });

    it('rejects a password shorter than 6 characters without sending a request', async () => {
      expect.assertions(3);
      await setup();
      fill('admin', '12345');

      submit();

      expect(usersRequests()).toHaveLength(0);
      expect(element().querySelector('#username-error')).toBeNull();
      expect(element().querySelector('#password')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('sends a single request when submitted twice while the first is in flight', async () => {
      expect.assertions(1);
      await setup();
      fill('admin', 'admin123');

      submit();
      submit();

      const requests = usersRequests();
      expect(requests).toHaveLength(1);
      requests[0]?.flush([admin]);
    });
  });
});
