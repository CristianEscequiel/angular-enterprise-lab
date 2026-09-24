import { TECHNICIAN_TEAM_TYPES } from '@core/auth/auth.model';
import { addMember, isTeamRecord, removeMember, Team, uniqueMembers } from './team.model';

describe('team model', () => {
  const valid: Team = {
    id: '1',
    name: 'Guardia mecánica',
    type: 'guardia',
    memberLegajos: ['1001', '1002'],
  };

  describe('isTeamRecord', () => {
    it('accepts a well-formed record', () => {
      expect(isTeamRecord(valid)).toBe(true);
    });

    it.each(TECHNICIAN_TEAM_TYPES)('accepts the team type %s', (type) => {
      expect(isTeamRecord({ ...valid, type })).toBe(true);
    });

    it('accepts a team without members', () => {
      expect(isTeamRecord({ ...valid, memberLegajos: [] })).toBe(true);
    });

    it.each(['id', 'name', 'type', 'memberLegajos'] as const)(
      'rejects a record without %s',
      (field) => {
        const record = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));

        expect(isTeamRecord(record)).toBe(false);
      },
    );

    it.each([
      ['an empty id', { id: '' }],
      ['a numeric id', { id: 1 }],
      ['an empty name', { name: '' }],
      ['a blank name', { name: '   ' }],
      ['a non-string name', { name: 7 }],
      ['an unknown type', { type: 'nocturno' }],
      ['a specialty in the type field', { type: 'mecanico' }],
      ['a non-string type', { type: 7 }],
    ])('rejects a record with %s', (_label, override) => {
      expect(isTeamRecord({ ...valid, ...override })).toBe(false);
    });

    it.each([
      ['a non-array', 'not-a-list'],
      ['null', null],
      ['a member that is not a string', ['1001', 1002]],
      ['a member with an invalid legajo', ['1001', '12a']],
      ['an empty member', ['1001', '']],
      ['a path traversal member', ['../users']],
    ])('rejects memberLegajos as %s', (_label, memberLegajos) => {
      expect(isTeamRecord({ ...valid, memberLegajos })).toBe(false);
    });

    it('rejects duplicated members', () => {
      expect(isTeamRecord({ ...valid, memberLegajos: ['1001', '1002', '1001'] })).toBe(false);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'team'],
      ['a number', 1],
      ['an empty object', {}],
    ])('rejects %s', (_label, value) => {
      expect(isTeamRecord(value)).toBe(false);
    });
  });

  describe('addMember', () => {
    it('adds a legajo that is not in the list yet, at the end', () => {
      expect(addMember(['1001'], '1002')).toEqual({ memberLegajos: ['1001', '1002'], added: true });
    });

    it('adds to an empty list', () => {
      expect(addMember([], '1001')).toEqual({ memberLegajos: ['1001'], added: true });
    });

    it('does not duplicate a legajo already in the list and reports it', () => {
      expect(addMember(['1001', '1002'], '1001')).toEqual({
        memberLegajos: ['1001', '1002'],
        added: false,
      });
    });

    it('compares legajos as exact strings ("0042" is not "42")', () => {
      expect(addMember(['0042'], '42')).toEqual({ memberLegajos: ['0042', '42'], added: true });
    });

    it('never mutates the list it receives', () => {
      const members = Object.freeze(['1001']);

      expect(addMember(members, '1002').memberLegajos).not.toBe(members);
      expect(addMember(members, '1001').memberLegajos).not.toBe(members);
      expect(members).toEqual(['1001']);
    });
  });

  describe('removeMember', () => {
    it('removes only that legajo and keeps the order of the rest', () => {
      expect(removeMember(['1001', '1002', '1003'], '1002')).toEqual(['1001', '1003']);
    });

    it('returns an equal list when the legajo is not a member', () => {
      expect(removeMember(['1001'], '9999')).toEqual(['1001']);
    });

    it('never mutates the list it receives', () => {
      const members = Object.freeze(['1001', '1002']);

      expect(removeMember(members, '1001')).toEqual(['1002']);
      expect(members).toEqual(['1001', '1002']);
    });
  });

  describe('uniqueMembers', () => {
    it('removes repeated legajos keeping the first occurrence and the order', () => {
      expect(uniqueMembers(['1001', '1002', '1001', '1003', '1002'])).toEqual([
        '1001',
        '1002',
        '1003',
      ]);
    });

    it('returns an equal list when there are no repeats, without mutating the input', () => {
      const members = Object.freeze(['1001', '1002']);

      expect(uniqueMembers(members)).toEqual(['1001', '1002']);
      expect(uniqueMembers(members)).not.toBe(members);
    });

    it('returns an empty list for an empty list', () => {
      expect(uniqueMembers([])).toEqual([]);
    });
  });
});
