import { AuthUser, UserRole } from '@core/auth/auth.model';

// La carga de trabajo por técnico la ve quien asigna y supervisa (spec 018, REQ-11.4): administrador y
// team leader. Es una regla de navegación/UX; la API responde `403` al resto.
const WORKLOAD_ROLES: readonly UserRole[] = ['administrador', 'team-leader-mantenimiento'];

export function canViewWorkload(user: AuthUser | null): boolean {
  return user !== null && WORKLOAD_ROLES.includes(user.role);
}
