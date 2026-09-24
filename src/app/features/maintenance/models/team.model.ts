import { isLegajo, isTechnicianTeamType, TechnicianTeamType } from '@core/auth/auth.model';

// Equipo (`/equipos`): agrupación gestionable de técnicos. Los miembros se guardan como lista de
// legajos dentro del propio equipo (no en una colección de unión), así un solo `PUT` guarda el
// equipo y sus miembros. El `type` usa los mismos valores que el `teamType` del técnico, pero no se
// exige que coincidan (spec 013c: no se valida la coherencia entre ambos).
export interface Team {
  id: string;
  name: string;
  type: TechnicianTeamType;
  memberLegajos: string[];
}

// Lo que se ingresa al crear o editar un equipo (el `id` lo genera json-server).
export type TeamDraft = Omit<Team, 'id'>;

export interface AddMemberResult {
  memberLegajos: string[];
  // false cuando el legajo ya estaba en la lista: la lista vuelve igual y quien llama decide
  // qué mensaje mostrar.
  added: boolean;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNoDuplicates(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function isTeamRecord(value: unknown): value is Team {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const members = record['memberLegajos'];

  return (
    typeof record['id'] === 'string' &&
    record['id'].length > 0 &&
    isNonBlankString(record['name']) &&
    isTechnicianTeamType(record['type']) &&
    Array.isArray(members) &&
    members.every(isLegajo) &&
    hasNoDuplicates(members)
  );
}

// Puras e inmutables: nunca modifican la lista recibida.
export function addMember(memberLegajos: readonly string[], legajo: string): AddMemberResult {
  if (memberLegajos.includes(legajo)) {
    return { memberLegajos: [...memberLegajos], added: false };
  }

  return { memberLegajos: [...memberLegajos, legajo], added: true };
}

export function removeMember(memberLegajos: readonly string[], legajo: string): string[] {
  return memberLegajos.filter((member) => member !== legajo);
}

// Quita repetidos conservando la primera aparición. Es la red de seguridad de la capa de datos:
// la interfaz ya impide duplicar (`addMember`), pero lo que se persiste nunca debe tenerlos.
export function uniqueMembers(memberLegajos: readonly string[]): string[] {
  return [...new Set(memberLegajos)];
}
