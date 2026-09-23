import { AuthSession, isAuthSession } from './auth.model';

describe('isAuthSession', () => {
  const validSession: AuthSession = {
    token: 'mock-token.1.1700000000000',
    user: {
      id: '1',
      username: 'admin',
      displayName: 'Administrador',
      email: 'admin@enterprise-lab.dev',
      role: 'admin',
    },
  };

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

  it.each(['admin', 'tecnico'] as const)('accepts a user with role %s', (role) => {
    expect(isAuthSession({ token: validSession.token, user: { ...validSession.user, role } })).toBe(
      true,
    );
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
  ])('rejects a session whose user has %s', (_label, role) => {
    expect(isAuthSession({ token: validSession.token, user: { ...validSession.user, role } })).toBe(
      false,
    );
  });

  it('rejects a session whose user has a non-string displayName', () => {
    expect(
      isAuthSession({
        token: validSession.token,
        user: { ...validSession.user, displayName: 7 },
      }),
    ).toBe(false);
  });
});
