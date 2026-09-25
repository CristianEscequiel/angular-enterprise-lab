import {
  AuthUser,
  isTechnician,
  TechnicianSpecialty,
  TechnicianTeamType,
  UserRole,
} from '@core/auth/auth.model';
import { WorkOrder, WorkOrderType } from './work-order.model';

// Política de permisos sobre órdenes de trabajo. Es una fuente única: los guards de ruta y las
// páginas (botones, acciones) la consultan en vez de repetir reglas por rol. Son reglas de
// navegación/UX: la autorización real será del backend (spec 018).

// Especialidad que una orden requiere. `general` no aparece: es el comodín del técnico, no
// algo que una orden pida.
export type OrderSpecialty = Exclude<TechnicianSpecialty, 'general'>;

export interface TechnicianOrderQuery {
  type: WorkOrderType;
  specialty: OrderSpecialty;
}

const CREATABLE_TYPES: Record<UserRole, readonly WorkOrderType[]> = {
  administrador: [],
  'team-leader-mantenimiento': ['preventivo', 'correctivo'],
  // Único rol habilitado para pronto-intervención (guardia).
  'personal-produccion': ['pronto-intervencion'],
  tecnico: [],
};

const EDIT_ROLES: readonly UserRole[] = ['administrador', 'team-leader-mantenimiento'];
const DELETE_ROLES: readonly UserRole[] = ['administrador'];
// Mismo nivel de permiso que la gestión de máquinas (013a): liberan una orden que un técnico dejó
// trabada.
const RELEASE_ROLES: readonly UserRole[] = ['administrador', 'team-leader-mantenimiento'];

// Qué tipos de orden atiende cada tipo de equipo del técnico.
const TEAM_TYPE_ORDER_TYPES: Record<TechnicianTeamType, readonly WorkOrderType[]> = {
  guardia: ['pronto-intervencion'],
  'preventivo-correctivo': ['preventivo', 'correctivo'],
};

export function creatableTypes(user: AuthUser | null): readonly WorkOrderType[] {
  return user ? CREATABLE_TYPES[user.role] : [];
}

export function canCreateWorkOrder(user: AuthUser | null, type: WorkOrderType): boolean {
  return creatableTypes(user).includes(type);
}

export function canEditWorkOrder(user: AuthUser | null): boolean {
  return user !== null && EDIT_ROLES.includes(user.role);
}

export function canDeleteWorkOrder(user: AuthUser | null): boolean {
  return user !== null && DELETE_ROLES.includes(user.role);
}

// Tomar una orden (spec 013d): solo el técnico cuyo tipo de equipo atiende el tipo de la orden
// (`guardia` → pronto-intervención; `preventivo-correctivo` → preventivo y correctivo). La
// especialidad NO se evalúa: las órdenes todavía no la llevan (ver `canTechnicianHandle`, que la
// exige). Que la orden esté pendiente lo decide el servicio con el estado fresco, no esta política.
export function canTakeWorkOrder(user: AuthUser | null, order: Pick<WorkOrder, 'type'>): boolean {
  if (!user || !isTechnician(user)) {
    return false;
  }

  return TEAM_TYPE_ORDER_TYPES[user.teamType].includes(order.type);
}

// Continuar/cerrar la orden: la puede tomar Y es suya (la tiene en progreso a su nombre). Otro
// técnico no cierra una orden que ejecuta alguien más.
export function canResolveWorkOrder(
  user: AuthUser | null,
  order: Pick<WorkOrder, 'type' | 'status' | 'takenBy'>,
): boolean {
  return (
    user !== null &&
    canTakeWorkOrder(user, order) &&
    order.status === 'in-progress' &&
    order.takenBy?.id === user.id
  );
}

// Liberar una orden en progreso (vuelve a pendiente, sin dueño): administrador y team leader. El
// técnico dueño no puede devolver su propia orden.
export function canReleaseWorkOrder(
  user: AuthUser | null,
  order: Pick<WorkOrder, 'status'>,
): boolean {
  return user !== null && RELEASE_ROLES.includes(user.role) && order.status === 'in-progress';
}

// Consulta de "qué órdenes puede gestionar" (tomar, comentar, cerrar). Especialidad y tipo de
// equipo se evalúan por separado: hacen falta las dos. La asignación real es de spec 013d.
export function canTechnicianHandle(user: AuthUser | null, order: TechnicianOrderQuery): boolean {
  if (!user || !isTechnician(user)) {
    return false;
  }

  const matchesSpecialty = user.specialty === 'general' || user.specialty === order.specialty;
  const matchesTeamType = TEAM_TYPE_ORDER_TYPES[user.teamType].includes(order.type);

  return matchesSpecialty && matchesTeamType;
}
