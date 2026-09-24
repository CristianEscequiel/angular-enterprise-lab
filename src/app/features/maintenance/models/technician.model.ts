import {
  isLegajo,
  isTechnicianSpecialty,
  isTechnicianTeamType,
  TechnicianProfile,
} from '@core/auth/auth.model';

// Maestro de técnicos (`/tecnicos`): entidad independiente del usuario de login. Existe sin que el
// técnico tenga acceso al sistema; se vincula con `users` solo por `legajo`. Especialidad y tipo
// de equipo se reutilizan de `auth.model.ts` (`TechnicianProfile`) para no duplicar los valores.
//
// `id === legajo`: json-server exige `id` y el legajo ya es el identificador único, así el
// registro se consulta por ruta (`/tecnicos/:legajo`). El servicio escribe los dos iguales y el
// legajo no se puede editar.
export interface Technician extends TechnicianProfile {
  id: string;
  legajo: string;
  firstName: string;
  lastName: string;
}

// Lo que se ingresa al dar de alta un técnico (el `id` lo fija el servicio a partir del legajo).
export type TechnicianDraft = Omit<Technician, 'id'>;

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Nombre distinto de `isTechnician(user)` de auth, que pregunta por el rol de un usuario de login.
export function isTechnicianRecord(value: unknown): value is Technician {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isLegajo(record['legajo']) &&
    record['id'] === record['legajo'] &&
    isNonBlankString(record['firstName']) &&
    isNonBlankString(record['lastName']) &&
    isTechnicianSpecialty(record['specialty']) &&
    isTechnicianTeamType(record['teamType'])
  );
}

export function fullName(technician: Pick<Technician, 'firstName' | 'lastName'>): string {
  return `${technician.lastName}, ${technician.firstName}`;
}
