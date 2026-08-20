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
    path: 'new',
    loadComponent: () =>
      import('./pages/work-order-create/work-order-create').then(
        (m) => m.WorkOrderCreate
      ),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/work-order-edit/work-order-edit').then(
        (m) => m.WorkOrderEdit
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
