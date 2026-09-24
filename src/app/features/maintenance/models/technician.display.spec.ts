import { TECHNICIAN_SPECIALTIES, TECHNICIAN_TEAM_TYPES } from '@core/auth/auth.model';
import { SPECIALTY_LABELS, TEAM_TYPE_LABELS } from './technician.display';

describe('technician display maps', () => {
  it.each([
    ['SPECIALTY_LABELS', SPECIALTY_LABELS, TECHNICIAN_SPECIALTIES],
    ['TEAM_TYPE_LABELS', TEAM_TYPE_LABELS, TECHNICIAN_TEAM_TYPES],
  ] as const)('%s has exactly one entry per model value', (_name, map, values) => {
    expect(Object.keys(map).sort()).toEqual([...values].sort());
  });

  it('labels every specialty', () => {
    expect(SPECIALTY_LABELS).toEqual({
      mecanico: 'Mecánico',
      electricista: 'Electricista',
      general: 'General',
    });
  });

  it('labels every team type', () => {
    expect(TEAM_TYPE_LABELS).toEqual({
      guardia: 'Guardia',
      'preventivo-correctivo': 'Preventivo-correctivo',
    });
  });
});
