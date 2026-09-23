import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { MessageService } from '../services/message.service';
import { AuthUser, UserRole } from './auth.model';
import { AuthService } from './auth.service';
import { DEFAULT_RETURN_URL, sanitizeReturnUrl } from './return-url';

// Rutas que exigen sesión: sin ella se redirige a login conservando la URL pedida.
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);

  return authService.isAuthenticated() ? true : authService.loginUrlFor(state.url);
};

// Inverso de `authGuard`, para `/login`: con sesión activa el formulario nunca se crea.
export const guestGuard: CanActivateFn = (route) => {
  if (!inject(AuthService).isAuthenticated()) {
    return true;
  }

  return inject(Router).parseUrl(sanitizeReturnUrl(route.queryParamMap.get('returnUrl')));
};

// Guard genérico por usuario: el predicado decide con el usuario completo (rol y, para el
// técnico, sus atributos) y con la ruta. Es el único lugar que resuelve los tres desenlaces:
// sin sesión → login conservando la URL pedida (retorno tras el login); con sesión pero sin
// permiso → aviso + /dashboard.
// Nunca usar sobre `/dashboard`: es el destino del rechazo, restringirlo entraría en bucle.
export function requireUser(
  predicate: (user: AuthUser, route: ActivatedRouteSnapshot) => boolean,
): CanActivateFn {
  return (route, state) => {
    const authService = inject(AuthService);
    const user = authService.currentUser();

    if (!user) {
      return authService.loginUrlFor(state.url);
    }

    if (predicate(user, route)) {
      return true;
    }

    inject(MessageService).showWarning(
      'No tiene permiso para acceder a esa sección.',
      'Acceso denegado',
    );
    return inject(Router).parseUrl(DEFAULT_RETURN_URL);
  };
}

export function requireRole(...roles: UserRole[]): CanActivateFn {
  return requireUser((user) => roles.includes(user.role));
}
