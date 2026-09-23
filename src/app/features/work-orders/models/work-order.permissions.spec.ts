import {
  AuthUser,
  StaffRole,
  TechnicianSpecialty,
  TechnicianTeamType,
  TechnicianUser,
  UserRole,
} from '@core/auth/auth.model';
import { WORK_ORDER_TYPES, WorkOrderType } from './work-order.model';
import {
  canCreateWorkOrder,
  canDeleteWorkOrder,
  canEditWorkOrder,
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
});
