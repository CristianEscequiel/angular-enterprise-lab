export const DEFAULT_RETURN_URL = '/dashboard';

// Solo se aceptan rutas internas de la app: un `returnUrl` llega por query param y por lo
// tanto es input del usuario. `//host`, `/\host` y variantes con whitespace se interpretan
// como URLs externas en algunos navegadores, y volver a /login sería un bucle.
export function sanitizeReturnUrl(returnUrl: string | null | undefined): string {
  if (!returnUrl || !returnUrl.startsWith('/') || /^\/[/\\\s]/.test(returnUrl)) {
    return DEFAULT_RETURN_URL;
  }

  const path = returnUrl.split(/[?#]/)[0];
  if (path === '/login' || path?.startsWith('/login/')) {
    return DEFAULT_RETURN_URL;
  }

  return returnUrl;
}
