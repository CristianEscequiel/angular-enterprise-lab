import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/pages/dashboard-page/dashboard-page')
        .then((m) => m.DashboardPage),
  },
  {
    path: 'work-orders',
    loadChildren: () =>
      import('./features/work-orders/work-orders.routes').then(
        (m) => m.WORK_ORDERS_ROUTES
      ),
  }
];
