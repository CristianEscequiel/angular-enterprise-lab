import { AuthUser, StaffRole, TechnicianUser, USER_ROLES } from '@core/auth/auth.model';
import {
  canCreateTechnician,
  canDeleteTechnician,
  canEditTechnician,
  canManageTeams,
  canViewTechnicians,
} from './maintenance.permissions';

function staff(role: StaffRole): AuthUser {
  return {
    id: role,
    username: role,
    displayName: role,
    email: `${role}@enterprise-lab.dev`,
    role,
  };
}

const tecnico: TechnicianUser = {
  id: 'tec',
  username: 'tecnico',
  displayName: 'Técnico',
  email: 'tecnico@enterprise-lab.dev',
  role: 'tecnico',
  legajo: '1001',
  specialty: 'mecanico',
  teamType: 'guardia',
};

const administrador = staff('administrador');
const teamLeader = staff('team-leader-mantenimiento');
const produccion = staff('personal-produccion');

type Policy = (user: AuthUser | null) => boolean;

describe('maintenance permissions', () => {
  // Si se agrega un rol nuevo, este test obliga a decidir sus permisos en la tabla de abajo.
  it('covers every role of the system in the truth table below', () => {
    const covered = [administrador, teamLeader, produccion, tecnico].map((user) => user.role);

    expect([...covered].sort()).toEqual([...USER_ROLES].sort());
  });

  describe.each<[string, Policy, AuthUser[]]>([
    ['canViewTechnicians', canViewTechnicians, [administrador, teamLeader]],
    ['canCreateTechnician', canCreateTechnician, [administrador, teamLeader]],
    ['canEditTechnician', canEditTechnician, [administrador, teamLeader]],
    // Solo Administrador elimina: el TeamLeader crea y modifica, pero no elimina.
    ['canDeleteTechnician', canDeleteTechnician, [administrador]],
    // Equipos: gestión exclusiva del TeamLeader.
    ['canManageTeams', canManageTeams, [teamLeader]],
  ])('%s', (_name, policy, allowed) => {
    const everyone = [administrador, teamLeader, produccion, tecnico];

    it.each(allowed.map((user) => [user.role, user] as const))('lets %s', (_role, user) => {
      expect(policy(user)).toBe(true);
    });

    it.each(
      everyone.filter((user) => !allowed.includes(user)).map((user) => [user.role, user] as const),
    )('does not let %s', (_role, user) => {
      expect(policy(user)).toBe(false);
    });

    it('does not let an anonymous visitor (no session)', () => {
      expect(policy(null)).toBe(false);
    });
  });

  it('does not let the team leader delete a technician even though they can create and edit', () => {
    expect(canCreateTechnician(teamLeader)).toBe(true);
    expect(canEditTechnician(teamLeader)).toBe(true);
    expect(canDeleteTechnician(teamLeader)).toBe(false);
  });

  it('keeps the administrador out of the teams section', () => {
    expect(canManageTeams(administrador)).toBe(false);
  });

  it('gives production staff and technicians no access to anything', () => {
    for (const user of [produccion, tecnico]) {
      expect(
        [
          canViewTechnicians,
          canCreateTechnician,
          canEditTechnician,
          canDeleteTechnician,
          canManageTeams,
        ].some((policy) => policy(user)),
      ).toBe(false);
    }
  });
});
