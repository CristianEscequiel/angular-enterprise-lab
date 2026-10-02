import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthSession, AuthUser } from '@core/auth/auth.model';
import { AUTH_STORAGE_KEY, AuthService } from '@core/auth/auth.service';
import { API_BASE_URL } from '@core/config/api.config';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  let component: AppShell;
  let fixture: ComponentFixture<AppShell>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShell);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // REQ-6.3: el skip link apunta al contenido y sigue existiendo con la navegación presente.
  it('keeps the skip link pointing at the main content', () => {
    expect.assertions(2);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a.skip-link')?.getAttribute('href')).toBe(
      '#main-content',
    );
    expect(fixture.nativeElement.querySelector('main#main-content')).not.toBeNull();
  });

  // REQ-2.8: sin sesión no hay navegación.
  it('renders neither the sidebar nor the bottom bar while there is no session', () => {
    expect.assertions(4);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-sidebar')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-bottom-nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.shell--with-nav')).toBeNull();
  });

  it('has no menu toggle in the header, with or without a session', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('header [aria-controls]')).toBeNull();
  });

  describe('session', () => {
    const admin: AuthUser & { password: string } = {
      id: '1',
      username: 'admin',
      password: 'admin123',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    };
    const tecnico: AuthUser & { password: string } = {
      id: '2',
      username: 'tecnico',
      password: 'tecnico123',
      displayName: 'Técnico de Mantenimiento',
      email: 'tecnico@enterprise-lab.dev',
      role: 'tecnico',
      legajo: '1001',
      specialty: 'mecanico',
      teamType: 'guardia',
    };

    function loginAs(user: AuthUser & { password: string }): AuthSession {
      const authService = TestBed.inject(AuthService);
      const httpMock = TestBed.inject(HttpTestingController);
      let result: AuthSession | undefined;

      authService
        .login({ username: user.username, password: user.password })
        .subscribe((session) => (result = session));
      httpMock.expectOne(`${API_BASE_URL}/auth/login`).flush({
        token: `jwt.${user.id}`,
        user: Object.fromEntries(Object.entries(user).filter(([key]) => key !== 'password')),
      });
      fixture.detectChanges();

      if (!result) throw new Error('login did not emit a session');
      return result;
    }

    function logoutButton(): HTMLButtonElement | null {
      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('header button'),
      );
      return buttons.find((button) => button.textContent?.includes('Cerrar sesión')) ?? null;
    }

    const navLabels = (selector: string): string[] =>
      Array.from<HTMLAnchorElement>(
        fixture.nativeElement.querySelectorAll(`${selector} nav a`),
      ).map((anchor) => anchor.textContent?.trim() ?? '');

    it('renders the sidebar and the bottom bar with the same sections once there is a session', () => {
      expect.assertions(3);
      fixture.detectChanges();

      loginAs(admin);

      expect(fixture.nativeElement.querySelector('.shell--with-nav')).not.toBeNull();
      expect(navLabels('app-sidebar')).toEqual(['Inicio', 'Órdenes', 'Técnicos', 'Máquinas']);
      expect(navLabels('app-bottom-nav')).toEqual(navLabels('app-sidebar'));
    });

    it('offers each role only its own sections in both navigations', () => {
      expect.assertions(2);
      fixture.detectChanges();

      loginAs(tecnico);

      expect(navLabels('app-sidebar')).toEqual(['Inicio', 'Órdenes']);
      expect(navLabels('app-bottom-nav')).toEqual(['Inicio', 'Órdenes']);
    });

    it('removes both navigations when the session ends', () => {
      expect.assertions(2);
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
      loginAs(admin);

      logoutButton()?.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-sidebar')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-bottom-nav')).toBeNull();
    });

    it('shows no logout button while there is no session', () => {
      fixture.detectChanges();

      expect(logoutButton()).toBeNull();
    });

    it('shows the logged-in user name and the logout button', () => {
      expect.assertions(2);
      fixture.detectChanges();

      loginAs(admin);

      expect(fixture.nativeElement.querySelector('.header__user')?.textContent).toContain(
        'Administrador',
      );
      expect(logoutButton()).not.toBeNull();
    });

    it('clears the whole session and navigates to /login when logging out', () => {
      expect.assertions(6);
      const authService = TestBed.inject(AuthService);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
      loginAs(admin);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();

      logoutButton()?.click();
      fixture.detectChanges();

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.token()).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/login']);
      expect(logoutButton()).toBeNull();
    });

    it('does not show the previous user after another user logs in', () => {
      expect.assertions(3);
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
      loginAs(admin);
      logoutButton()?.click();
      fixture.detectChanges();

      loginAs(tecnico);

      const userName = fixture.nativeElement.querySelector('.header__user')?.textContent;
      expect(userName).toContain('Técnico de Mantenimiento');
      expect(userName).not.toContain('Administrador');
      expect(TestBed.inject(AuthService).currentUser()?.id).toBe('2');
    });
  });
});
