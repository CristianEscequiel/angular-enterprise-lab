import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Header } from './header';

@Component({ template: '' })
class PageStub {}

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([
          { path: 'acerca-de', component: PageStub },
          { path: 'login', component: PageStub },
          { path: '**', component: PageStub },
        ]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function logoutButton(): HTMLButtonElement | null {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    return buttons.find((button) => button.textContent?.includes('Cerrar sesión')) ?? null;
  }

  // Spec 18 (REQ-6.2): cada página tiene su h1; el nombre del sitio no compite con él.
  describe('site title', () => {
    it('shows the site name as a paragraph, not as a heading', () => {
      expect.assertions(3);
      fixture.detectChanges();

      const title = fixture.nativeElement.querySelector('.header__title');
      expect(title?.tagName).toBe('P');
      expect(title?.textContent).toContain('Centro de Gestión de Mantenimiento');
      expect(fixture.nativeElement.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
    });
  });

  // El menú dejó de ser un drawer: la navegación es el sidebar (>= md) o la barra inferior (mobile).
  describe('navigation', () => {
    it('has no menu toggle, with or without a session', () => {
      expect.assertions(3);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('button')).toBeNull();

      fixture.componentRef.setInput('userName', 'Administrador');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[aria-controls]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[aria-expanded]')).toBeNull();
    });
  });

  // Spec 21: el enlace "Acerca de" está siempre a mano, con y sin sesión.
  describe('"Acerca de" link', () => {
    function aboutLink(): HTMLAnchorElement | null {
      const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('a'));
      return links.find((anchor) => anchor.textContent?.trim() === 'Acerca de') ?? null;
    }

    async function goTo(url: string): Promise<void> {
      await TestBed.inject(Router).navigateByUrl(url);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('REQ-8.1: is shown without a session and points to /acerca-de', () => {
      expect.assertions(2);
      fixture.detectChanges();

      expect(aboutLink()).not.toBeNull();
      expect(aboutLink()?.getAttribute('href')).toBe('/acerca-de');
    });

    it.each([
      ['/login', 'the login page'],
      ['/no-existe', 'the 404 page'],
    ])('REQ-8.1: is shown without a session while the router is on %s (%s)', async (url) => {
      expect.assertions(2);
      fixture.detectChanges();

      await goTo(url);

      expect(aboutLink()).not.toBeNull();
      expect(aboutLink()?.getAttribute('href')).toBe('/acerca-de');
    });

    it('REQ-8.2: is shown with a session, next to the user name and the logout button', () => {
      expect.assertions(5);
      fixture.componentRef.setInput('userName', 'Administrador');
      fixture.detectChanges();

      const link = aboutLink();
      const user: HTMLElement | null = fixture.nativeElement.querySelector('.header__user');

      expect(link).not.toBeNull();
      expect(user).not.toBeNull();
      expect(logoutButton()).not.toBeNull();
      expect(link?.closest('header')).toBe(user?.closest('header'));
      expect(
        link !== null &&
          user !== null &&
          (link.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ).toBe(true);
    });

    it('REQ-8.3: activating it navigates to /acerca-de without closing the session', async () => {
      expect.assertions(4);
      const logoutSpy = vi.fn();
      fixture.componentRef.setInput('userName', 'Administrador');
      fixture.detectChanges();
      component.logout.subscribe(logoutSpy);

      aboutLink()?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(TestBed.inject(Router).url).toBe('/acerca-de');
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.header__user')?.textContent).toContain(
        'Administrador',
      );
      expect(logoutButton()).not.toBeNull();
    });
  });

  describe('session area', () => {
    it('shows neither the user name nor the logout button without a session', () => {
      expect.assertions(2);
      fixture.detectChanges();

      expect(logoutButton()).toBeNull();
      expect(fixture.nativeElement.querySelector('.header__user')).toBeNull();
    });

    it('shows the user name and the logout button when userName is set', () => {
      expect.assertions(2);
      fixture.componentRef.setInput('userName', 'Administrador');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.header__user')?.textContent).toContain(
        'Administrador',
      );
      expect(logoutButton()).not.toBeNull();
    });

    it('keeps the logout button available even if the display name is empty', () => {
      fixture.componentRef.setInput('userName', '');
      fixture.detectChanges();

      expect(logoutButton()).not.toBeNull();
    });

    it('emits logout when the logout button is clicked', () => {
      expect.assertions(1);
      fixture.componentRef.setInput('userName', 'Administrador');
      fixture.detectChanges();
      component.logout.subscribe(() => expect(true).toBe(true));

      logoutButton()?.click();
    });
  });
});
