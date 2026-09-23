import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    title: 'Iniciar sesión | Angular Enterprise Lab',
    loadComponent: () => import('./pages/login-page/login-page').then((m) => m.LoginPage),
  },
];
