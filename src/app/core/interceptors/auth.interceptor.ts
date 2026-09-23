import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(AuthService).token();

  // Sin sesión no se agrega el header (ni vacío ni "Bearer undefined"), y el token
  // nunca sale hacia URLs que no sean de nuestra API.
  if (!token || !request.url.startsWith(API_BASE_URL)) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
