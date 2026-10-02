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

// Perfil laboral del técnico. Su fuente de verdad es el maestro de técnicos (`/technicians`); el
// usuario de login solo guarda el `legajo` que lo vincula y el login copia el perfil a la sesión.
export interface TechnicianProfile {
  specialty: TechnicianSpecialty;
  teamType: TechnicianTeamType;
}

// El legajo es el vínculo entre el usuario de login y el maestro de técnicos. Solo dígitos: además
// de ser el formato del dominio, garantiza que nunca llegue a una URL algo como `../users`.
export const LEGAJO_PATTERN = /^\d{1,8}$/;

interface AuthUserBase {
  id: string;
  username: string;
  displayName: string;
  email: string;
}

// Unión discriminada por `role`: `legajo`, `specialty` y `teamType` solo existen en el técnico, y
// el compilador exige comprobar `role === 'tecnico'` (o `isTechnician`) antes de leerlos.
export interface TechnicianUser extends AuthUserBase, TechnicianProfile {
  role: 'tecnico';
  legajo: string;
}

export interface StaffUser extends AuthUserBase {
  role: StaffRole;
}

export type AuthUser = TechnicianUser | StaffUser;

export interface AuthSession {
  token: string;
  user: AuthUser;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isLegajo(value: unknown): value is string {
  return typeof value === 'string' && LEGAJO_PATTERN.test(value);
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
    return (
      isLegajo(value['legajo']) &&
      isTechnicianSpecialty(value['specialty']) &&
      isTechnicianTeamType(value['teamType'])
    );
  }

  return (
    value['legajo'] === undefined &&
    value['specialty'] === undefined &&
    value['teamType'] === undefined
  );
}

export function isAuthSession(value: unknown): value is AuthSession {
  return isRecord(value) && isNonEmptyString(value['token']) && isAuthUser(value['user']);
}
