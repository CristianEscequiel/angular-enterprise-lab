import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { Sidebar } from './sidebar';

@Component({ template: '' })
class PageStub {}

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;

  const teamLeader: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const administrador: AuthUser = { ...teamLeader, id: '1', role: 'administrador' };
  const produccion: AuthUser = { ...teamLeader, id: '4', role: 'personal-produccion' };
  const tecnico: AuthUser = {
    ...teamLeader,
    id: '2',
    role: 'tecnico',
    legajo: '1001',
    specialty: 'mecanico',
    teamType: 'guardia',
  };
  const currentUser = signal<AuthUser | null>(teamLeader);

  beforeEach(async () => {
    currentUser.set(teamLeader);

    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([
          { path: 'maintenance/technicians', component: PageStub },
          { path: 'maintenance/technicians/new', component: PageStub },
          { path: 'maintenance/teams', component: PageStub },
          { path: 'work-orders', component: PageStub },
          { path: 'work-orders/1', component: PageStub },
          { path: 'dashboard', component: PageStub },
        ]),
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  const links = (): string[] =>
    Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('nav a')).map(
      (link) => link.textContent?.trim() ?? '',
    );
  const link = (label: string): HTMLAnchorElement | undefined =>
    Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('nav a')).find(
      (anchor) => anchor.textContent?.trim() === label,
    );

  function showFor(user: AuthUser | null): void {
    currentUser.set(user);
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('maintenance links follow the permission policy', () => {
    it('team leader sees Técnicos and Equipos', () => {
      expect(links()).toEqual(['Inicio', 'Órdenes', 'Técnicos', 'Equipos']);
    });

    it('administrador sees Técnicos but not Equipos', () => {
      showFor(administrador);

      expect(links()).toEqual(['Inicio', 'Órdenes', 'Técnicos']);
    });

    it.each([
      ['personal-produccion', produccion],
      ['tecnico', tecnico],
      ['no session', null],
    ])('%s sees neither Técnicos nor Equipos', (_label, user) => {
      showFor(user);

      expect(links()).toEqual(['Inicio', 'Órdenes']);
    });

    it('updates the links when the session changes', () => {
      expect.assertions(3);
      expect(links()).toContain('Equipos');

      showFor(administrador);
      expect(links()).not.toContain('Equipos');

      showFor(null);
      expect(links()).not.toContain('Técnicos');
    });

    it('points each link to its section', () => {
      expect.assertions(2);

      expect(link('Técnicos')?.getAttribute('href')).toBe('/maintenance/technicians');
      expect(link('Equipos')?.getAttribute('href')).toBe('/maintenance/teams');
    });
  });

  describe('active link', () => {
    async function goTo(url: string): Promise<void> {
      await TestBed.inject(Router).navigateByUrl(url);
      // routerLinkActive actualiza sus clases y atributos después de la navegación.
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('marks Técnicos with aria-current on its page and on its nested pages', async () => {
      expect.assertions(4);

      await goTo('/maintenance/technicians');
      expect(link('Técnicos')?.getAttribute('aria-current')).toBe('page');
      expect(link('Equipos')?.getAttribute('aria-current')).toBeNull();

      await goTo('/maintenance/technicians/new');
      expect(link('Técnicos')?.getAttribute('aria-current')).toBe('page');
      expect(link('Técnicos')?.classList).toContain('sidebar__link--active');
    });

    // Regresión: `routerLinkActive` sin `ariaCurrentWhenActive` borra el atributo en cada
    // actualización, y un `[attr.aria-current]` manual no lo vuelve a escribir mientras su valor no
    // cambia. Al moverse dentro de la misma sección el atributo desaparecía.
    it('keeps aria-current on a link while moving inside its section', async () => {
      expect.assertions(4);

      await goTo('/work-orders');
      expect(link('Órdenes')?.getAttribute('aria-current')).toBe('page');

      await goTo('/work-orders/1');
      expect(link('Órdenes')?.getAttribute('aria-current')).toBe('page');

      await goTo('/maintenance/technicians');
      await goTo('/maintenance/technicians/new');
      expect(link('Técnicos')?.getAttribute('aria-current')).toBe('page');
      expect(link('Órdenes')?.getAttribute('aria-current')).toBeNull();
    });

    it('moves aria-current when leaving the section', async () => {
      expect.assertions(4);

      await goTo('/dashboard');
      expect(link('Inicio')?.getAttribute('aria-current')).toBe('page');

      await goTo('/maintenance/teams');
      expect(link('Inicio')?.getAttribute('aria-current')).toBeNull();
      expect(link('Equipos')?.getAttribute('aria-current')).toBe('page');
      expect(fixture.nativeElement.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
    });

    it('marks Equipos with aria-current on its page only', async () => {
      expect.assertions(3);

      await goTo('/maintenance/teams');
      expect(link('Equipos')?.getAttribute('aria-current')).toBe('page');
      expect(link('Técnicos')?.getAttribute('aria-current')).toBeNull();
      expect(link('Órdenes')?.getAttribute('aria-current')).toBeNull();
    });
  });

  it('emits closed when the close button is used', () => {
    const closed = vi.fn();
    component.closed.subscribe(closed);

    fixture.nativeElement.querySelector('button[aria-label="Cerrar menú de navegación"]').click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
