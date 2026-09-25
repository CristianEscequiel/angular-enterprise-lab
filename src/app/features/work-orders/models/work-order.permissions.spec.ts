import {
  AuthUser,
  StaffRole,
  TechnicianSpecialty,
  TechnicianTeamType,
  TechnicianUser,
  UserRole,
  USER_ROLES,
} from '@core/auth/auth.model';
import { WORK_ORDER_TYPES, WorkOrder, WorkOrderStatus, WorkOrderType } from './work-order.model';
import {
  canCreateWorkOrder,
  canDeleteWorkOrder,
  canEditWorkOrder,
  canReleaseWorkOrder,
  canResolveWorkOrder,
  canTakeWorkOrder,
  canTechnicianHandle,
  creatableTypes,
  OrderSpecialty,
} from './work-order.permissions';

function staff(role: StaffRole): AuthUser {
  return {
    id: role,
    username: role,
    displayName: role,
    email: `${role}@enterprise-lab.dev`,
    role,
  };
}

function technician(specialty: TechnicianSpecialty, teamType: TechnicianTeamType): TechnicianUser {
  return {
    id: 'tec',
    username: 'tecnico',
    displayName: 'Técnico',
    email: 'tecnico@enterprise-lab.dev',
    role: 'tecnico',
    legajo: '1001',
    specialty,
    teamType,
  };
}

const administrador = staff('administrador');
const teamLeader = staff('team-leader-mantenimiento');
const produccion = staff('personal-produccion');
const tecnico = technician('mecanico', 'guardia');

const STAFF_ROLES: StaffRole[] = [
  'administrador',
  'team-leader-mantenimiento',
  'personal-produccion',
];
const SPECIALTIES: OrderSpecialty[] = ['mecanico', 'electricista'];

