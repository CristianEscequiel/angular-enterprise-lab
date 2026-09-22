import { Routes, UrlMatcher } from '@angular/router';

// Los ids de work order son strings numéricos simples (ver db.json,
// generados por json-server). Un segmento que no matchee este formato
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
    loadComponent: () =>
      import('./pages/work-order-create/work-order-create').then((m) => m.WorkOrderCreate),
  },
  {
    matcher: matchWorkOrderIdEdit,
    title: 'Editar orden de trabajo | Angular Enterprise Lab',
    loadComponent: () =>
      import('./pages/work-order-edit/work-order-edit').then((m) => m.WorkOrderEdit),
  },
  {
    matcher: matchWorkOrderId,
    title: 'Detalle de la orden | Angular Enterprise Lab',
    loadComponent: () =>
      import('./pages/work-order-detail/work-order-detail').then((m) => m.WorkOrderDetail),
  },
];
