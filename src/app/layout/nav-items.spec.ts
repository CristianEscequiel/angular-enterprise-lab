import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthUser, USER_ROLES, UserRole } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { injectNavItems, NavItem } from './nav-items';

describe('injectNavItems', () => {
  const base: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };
  const byRole: Record<UserRole, AuthUser> = {
    administrador: { ...base, id: '1', role: 'administrador' },
    'team-leader-mantenimiento': base,
    'personal-produccion': { ...base, id: '4', role: 'personal-produccion' },
    tecnico: {
      ...base,
      id: '2',
      role: 'tecnico',
      legajo: '1001',
      specialty: 'mecanico',
      teamType: 'guardia',
    },
  };

  const currentUser = signal<AuthUser | null>(null);

  function items() {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: currentUser.asReadonly() } }],
    });
    return TestBed.runInInjectionContext(() => injectNavItems());
  }

  const labels = (list: NavItem[]): string[] => list.map((item) => item.label);

  beforeEach(() => currentUser.set(null));

  it('always offers Inicio and Órdenes, even without a session', () => {
    expect(labels(items()())).toEqual(['Inicio', 'Órdenes']);
  });

  it.each<[UserRole, string[]]>([
    ['administrador', ['Inicio', 'Órdenes', 'Técnicos', 'Máquinas']],
    ['team-leader-mantenimiento', ['Inicio', 'Órdenes', 'Técnicos', 'Equipos', 'Máquinas']],
    ['personal-produccion', ['Inicio', 'Órdenes']],
    ['tecnico', ['Inicio', 'Órdenes']],
  ])('%s sees exactly %j', (role, expected) => {
    currentUser.set(byRole[role]);

    expect(labels(items()())).toEqual(expected);
  });

  // Un rol nuevo obliga a decidir acá qué secciones ve.
  it.each(USER_ROLES)('has a decision for role %s', (role) => {
    expect(byRole[role]).toBeDefined();
  });

  it('points each item to its section', () => {
    currentUser.set(byRole['team-leader-mantenimiento']);

    expect(items()()).toEqual([
      { label: 'Inicio', path: '/dashboard' },
      { label: 'Órdenes', path: '/work-orders' },
      { label: 'Técnicos', path: '/maintenance/technicians' },
      { label: 'Equipos', path: '/maintenance/teams' },
      { label: 'Máquinas', path: '/machines' },
    ]);
  });

  it('follows the session as it changes', () => {
    const list = items();
    expect(labels(list())).toEqual(['Inicio', 'Órdenes']);

    currentUser.set(byRole['administrador']);
    expect(labels(list())).toContain('Máquinas');

    currentUser.set(null);
    expect(labels(list())).not.toContain('Máquinas');
  });
});
