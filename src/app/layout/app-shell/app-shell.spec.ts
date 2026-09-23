import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthSession, UserRecord } from '@core/auth/auth.model';
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

  it('returns focus to the header toggle after closing the sidebar', async () => {
    fixture.detectChanges();

    const toggle: HTMLButtonElement | null = fixture.nativeElement.querySelector('header button');
    if (!toggle) throw new Error('No se renderizó el botón de menú');

    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const closeButton: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('.btn--close');
    if (!closeButton) throw new Error('No se renderizó el botón de cerrar el sidebar');

    closeButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(toggle);
  });

  it('closes the sidebar drawer when the backdrop is clicked', async () => {
    fixture.detectChanges();

    const toggle: HTMLButtonElement | null = fixture.nativeElement.querySelector('header button');
    toggle?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeTruthy();

    const backdrop: HTMLElement | null = fixture.nativeElement.querySelector('.sidebar-backdrop');
    backdrop?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sidebarOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeNull();
  });

  describe('session', () => {
    const admin: UserRecord = {
      id: '1',
      username: 'admin',
      password: 'admin123',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'admin',
    };
    const tecnico: UserRecord = {
      id: '2',
      username: 'tecnico',
      password: 'tecnico123',
      displayName: 'Técnico de Mantenimiento',
      email: 'tecnico@enterprise-lab.dev',
      role: 'tecnico',
    };

    function loginAs(user: UserRecord): AuthSession {
      const authService = TestBed.inject(AuthService);
      const httpMock = TestBed.inject(HttpTestingController);
      let result: AuthSession | undefined;

      authService
        .login({ username: user.username, password: user.password })
        .subscribe((session) => (result = session));
      httpMock.expectOne((req) => req.url === `${API_BASE_URL}/users`).flush([user]);
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
