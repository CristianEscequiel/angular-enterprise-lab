export interface LoginCredentials {
  username: string;
  password: string;
}

export const USER_ROLES = [
  'administrador',
  'team-leader-mantenimiento',
  'personal-produccion',
  'tecnico',
] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type StaffRole = Exclude<UserRole, 'tecnico'>;

// Atributos del perfil del técnico. Son independientes entre sí: la especialidad dice qué
// órdenes puede tomar y el tipo de equipo, en qué turno/tipo de trabajo opera.
export const TECHNICIAN_SPECIALTIES = ['mecanico', 'electricista', 'general'] as const;
export type TechnicianSpecialty = (typeof TECHNICIAN_SPECIALTIES)[number];

export const TECHNICIAN_TEAM_TYPES = ['guardia', 'preventivo-correctivo'] as const;
export type TechnicianTeamType = (typeof TECHNICIAN_TEAM_TYPES)[number];

interface AuthUserBase {
  id: string;
  username: string;
  displayName: string;
  email: string;
}

// Unión discriminada por `role`: `specialty` y `teamType` solo existen en el técnico, y el
// compilador exige comprobar `role === 'tecnico'` (o `isTechnician`) antes de leerlos.
export interface TechnicianUser extends AuthUserBase {
  role: 'tecnico';
  specialty: TechnicianSpecialty;
  teamType: TechnicianTeamType;
}

export interface StaffUser extends AuthUserBase {
  role: StaffRole;
}

export type AuthUser = TechnicianUser | StaffUser;

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export type UserRecord = AuthUser & { password: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

export function isTechnicianSpecialty(value: unknown): value is TechnicianSpecialty {
  return TECHNICIAN_SPECIALTIES.some((specialty) => specialty === value);
}

export function isTechnicianTeamType(value: unknown): value is TechnicianTeamType {
  return TECHNICIAN_TEAM_TYPES.some((teamType) => teamType === value);
}

export function isTechnician(user: AuthUser): user is TechnicianUser {
  return user.role === 'tecnico';
}

export function isAuthUser(value: unknown): value is AuthUser {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value['id']) ||
    !isNonEmptyString(value['username']) ||
    typeof value['displayName'] !== 'string' ||
    typeof value['email'] !== 'string' ||
    !isUserRole(value['role'])
  ) {
    return false;
  }

  // Estricto en ambos sentidos: un técnico sin sus atributos o un no-técnico con ellos es un
  // perfil inconsistente y no se restaura, en vez de completarlo con valores por defecto.
  if (value['role'] === 'tecnico') {
    return isTechnicianSpecialty(value['specialty']) && isTechnicianTeamType(value['teamType']);
  }

  return value['specialty'] === undefined && value['teamType'] === undefined;
}

// Arma el usuario de sesión a partir de un registro de la base sin arrastrar `password` ni
// campos ajenos. `specialty`/`teamType` se copian solo si el rol es técnico. Devuelve null si el
// registro no produce un perfil válido (p. ej. técnico sin especialidad): no se completa nada.
export function toAuthUser(record: unknown): AuthUser | null {
  if (!isRecord(record)) {
    return null;
  }

  const base = {
    id: record['id'],
    username: record['username'],
    displayName: record['displayName'],
    email: record['email'],
    role: record['role'],
  };
  const candidate =
    base.role === 'tecnico'
      ? { ...base, specialty: record['specialty'], teamType: record['teamType'] }
      : base;

  return isAuthUser(candidate) ? candidate : null;
}

export function isAuthSession(value: unknown): value is AuthSession {
  return isRecord(value) && isNonEmptyString(value['token']) && isAuthUser(value['user']);
}
