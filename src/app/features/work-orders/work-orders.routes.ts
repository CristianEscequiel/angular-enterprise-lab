import { Routes } from '@angular/router';

export const WORK_ORDERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/work-orders-list/work-orders-list').then(
        (m) => m.WorkOrdersList
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/work-order-detail/work-order-detail').then(
        (m) => m.WorkOrderDetail
      ),
  },
];
