import {
  AuthSession,
  isAuthSession,
  isTechnician,
  StaffRole,
  toAuthUser,
  TECHNICIAN_SPECIALTIES,
  TECHNICIAN_TEAM_TYPES,
  TechnicianUser,
} from './auth.model';

const STAFF_ROLES: StaffRole[] = [
  'administrador',
  'team-leader-mantenimiento',
  'personal-produccion',
];

describe('isAuthSession', () => {
  const validSession: AuthSession = {
    token: 'mock-token.1.1700000000000',
    user: {
      id: '1',
      username: 'admin',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'administrador',
    },
  };

  const validTechnician: TechnicianUser = {
    id: '4',
    username: 'tecnico',
    displayName: 'Técnico de Mantenimiento',
    email: 'tecnico@enterprise-lab.dev',
    role: 'tecnico',
    specialty: 'mecanico',
    teamType: 'guardia',
  };

  const sessionWith = (user: Record<string, unknown>) => ({ token: validSession.token, user });

  it('accepts a well-formed session', () => {
    expect(isAuthSession(validSession)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'mock-token'],
    ['a number', 42],
    ['an empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isAuthSession(value)).toBe(false);
  });

  it('rejects a session without token', () => {
    expect(isAuthSession({ user: validSession.user })).toBe(false);
  });

  it('rejects a session with an empty token', () => {
    expect(isAuthSession({ ...validSession, token: '' })).toBe(false);
  });

  it('rejects a session with a non-string token', () => {
    expect(isAuthSession({ ...validSession, token: 123 })).toBe(false);
  });

  it('rejects a session without user', () => {
    expect(isAuthSession({ token: validSession.token })).toBe(false);
  });

  it('rejects a session whose user is null', () => {
    expect(isAuthSession({ token: validSession.token, user: null })).toBe(false);
  });

  it('rejects a session whose user has no id', () => {
    const { displayName, email, username } = validSession.user;

    expect(
      isAuthSession({ token: validSession.token, user: { username, displayName, email } }),
    ).toBe(false);
  });

  it('rejects a session whose user has no username', () => {
    const { id, displayName, email } = validSession.user;

    expect(isAuthSession({ token: validSession.token, user: { id, displayName, email } })).toBe(
      false,
    );
  });

  it.each(STAFF_ROLES)('accepts a user with role %s and no technician attributes', (role) => {
    expect(isAuthSession(sessionWith({ ...validSession.user, role }))).toBe(true);
  });

  it('rejects a session whose user has no role', () => {
    const { id, username, displayName, email } = validSession.user;

    expect(
      isAuthSession({ token: validSession.token, user: { id, username, displayName, email } }),
    ).toBe(false);
  });

  it.each([
    ['an unknown role', 'superuser'],
    ['a non-string role', 7],
    ['an empty role', ''],
    ['the legacy role admin (before 013b)', 'admin'],
  ])('rejects a session whose user has %s', (_label, role) => {
    expect(isAuthSession(sessionWith({ ...validSession.user, role }))).toBe(false);
  });

  it('rejects a session whose user has a non-string displayName', () => {
    expect(
      isAuthSession({
        token: validSession.token,
        user: { ...validSession.user, displayName: 7 },
      }),
    ).toBe(false);
  });

  describe('technician attributes', () => {
    const combinations = TECHNICIAN_SPECIALTIES.flatMap((specialty) =>
      TECHNICIAN_TEAM_TYPES.map((teamType) => [specialty, teamType] as const),
    );

    it.each(combinations)(
      'accepts a technician with specialty %s and team type %s',
      (specialty, teamType) => {
        expect(isAuthSession(sessionWith({ ...validTechnician, specialty, teamType }))).toBe(true);
      },
    );

    it.each(['specialty', 'teamType'] as const)('rejects a technician without %s', (attribute) => {
      const withoutAttribute = Object.fromEntries(
        Object.entries(validTechnician).filter(([key]) => key !== attribute),
      );

      expect(isAuthSession(sessionWith(withoutAttribute))).toBe(false);
    });

    // Un valor inválido en un atributo se rechaza aunque el otro sea válido: son independientes.
    it.each([
      ['an unknown specialty', { specialty: 'plomero' }],
      ['a non-string specialty', { specialty: 7 }],
      ['an unknown team type', { teamType: 'nocturno' }],
      ['a non-string team type', { teamType: 7 }],
      ['a team type in the specialty field', { specialty: 'guardia' }],
      ['a specialty in the team type field', { teamType: 'mecanico' }],
    ])('rejects a technician with %s', (_label, override) => {
      expect(isAuthSession(sessionWith({ ...validTechnician, ...override }))).toBe(false);
    });

    it.each(STAFF_ROLES)('rejects a %s carrying a specialty', (role) => {
      expect(
        isAuthSession(sessionWith({ ...validSession.user, role, specialty: 'mecanico' })),
      ).toBe(false);
    });

    it.each(STAFF_ROLES)('rejects a %s carrying a team type', (role) => {
      expect(isAuthSession(sessionWith({ ...validSession.user, role, teamType: 'guardia' }))).toBe(
        false,
      );
    });
  });

  describe('isTechnician', () => {
    it('is true only for the tecnico role', () => {
      expect(isTechnician(validTechnician)).toBe(true);
      expect(isTechnician(validSession.user)).toBe(false);
    });
  });

  describe('toAuthUser', () => {
    const record = { ...validSession.user, password: 'admin123' };

    it('builds the session user without the password', () => {
      expect(toAuthUser(record)).toEqual(validSession.user);
      expect(toAuthUser(record)).not.toHaveProperty('password');
    });

    it('copies specialty and team type for a technician', () => {
      expect(toAuthUser({ ...validTechnician, password: 'x' })).toEqual(validTechnician);
    });

    it('drops technician attributes carried by a record that is not a technician', () => {
      const user = toAuthUser({ ...record, specialty: 'mecanico', teamType: 'guardia' });

      expect(user).toEqual(validSession.user);
      expect(user).not.toHaveProperty('specialty');
      expect(user).not.toHaveProperty('teamType');
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'admin'],
      ['a number', 7],
    ])('returns null for %s', (_label, value) => {
      expect(toAuthUser(value)).toBeNull();
    });

    it.each([
      ['an unknown role', { ...record, role: 'admin' }],
      ['a technician without specialty', { ...validTechnician, specialty: undefined }],
      ['a technician without team type', { ...validTechnician, teamType: undefined }],
      ['a record without id', { ...record, id: '' }],
    ])('returns null for %s', (_label, value) => {
      expect(toAuthUser(value)).toBeNull();
    });
  });
});
