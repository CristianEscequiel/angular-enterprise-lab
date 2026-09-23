import {
  AuthUser,
  isTechnician,
  TechnicianSpecialty,
  TechnicianTeamType,
  UserRole,
} from '@core/auth/auth.model';
import { WorkOrderType } from './work-order.model';

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
