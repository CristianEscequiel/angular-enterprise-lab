import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { BottomNav } from './bottom-nav';

@Component({ template: '' })
class PageStub {}

describe('BottomNav', () => {
  let fixture: ComponentFixture<BottomNav>;

  const teamLeader: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const produccion: AuthUser = { ...teamLeader, id: '4', role: 'personal-produccion' };
  const currentUser = signal<AuthUser | null>(teamLeader);

  beforeEach(async () => {
    currentUser.set(teamLeader);

    await TestBed.configureTestingModule({
      imports: [BottomNav],
      providers: [
        provideRouter([
          { path: 'dashboard', component: PageStub },
          { path: 'work-orders', component: PageStub },
          { path: 'work-orders/1', component: PageStub },
          { path: 'maintenance/teams', component: PageStub },
        ]),
        { provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BottomNav);
    fixture.detectChanges();
  });

  const anchors = (): HTMLAnchorElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('nav a'));
  const labels = (): string[] => anchors().map((anchor) => anchor.textContent?.trim() ?? '');
  const link = (label: string): HTMLAnchorElement | undefined =>
    anchors().find((anchor) => anchor.textContent?.trim() === label);

  async function goTo(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('labels its navigation landmark', () => {
    expect(fixture.nativeElement.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Navegación principal',
    );
  });

  it('shows the sections the role is allowed to see', () => {
    expect(labels()).toEqual(['Inicio', 'Órdenes', 'Técnicos', 'Equipos', 'Máquinas']);
  });

  it('shows only Inicio and Órdenes to a role without management sections', () => {
    currentUser.set(produccion);
    fixture.detectChanges();

    expect(labels()).toEqual(['Inicio', 'Órdenes']);
  });

  it('points each link to its section', () => {
    expect.assertions(2);

    expect(link('Órdenes')?.getAttribute('href')).toBe('/work-orders');
    expect(link('Equipos')?.getAttribute('href')).toBe('/maintenance/teams');
  });

  it('has no buttons: navigating is all it does', () => {
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  describe('active section', () => {
    it('marks it with aria-current and a modifier class, and only that one', async () => {
      expect.assertions(4);

      await goTo('/work-orders');

      expect(link('Órdenes')?.getAttribute('aria-current')).toBe('page');
      expect(link('Órdenes')?.classList).toContain('bottom-nav__link--active');
      expect(link('Inicio')?.getAttribute('aria-current')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
    });

    it('keeps it while moving inside the section and moves it when leaving', async () => {
      expect.assertions(3);

      await goTo('/work-orders');
      await goTo('/work-orders/1');
      expect(link('Órdenes')?.getAttribute('aria-current')).toBe('page');

      await goTo('/maintenance/teams');
      expect(link('Órdenes')?.getAttribute('aria-current')).toBeNull();
      expect(link('Equipos')?.getAttribute('aria-current')).toBe('page');
    });
  });
});
