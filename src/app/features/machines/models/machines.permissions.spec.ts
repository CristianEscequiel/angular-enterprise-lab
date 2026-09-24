import {
  AuthUser,
  TECHNICIAN_SPECIALTIES,
  TECHNICIAN_TEAM_TYPES,
  TechnicianUser,
  USER_ROLES,
  UserRole,
} from '@core/auth/auth.model';
import { canManageMachines } from './machines.permissions';

function userWithRole(role: UserRole): AuthUser {
  if (role === 'tecnico') {
    return technician('mecanico', 'guardia');
  }

  return {
    id: role,
    username: role,
    displayName: role,
    email: `${role}@enterprise-lab.dev`,
    role,
  };
}

function technician(
  specialty: TechnicianUser['specialty'],
  teamType: TechnicianUser['teamType'],
): TechnicianUser {
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

// Tabla de verdad. Es un `Record<UserRole, …>`: si se agrega un rol al sistema, este archivo deja
// de compilar hasta que alguien decida si puede gestionar máquinas.
const CAN_MANAGE: Record<UserRole, boolean> = {
  administrador: true,
  'team-leader-mantenimiento': true,
  'personal-produccion': false,
  tecnico: false,
};

describe('machines permissions', () => {
  describe('canManageMachines', () => {
    it('has a decision for every role of the system', () => {
      expect(Object.keys(CAN_MANAGE).sort()).toEqual([...USER_ROLES].sort());
    });

    it.each(USER_ROLES.map((role) => [role, CAN_MANAGE[role]] as const))(
      'role %s → %s',
      (role, expected) => {
        expect(canManageMachines(userWithRole(role))).toBe(expected);
      },
    );

    // Criterio 3 del spec: producción y técnico no pueden gestionar máquinas ni partes.
    it.each(['personal-produccion', 'tecnico'] as const)('does not let %s', (role) => {
      expect(canManageMachines(userWithRole(role))).toBe(false);
    });

    it('gives administrador and team-leader-mantenimiento the same level', () => {
      expect(canManageMachines(userWithRole('administrador'))).toBe(
        canManageMachines(userWithRole('team-leader-mantenimiento')),
      );
      expect(canManageMachines(userWithRole('administrador'))).toBe(true);
    });

    it('does not let an anonymous visitor (no session)', () => {
      expect(canManageMachines(null)).toBe(false);
    });

    // La especialidad y el tipo de equipo del técnico no le dan acceso: solo cuenta el rol.
    it.each(
      TECHNICIAN_SPECIALTIES.flatMap((specialty) =>
        TECHNICIAN_TEAM_TYPES.map((teamType) => [specialty, teamType] as const),
      ),
    )('does not let a technician with specialty %s and team type %s', (specialty, teamType) => {
      expect(canManageMachines(technician(specialty, teamType))).toBe(false);
    });

    it('does not let a session with an unknown role (tampered storage)', () => {
      const tampered = {
        ...userWithRole('administrador'),
        role: 'superadmin',
      } as unknown as AuthUser;

      expect(canManageMachines(tampered)).toBe(false);
    });
  });
});
