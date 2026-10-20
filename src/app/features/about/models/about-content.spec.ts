import { AuthUser, UserRole } from '@core/auth/auth.model';
import { canManageMachines } from '@features/machines/models/machines.permissions';
import {
  canManageTeams,
  canViewTechnicians,
} from '@features/maintenance/models/maintenance.permissions';
import {
  canCancelWorkOrder,
  canDeleteWorkOrder,
  canEditWorkOrder,
  canReleaseWorkOrder,
  canResolveWorkOrder,
  canTakeWorkOrder,
  creatableTypes,
} from '@features/work-orders/models/work-order.permissions';
import { ABOUT_CONTENT, RoleActionId, RoleCard } from './about-content';

describe('ABOUT_CONTENT', () => {
  const rolesByTitle = (title: string): RoleCard | undefined =>
    ABOUT_CONTENT.roles.find((card) => card.title === title);
  const labelsOf = (title: string): string[] =>
    (rolesByTitle(title)?.actions ?? []).map((action) => action.label);

  it('REQ-3.2: the hero tagline mentions "órdenes de mantenimiento"', () => {
    expect(ABOUT_CONTENT.heroTagline).toContain('órdenes de mantenimiento');
  });

  it('REQ-3.3: describes the order journey in five steps: crear, tomar, cerrar, liberar, cancelar', () => {
    expect.assertions(2);

    expect(ABOUT_CONTENT.steps).toHaveLength(5);
    expect(
      ABOUT_CONTENT.steps.map((step) => step.title.trim().toLowerCase().split(/\s+/)[0]),
    ).toEqual(['crear', 'tomar', 'cerrar', 'liberar', 'cancelar']);
  });

  it('REQ-4.1: has exactly four role cards with the expected titles', () => {
    expect(ABOUT_CONTENT.roles.map((card) => card.title)).toEqual([
      'Administrador',
      'Team Leader de Mantenimiento',
      'Personal de Producción',
      'Técnico',
    ]);
  });

  it('REQ-4.2: the Administrador card lists exactly its six actions', () => {
    expect(labelsOf('Administrador')).toEqual([
      'Editar órdenes',
      'Eliminar órdenes',
      'Liberar órdenes',
      'Cancelar órdenes',
      'Gestionar máquinas',
      'Gestionar técnicos',
    ]);
  });

  it('REQ-4.3: the Team Leader de Mantenimiento card lists exactly its seven actions', () => {
    expect(labelsOf('Team Leader de Mantenimiento')).toEqual([
      'Crear órdenes preventivas y correctivas',
      'Editar órdenes',
      'Liberar órdenes',
      'Cancelar órdenes',
      'Gestionar máquinas',
      'Gestionar técnicos',
      'Gestionar equipos',
    ]);
  });

  it('REQ-4.4: the Personal de Producción card lists only pronto intervención creation', () => {
    expect(labelsOf('Personal de Producción')).toEqual(['Crear órdenes de pronto intervención']);
  });

  it('REQ-4.5: the Técnico card lists taking orders by equipment type and closing the ones taken', () => {
    expect(labelsOf('Técnico')).toEqual([
      'Tomar órdenes según su tipo de equipo',
      'Cerrar las órdenes que tomó',
    ]);
  });

  it('REQ-5.1: has one area card per expected area', () => {
    expect(ABOUT_CONTENT.areas.map((area) => area.title)).toEqual([
      'Órdenes de trabajo',
      'Máquinas y partes',
      'Técnicos y equipos',
      'Tablero de turno',
    ]);
  });

  it('REQ-5.2: every area has a title and a description of one or two sentences', () => {
    expect.assertions(1 + ABOUT_CONTENT.areas.length * 3);
    expect(ABOUT_CONTENT.areas.length).toBeGreaterThan(0);

    for (const area of ABOUT_CONTENT.areas) {
      const sentences = area.description.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim() !== '');
      expect(area.title.trim()).not.toBe('');
      expect(sentences.length).toBeGreaterThanOrEqual(1);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });

  describe('REQ-4.6 / NFR-5: every listed action is granted by the client permission matrix', () => {
    const base = {
      username: 'user',
      displayName: 'User',
      email: 'user@enterprise-lab.dev',
    };
    // Un técnico habilitado: equipo `preventivo-correctivo` (toma preventivas y correctivas).
    const users: Record<UserRole, AuthUser> = {
      administrador: { ...base, id: '1', role: 'administrador' },
      'team-leader-mantenimiento': { ...base, id: '3', role: 'team-leader-mantenimiento' },
      'personal-produccion': { ...base, id: '4', role: 'personal-produccion' },
      tecnico: {
        ...base,
        id: '2',
        role: 'tecnico',
        legajo: '1001',
        specialty: 'mecanico',
        teamType: 'preventivo-correctivo',
      },
    };

    // Mapeo de design.md: acción de la tarjeta -> predicado de la matriz de permisos.
    const granted: Record<RoleActionId, (user: AuthUser) => boolean> = {
      'create-preventive-corrective': (user) =>
        creatableTypes(user).includes('preventivo') && creatableTypes(user).includes('correctivo'),
      'create-urgent': (user) => creatableTypes(user).includes('pronto-intervencion'),
      'edit-orders': (user) => canEditWorkOrder(user),
      'delete-orders': (user) => canDeleteWorkOrder(user),
      'release-orders': (user) => canReleaseWorkOrder(user, { status: 'in-progress' }),
      'cancel-orders': (user) => canCancelWorkOrder(user, { status: 'pending' }),
      'take-orders': (user) => canTakeWorkOrder(user, { type: 'correctivo' }),
      'close-orders': (user) =>
        canResolveWorkOrder(user, {
          type: 'correctivo',
          status: 'in-progress',
          takenBy: { id: user.id, name: user.displayName, at: '2026-09-08T10:00:00Z' },
        }),
      'manage-machines': (user) => canManageMachines(user),
      'manage-technicians': (user) => canViewTechnicians(user),
      'manage-teams': (user) => canManageTeams(user),
    };

    it('has four role cards to check, each with at least one action', () => {
      expect.assertions(1 + ABOUT_CONTENT.roles.length);
      expect(ABOUT_CONTENT.roles).toHaveLength(4);

      for (const card of ABOUT_CONTENT.roles) {
        expect(card.actions.length).toBeGreaterThan(0);
      }
    });

    it.each<[UserRole]>([
      ['administrador'],
      ['team-leader-mantenimiento'],
      ['personal-produccion'],
      ['tecnico'],
    ])('REQ-4.6 / NFR-5: the card of %s lists only actions the role has', (role) => {
      const cards = ABOUT_CONTENT.roles.filter((card) => card.role === role);
      expect(cards).toHaveLength(1);

      for (const card of cards) {
        for (const action of card.actions) {
          expect(granted[action.id](users[role]), `${role} -> ${action.id}`).toBe(true);
        }
      }
    });
  });

  it('NFR-4: no visible text contains Angular, API, JWT, token, repositorio or Spring', () => {
    const texts: string[] = [
      ABOUT_CONTENT.heroTagline,
      ...ABOUT_CONTENT.steps.flatMap((step) => [step.title, step.description]),
      ...ABOUT_CONTENT.roles.flatMap((card) => [
        card.title,
        ...card.actions.map((action) => action.label),
      ]),
      ...ABOUT_CONTENT.areas.flatMap((area) => [area.title, area.description]),
    ];
    const forbidden = /\b(angular|api|jwt|token|repositorio|spring)\b/i;

    expect(texts.filter((text) => text.trim() !== '').length).toBeGreaterThan(0);
    expect(texts.filter((text) => forbidden.test(text))).toEqual([]);
  });
});
