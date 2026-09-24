import { TechnicianSpecialty, TechnicianTeamType } from '@core/auth/auth.model';

export const SPECIALTY_LABELS: Record<TechnicianSpecialty, string> = {
  mecanico: 'Mecánico',
  electricista: 'Electricista',
  general: 'General',
};

export const TEAM_TYPE_LABELS: Record<TechnicianTeamType, string> = {
  guardia: 'Guardia',
  'preventivo-correctivo': 'Preventivo-correctivo',
};
