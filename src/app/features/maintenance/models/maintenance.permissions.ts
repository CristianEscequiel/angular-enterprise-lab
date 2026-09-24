import { AuthUser, UserRole } from '@core/auth/auth.model';

// Política de permisos de técnicos y equipos. Es una fuente única: los guards de ruta y las páginas
// (botones, acciones) la consultan en vez de repetir reglas por rol. Son reglas de navegación/UX:
// la autorización real será del backend (spec 018).

// Ver y dar de alta/modificar técnicos: Administrador y TeamLeader. Solo Administrador elimina.
const TECHNICIAN_MANAGER_ROLES: readonly UserRole[] = [
  'administrador',
  'team-leader-mantenimiento',
];
const TECHNICIAN_DELETE_ROLES: readonly UserRole[] = ['administrador'];

// Equipos: gestión completa exclusiva de TeamLeader. El spec la llama "exclusiva", así que el
// Administrador ni siquiera ve la sección (si debiera verla de solo lectura, se agrega acá).
const TEAM_MANAGER_ROLES: readonly UserRole[] = ['team-leader-mantenimiento'];

function hasRole(user: AuthUser | null, roles: readonly UserRole[]): boolean {
  return user !== null && roles.includes(user.role);
}

export function canViewTechnicians(user: AuthUser | null): boolean {
  return hasRole(user, TECHNICIAN_MANAGER_ROLES);
}

export function canCreateTechnician(user: AuthUser | null): boolean {
  return hasRole(user, TECHNICIAN_MANAGER_ROLES);
}

export function canEditTechnician(user: AuthUser | null): boolean {
  return hasRole(user, TECHNICIAN_MANAGER_ROLES);
}

export function canDeleteTechnician(user: AuthUser | null): boolean {
  return hasRole(user, TECHNICIAN_DELETE_ROLES);
}

// Ver, crear, modificar y eliminar equipos.
export function canManageTeams(user: AuthUser | null): boolean {
  return hasRole(user, TEAM_MANAGER_ROLES);
}