describe('work order permissions', () => {
  describe('canDeleteWorkOrder', () => {
    it('lets administrador delete', () => {
      expect(canDeleteWorkOrder(administrador)).toBe(true);
    });

    it('does not let team leader delete', () => {
      expect(canDeleteWorkOrder(teamLeader)).toBe(false);
    });

    it.each<[string, AuthUser | null]>([
      ['personal-produccion', produccion],
      ['tecnico', tecnico],
      ['no session', null],
    ])('does not let %s delete', (_label, user) => {
      expect(canDeleteWorkOrder(user)).toBe(false);
    });
  });

  describe('canEditWorkOrder', () => {
    it.each<[string, AuthUser]>([
      ['team leader', teamLeader],
      ['administrador', administrador],
    ])('lets %s edit any order', (_label, user) => {
      expect(canEditWorkOrder(user)).toBe(true);
    });

    it.each<[string, AuthUser | null]>([
      ['personal-produccion', produccion],
      ['tecnico', tecnico],
      ['no session', null],
    ])('does not let %s edit', (_label, user) => {
      expect(canEditWorkOrder(user)).toBe(false);
    });
  });

  describe('canCreateWorkOrder', () => {
    it('lets personal-produccion create pronto-intervencion', () => {
      expect(canCreateWorkOrder(produccion, 'pronto-intervencion')).toBe(true);
    });

    it.each<WorkOrderType>(['preventivo', 'correctivo'])(
      'does not let personal-produccion create %s',
      (type) => {
        expect(canCreateWorkOrder(produccion, type)).toBe(false);
      },
    );

    it.each<WorkOrderType>(['preventivo', 'correctivo'])('lets team leader create %s', (type) => {
      expect(canCreateWorkOrder(teamLeader, type)).toBe(true);
    });

    it('does not let team leader create pronto-intervencion (exclusive to producción)', () => {
      expect(canCreateWorkOrder(teamLeader, 'pronto-intervencion')).toBe(false);
    });

    it.each<[string, AuthUser | null]>([
      ['administrador', administrador],
      ['tecnico', tecnico],
      ['no session', null],
    ])('does not let %s create any type', (_label, user) => {
      for (const type of WORK_ORDER_TYPES) {
        expect(canCreateWorkOrder(user, type)).toBe(false);
      }
    });
  });

  describe('creatableTypes', () => {
    it.each<[string, AuthUser | null, WorkOrderType[]]>([
      ['team leader', teamLeader, ['preventivo', 'correctivo']],
      ['personal-produccion', produccion, ['pronto-intervencion']],
      ['administrador', administrador, []],
      ['tecnico', tecnico, []],
      ['no session', null, []],
    ])('for %s is %j', (_label, user, expected) => {
      expect([...creatableTypes(user)]).toEqual(expected);
    });

    it('agrees with canCreateWorkOrder for every role and type', () => {
      const users: AuthUser[] = [administrador, teamLeader, produccion, tecnico];

      for (const user of users) {
        for (const type of WORK_ORDER_TYPES) {
          expect(creatableTypes(user).includes(type)).toBe(canCreateWorkOrder(user, type));
        }
      }
    });
  });

  describe('canTechnicianHandle', () => {
    describe('mecanico on guardia', () => {
      const user = technician('mecanico', 'guardia');

      it('handles a pronto-intervencion order of its own specialty', () => {
        expect(
          canTechnicianHandle(user, { type: 'pronto-intervencion', specialty: 'mecanico' }),
        ).toBe(true);
      });

      // Falla solo por especialidad: el tipo de equipo (guardia) sí coincide.
      it('does not handle a pronto-intervencion order of another specialty', () => {
        expect(
          canTechnicianHandle(user, { type: 'pronto-intervencion', specialty: 'electricista' }),
        ).toBe(false);
      });

      // Falla solo por tipo de equipo: la especialidad (mecanico) sí coincide.
      it.each<WorkOrderType>(['preventivo', 'correctivo'])(
        'does not handle a %s order even of its own specialty',
        (type) => {
          expect(canTechnicianHandle(user, { type, specialty: 'mecanico' })).toBe(false);
        },
      );
    });

    describe('electricista on preventivo-correctivo', () => {
      const user = technician('electricista', 'preventivo-correctivo');

      it.each<WorkOrderType>(['preventivo', 'correctivo'])(
        'handles a %s order of its own specialty',
        (type) => {
          expect(canTechnicianHandle(user, { type, specialty: 'electricista' })).toBe(true);
        },
      );

      it.each<WorkOrderType>(['preventivo', 'correctivo'])(
        'does not handle a %s order of another specialty',
        (type) => {
          expect(canTechnicianHandle(user, { type, specialty: 'mecanico' })).toBe(false);
        },
      );

      it('does not handle pronto-intervencion even of its own specialty', () => {
        expect(
          canTechnicianHandle(user, { type: 'pronto-intervencion', specialty: 'electricista' }),
        ).toBe(false);
      });
    });

    // `general` es comodín de especialidad, pero no del tipo de equipo.
    describe.each<[TechnicianTeamType, WorkOrderType[], WorkOrderType[]]>([
      ['guardia', ['pronto-intervencion'], ['preventivo', 'correctivo']],
      ['preventivo-correctivo', ['preventivo', 'correctivo'], ['pronto-intervencion']],
    ])('general on %s', (teamType, handled, notHandled) => {
      const user = technician('general', teamType);

      it.each(SPECIALTIES.flatMap((specialty) => handled.map((type) => ({ type, specialty }))))(
        'handles $type of $specialty',
        (order) => {
          expect(canTechnicianHandle(user, order)).toBe(true);
        },
      );

      it.each(SPECIALTIES.flatMap((specialty) => notHandled.map((type) => ({ type, specialty }))))(
        'does not handle $type of $specialty',
        (order) => {
          expect(canTechnicianHandle(user, order)).toBe(false);
        },
      );
    });

    it('treats specialty and team type as independent attributes of the same technician', () => {
      const order = { type: 'pronto-intervencion', specialty: 'mecanico' } as const;

      expect(canTechnicianHandle(technician('mecanico', 'guardia'), order)).toBe(true);
      expect(canTechnicianHandle(technician('electricista', 'guardia'), order)).toBe(false);
      expect(canTechnicianHandle(technician('mecanico', 'preventivo-correctivo'), order)).toBe(
        false,
      );
    });

    it.each<[UserRole | 'no session', AuthUser | null]>([
      ...STAFF_ROLES.map((role): [UserRole, AuthUser] => [role, staff(role)]),
      ['no session', null],
    ])('never lets %s handle an order', (_label, user) => {
      for (const type of WORK_ORDER_TYPES) {
        for (const specialty of SPECIALTIES) {
          expect(canTechnicianHandle(user, { type, specialty })).toBe(false);
        }
      }
    });
  });

  describe('canTakeWorkOrder (spec 013d)', () => {
    it.each(SPECIALTIES)(
      'a guardia technician (%s) takes only pronto-intervencion',
      (specialty) => {
        const user = technician(specialty, 'guardia');

        expect(WORK_ORDER_TYPES.filter((type) => canTakeWorkOrder(user, { type }))).toEqual([
          'pronto-intervencion',
        ]);
      },
    );

    it.each(SPECIALTIES)(
      'a preventivo-correctivo technician (%s) takes preventivo and correctivo, not pronto',
      (specialty) => {
        const user = technician(specialty, 'preventivo-correctivo');

        expect(WORK_ORDER_TYPES.filter((type) => canTakeWorkOrder(user, { type }))).toEqual([
          'preventivo',
          'correctivo',
        ]);
      },
    );

    it('does not depend on the specialty: the general technician follows the team type too', () => {
      expect(
        canTakeWorkOrder(technician('general', 'guardia'), { type: 'pronto-intervencion' }),
      ).toBe(true);
      expect(canTakeWorkOrder(technician('general', 'guardia'), { type: 'preventivo' })).toBe(
        false,
      );
    });

    it.each(STAFF_ROLES)('does not let %s take any order', (role) => {
      for (const type of WORK_ORDER_TYPES) {
        expect(canTakeWorkOrder(staff(role), { type })).toBe(false);
      }
    });

    it('does not let a missing session take any order', () => {
      for (const type of WORK_ORDER_TYPES) {
        expect(canTakeWorkOrder(null, { type })).toBe(false);
      }
    });

    // Un rol nuevo obliga a decidir su permiso: si aparece en USER_ROLES, este test falla hasta que
    // se lo clasifique acá.
    it('classifies every user role', () => {
      expect([...USER_ROLES].sort()).toEqual([...STAFF_ROLES, 'tecnico'].sort());
    });
  });

  describe('canResolveWorkOrder (spec 013d)', () => {
    const mine = technician('mecanico', 'guardia');
    const taker = { id: mine.id, name: mine.displayName, at: '2026-09-25T10:00:00Z' };
    const order = (over: Partial<Pick<WorkOrder, 'type' | 'status' | 'takenBy'>> = {}) => ({
      type: 'pronto-intervencion' as WorkOrderType,
      status: 'in-progress' as WorkOrderStatus,
      takenBy: taker,
      ...over,
    });

    it('lets the technician who took an in-progress order continue it', () => {
      expect(canResolveWorkOrder(mine, order())).toBe(true);
    });

    it('does not let another technician resolve an order taken by someone else', () => {
      const other = { ...technician('mecanico', 'guardia'), id: 'otro' };

      expect(canResolveWorkOrder(other, order())).toBe(false);
    });

    it.each<[string, Partial<Pick<WorkOrder, 'status' | 'takenBy'>>]>([
      ['a pending order', { status: 'pending', takenBy: null }],
      ['a completed order', { status: 'completed' }],
      ['a cancelled order', { status: 'cancelled' }],
      ['an order without an owner', { takenBy: null }],
    ])('does not let the technician resolve %s', (_label, over) => {
      expect(canResolveWorkOrder(mine, order(over))).toBe(false);
    });

    it('does not let the technician resolve an order with no takenBy field', () => {
      expect(
        canResolveWorkOrder(mine, { type: 'pronto-intervencion', status: 'in-progress' }),
      ).toBe(false);
    });

    it('does not let a technician resolve an order of a type their team does not attend', () => {
      expect(canResolveWorkOrder(mine, order({ type: 'preventivo' }))).toBe(false);
    });

    it.each<[string, AuthUser | null]>([
      ['administrador', administrador],
      ['team leader', teamLeader],
      ['personal-produccion', produccion],
      ['no session', null],
    ])('does not let %s resolve', (_label, user) => {
      expect(canResolveWorkOrder(user, order({ takenBy: { ...taker, id: user?.id ?? 'x' } }))).toBe(
        false,
      );
    });
  });

  describe('canReleaseWorkOrder (spec 013d)', () => {
    it.each<[string, AuthUser]>([
      ['administrador', administrador],
      ['team leader', teamLeader],
    ])('lets %s release an in-progress order', (_label, user) => {
      expect(canReleaseWorkOrder(user, { status: 'in-progress' })).toBe(true);
    });

    it.each<WorkOrderStatus>(['pending', 'completed', 'cancelled'])(
      'does not let administrador release a %s order',
      (status) => {
        expect(canReleaseWorkOrder(administrador, { status })).toBe(false);
      },
    );

    it.each<[string, AuthUser | null]>([
      ['the technician who owns it', technician('mecanico', 'guardia')],
      ['personal-produccion', produccion],
      ['no session', null],
    ])('does not let %s release', (_label, user) => {
      expect(canReleaseWorkOrder(user, { status: 'in-progress' })).toBe(false);
    });
  });
});
