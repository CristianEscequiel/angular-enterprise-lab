import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
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

  // Spec 014 (REQ-6.2): cada página tiene su h1; el nombre del sitio no compite con él.
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
