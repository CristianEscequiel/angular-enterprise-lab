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

  function toggleButton(): HTMLButtonElement {
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    if (!button) {
      throw new Error('No se renderizó el botón de menú');
    }
    return button;
  }

  it('exposes aria-expanded reflecting the sidebarOpen input', () => {
    fixture.detectChanges();
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false');

    fixture.componentRef.setInput('sidebarOpen', true);
    fixture.detectChanges();
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('emits viewSidebar when the toggle is clicked', () => {
    expect.assertions(1);
    fixture.detectChanges();
    component.viewSidebar.subscribe(() => expect(true).toBe(true));
    toggleButton().click();
  });

  function logoutButton(): HTMLButtonElement | null {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    return buttons.find((button) => button.textContent?.includes('Cerrar sesión')) ?? null;
  }

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

    it('keeps the sidebar toggle as the first button', () => {
      fixture.componentRef.setInput('userName', 'Administrador');
      fixture.detectChanges();

      expect(toggleButton().getAttribute('aria-controls')).toBe('app-sidebar');
    });
  });
});
