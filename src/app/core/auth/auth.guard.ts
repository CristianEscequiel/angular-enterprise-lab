import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { MessageService } from '../services/message.service';
import { UserRole } from './auth.model';
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

// Nunca usar sobre `/dashboard`: es el destino del rechazo, restringirlo entraría en bucle.
export function requireRole(...roles: UserRole[]): CanActivateFn {
  return (_route, state) => {
    const authService = inject(AuthService);
    const user = authService.currentUser();

    if (!user) {
      return authService.loginUrlFor(state.url);
    }

    if (roles.includes(user.role)) {
      return true;
    }

    inject(MessageService).showWarning(
      'No tiene permiso para acceder a esa sección.',
      'Acceso denegado',
    );
    return inject(Router).parseUrl(DEFAULT_RETURN_URL);
  };
}
