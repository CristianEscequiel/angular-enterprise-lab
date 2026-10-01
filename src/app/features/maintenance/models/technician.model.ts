import {
  isLegajo,
  isTechnicianSpecialty,
  isTechnicianTeamType,
  TechnicianProfile,
} from '@core/auth/auth.model';

// Maestro de técnicos (`/technicians`): entidad independiente del usuario de login. Existe sin que el
// técnico tenga acceso al sistema; se vincula con `users` solo por `legajo`. Especialidad y tipo
// de equipo se reutilizan de `auth.model.ts` (`TechnicianProfile`) para no duplicar los valores.
//
// `id` lo genera el servidor y es opaco: NO es el legajo (la API ignora el `id` que manda el
// cliente al crear). El identificador de negocio es `legajo`: es único (lo garantiza la API) y
// no se puede editar, porque es el vínculo con el usuario de login y con los equipos. Se busca con
// `GET /technicians/{legajo}`.
export interface Technician extends TechnicianProfile {
  id: string;
  legajo: string;
  firstName: string;
  lastName: string;
}

// Lo que se ingresa al dar de alta un técnico (el `id` lo asigna el servidor).
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
    isNonBlankString(record['id']) &&
    isLegajo(record['legajo']) &&
    isNonBlankString(record['firstName']) &&
    isNonBlankString(record['lastName']) &&
    isTechnicianSpecialty(record['specialty']) &&
    isTechnicianTeamType(record['teamType'])
  );
}

export function fullName(technician: Pick<Technician, 'firstName' | 'lastName'>): string {
  return `${technician.lastName}, ${technician.firstName}`;
}
