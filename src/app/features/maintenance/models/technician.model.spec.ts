import { TECHNICIAN_SPECIALTIES, TECHNICIAN_TEAM_TYPES } from '@core/auth/auth.model';
import { fullName, isTechnicianRecord, Technician } from './technician.model';

describe('technician model', () => {
  const valid: Technician = {
    id: '1001',
    legajo: '1001',
    firstName: 'Ana',
    lastName: 'Ruiz',
    specialty: 'mecanico',
    teamType: 'guardia',
  };

  const without = (field: keyof Technician) =>
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));

  describe('isTechnicianRecord', () => {
    it('accepts a well-formed record', () => {
      expect(isTechnicianRecord(valid)).toBe(true);
    });

    const combinations = TECHNICIAN_SPECIALTIES.flatMap((specialty) =>
      TECHNICIAN_TEAM_TYPES.map((teamType) => [specialty, teamType] as const),
    );

    it.each(combinations)('accepts specialty %s with team type %s', (specialty, teamType) => {
      expect(isTechnicianRecord({ ...valid, specialty, teamType })).toBe(true);
    });

    it('accepts a legajo with leading zeros', () => {
      expect(isTechnicianRecord({ ...valid, id: '0042', legajo: '0042' })).toBe(true);
    });

    it.each(['id', 'legajo', 'firstName', 'lastName', 'specialty', 'teamType'] as const)(
      'rejects a record without %s',
      (field) => {
        expect(isTechnicianRecord(without(field))).toBe(false);
      },
    );

    // Un valor inválido en un atributo se rechaza aunque el otro sea válido: son independientes.
    it.each([
      ['an unknown specialty', { specialty: 'plomero' }],
      ['a non-string specialty', { specialty: 7 }],
      ['a team type in the specialty field', { specialty: 'guardia' }],
      ['an unknown team type', { teamType: 'nocturno' }],
      ['a non-string team type', { teamType: 7 }],
      ['a specialty in the team type field', { teamType: 'mecanico' }],
    ])('rejects a record with %s', (_label, override) => {
      expect(isTechnicianRecord({ ...valid, ...override })).toBe(false);
    });

    it.each([
      ['an empty first name', { firstName: '' }],
      ['a blank first name', { firstName: '   ' }],
      ['a non-string first name', { firstName: 7 }],
      ['an empty last name', { lastName: '' }],
      ['a blank last name', { lastName: '  ' }],
      ['a non-string last name', { lastName: null }],
    ])('rejects a record with %s', (_label, override) => {
      expect(isTechnicianRecord({ ...valid, ...override })).toBe(false);
    });

    it.each([
      ['an empty legajo', { id: '', legajo: '' }],
      ['a legajo with letters', { id: '12a', legajo: '12a' }],
      ['a path traversal', { id: '../users', legajo: '../users' }],
      ['nine digits', { id: '123456789', legajo: '123456789' }],
      ['a numeric legajo', { id: 1001, legajo: 1001 }],
    ])('rejects a record with %s', (_label, override) => {
      expect(isTechnicianRecord({ ...valid, ...override })).toBe(false);
    });

    it('rejects a record whose id differs from its legajo', () => {
      expect(isTechnicianRecord({ ...valid, id: '1002' })).toBe(false);
      expect(isTechnicianRecord({ ...valid, legajo: '1002' })).toBe(false);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', '1001'],
      ['a number', 1001],
      ['an empty object', {}],
    ])('rejects %s', (_label, value) => {
      expect(isTechnicianRecord(value)).toBe(false);
    });
  });

  describe('fullName', () => {
    it('formats the name as "Apellido, Nombre"', () => {
      expect(fullName(valid)).toBe('Ruiz, Ana');
    });
  });
});
