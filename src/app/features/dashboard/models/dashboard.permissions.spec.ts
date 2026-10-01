import { AuthUser, UserRole } from '@core/auth/auth.model';
import { canViewWorkload } from './dashboard.permissions';

describe('canViewWorkload', () => {
  const userWith = (role: UserRole): AuthUser =>
    role === 'tecnico'
      ? {
          id: 't',
          username: 'tecnico',
          displayName: 'Técnico',
          email: 't@enterprise-lab.dev',
          role,
          legajo: '1001',
          specialty: 'mecanico',
          teamType: 'guardia',
        }
      : { id: role, username: role, displayName: role, email: `${role}@enterprise-lab.dev`, role };

  it.each(['administrador', 'team-leader-mantenimiento'] as const)('lets %s see it', (role) => {
    expect(canViewWorkload(userWith(role))).toBe(true);
  });

  it.each(['personal-produccion', 'tecnico'] as const)('does not let %s see it', (role) => {
    expect(canViewWorkload(userWith(role))).toBe(false);
  });

  it('does not let anybody without a session see it', () => {
    expect(canViewWorkload(null)).toBe(false);
  });
});
