import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    // Grupo protegido. `canActivateChild` (y no `canActivate`) para que se re-evalúe también
    // al navegar entre hijos del mismo padre (/work-orders → /work-orders/1).
    path: '',
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard | Angular Enterprise Lab',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page/dashboard-page').then(
            (m) => m.DashboardPage,
          ),
      },
      {
        path: 'work-orders',
        loadChildren: () =>
          import('./features/work-orders/work-orders.routes').then((m) => m.WORK_ORDERS_ROUTES),
      },
    ],
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
    title: 'Página no encontrada | Angular Enterprise Lab',
  },
];
