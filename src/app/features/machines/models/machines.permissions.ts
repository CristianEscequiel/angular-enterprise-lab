import { AuthUser, UserRole } from '@core/auth/auth.model';

// Política de permisos del maestro de máquinas y su árbol de partes. Es una fuente única: los
// guards de ruta, las páginas y el sidebar la consultan en vez de repetir reglas por rol. Son
// reglas de navegación/UX: la autorización real será del backend (spec 018).
//
// Administrador y TeamLeader tienen el MISMO nivel para todo (crear, modificar y eliminar máquinas
// y partes), así que hay un solo predicado en vez de uno por acción. Producción y técnico no
// gestionan nada; que 013d les muestre el árbol para elegir una parte no pasa por esta política.
const MACHINE_MANAGER_ROLES: readonly UserRole[] = ['administrador', 'team-leader-mantenimiento'];

export function canManageMachines(user: AuthUser | null): boolean {
  return user !== null && MACHINE_MANAGER_ROLES.includes(user.role);
}
