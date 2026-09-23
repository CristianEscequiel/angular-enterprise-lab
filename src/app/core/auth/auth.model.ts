export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface UserRecord extends AuthUser {
  password: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['username']) &&
    typeof value['displayName'] === 'string' &&
    typeof value['email'] === 'string'
  );
}

export function isAuthSession(value: unknown): value is AuthSession {
  return isRecord(value) && isNonEmptyString(value['token']) && isAuthUser(value['user']);
}
