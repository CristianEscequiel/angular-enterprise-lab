import { Routes, UrlMatcher } from '@angular/router';

import { isTechnician } from '@core/auth/auth.model';
import { requireUser } from '@core/auth/auth.guard';
import { canEditWorkOrder, creatableTypes } from './models/work-order.permissions';

// Los ids de work order son strings numéricos simples (la API los asigna
// desde una secuencia). Un segmento que no matchee este formato
// no es una orden reconocible por la app: debe caer en el wildcard 404
// de app.routes.ts, no en WorkOrderDetail/WorkOrderEdit.
const ID_PATTERN = /^\d+$/;

export const matchWorkOrderId: UrlMatcher = (segments) => {
  const [idSegment] = segments;

  if (segments.length !== 1 || !idSegment || !ID_PATTERN.test(idSegment.path)) {
    return null;
  }
  return { consumed: segments, posParams: { id: idSegment } };
};

export const matchWorkOrderIdEdit: UrlMatcher = (segments) => {
  const [idSegment, suffixSegment] = segments;

  if (
    segments.length !== 2 ||
    !idSegment ||
    suffixSegment?.path !== 'edit' ||
    !ID_PATTERN.test(idSegment.path)
  ) {
    return null;
  }
  return { consumed: segments, posParams: { id: idSegment } };
};

// /work-orders/:id/resolve — página de cierre de la orden (spec 013d).
export const matchWorkOrderIdResolve: UrlMatcher = (segments) => {
  const [idSegment, suffixSegment] = segments;

  if (
    segments.length !== 2 ||
    !idSegment ||
    suffixSegment?.path !== 'resolve' ||
    !ID_PATTERN.test(idSegment.path)
  ) {
    return null;
  }
  return { consumed: segments, posParams: { id: idSegment } };
};

export const WORK_ORDERS_ROUTES: Routes = [
  {
    path: '',
    title: 'Órdenes de trabajo | Angular Enterprise Lab',
    loadComponent: () =>
      import('./pages/work-orders-list/work-orders-list').then((m) => m.WorkOrdersList),
  },
  {
    path: 'new',
    title: 'Crear orden de trabajo | Angular Enterprise Lab',
    // Solo roles que pueden crear algún tipo de orden (la página filtra cuáles).
    canActivate: [requireUser((user) => creatableTypes(user).length > 0)],
    loadComponent: () =>
      import('./pages/work-order-create/work-order-create').then((m) => m.WorkOrderCreate),
  },
  {
    matcher: matchWorkOrderIdEdit,
    title: 'Editar orden de trabajo | Angular Enterprise Lab',
    canActivate: [requireUser((user) => canEditWorkOrder(user))],
    loadComponent: () =>
      import('./pages/work-order-edit/work-order-edit').then((m) => m.WorkOrderEdit),
  },
  {
    matcher: matchWorkOrderIdResolve,
    title: 'Cerrar orden de trabajo | Angular Enterprise Lab',
    // Solo los técnicos cierran órdenes. Que la orden sea suya y de un tipo que su equipo atiende lo
    // comprueba la página, una vez cargada (la ruta no conoce la orden).
    canActivate: [requireUser((user) => isTechnician(user))],
    loadComponent: () =>
      import('./pages/work-order-resolve/work-order-resolve').then((m) => m.WorkOrderResolve),
  },
  {
    matcher: matchWorkOrderId,
    title: 'Detalle de la orden | Angular Enterprise Lab',
    loadComponent: () =>
      import('./pages/work-order-detail/work-order-detail').then((m) => m.WorkOrderDetail),
  },
];
