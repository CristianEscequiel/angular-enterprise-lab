import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { delay, of, throwError } from 'rxjs';

import { WORK_ORDERS_MOCK } from '../../features/work-orders/data-access/work-order.mock'
import { WorkOrder, WorkOrderCreateRequest } from '../../features/work-orders/models/work-order.model';

const API_DELAY = 800;

export const mockApiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/work-orders')) {
    return next(request);
  }

  if (request.method === 'GET' && request.url === '/api/work-orders') {
    return of(
      new HttpResponse({
        status: 200,
        body: WORK_ORDERS_MOCK,
      }),
    ).pipe(delay(API_DELAY));
  }

  const detailMatch = request.url.match(/^\/api\/work-orders\/(\d+)$/);

  if (request.method === 'GET' && detailMatch) {
    const id = detailMatch[1];
    const workOrder = WORK_ORDERS_MOCK.find((item) => item.id === id);

    if (!workOrder) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            statusText: 'Not Found',
            error: {
              message: `No se encontró la orden ${id}`,
            },
          }),
      );
    }

    return of(
      new HttpResponse({
        status: 200,
        body: workOrder,
      }),
    ).pipe(delay(API_DELAY));
  }

  if (request.method === 'POST' && request.url === '/api/work-orders') {
    if (!request.body) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              message: 'Cuerpo de solicitud inválido',
            },
          }),
      );
    }
    const body = request.body as WorkOrderCreateRequest;

    const newWorkOrder: WorkOrder = {
      ...body,
      id: (Math.max(...WORK_ORDERS_MOCK.map((item) => Number(item.id)), 0) + 1).toString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    WORK_ORDERS_MOCK.push(newWorkOrder);
    return of(
      new HttpResponse({
        status: 201,
        body: newWorkOrder,
      }),
    ).pipe(delay(API_DELAY));
  }

  if (request.method === 'PUT' && detailMatch) {
    const id = detailMatch[1];
    const index = WORK_ORDERS_MOCK.findIndex((item) => item.id === id);

    if (index === -1) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            statusText: 'Not Found',
            error: {
              message: `No se encontró la orden ${id}`,
            },
          }),
      );
    }
    if (!request.body) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              message: `Solicitud inválida para la orden ${id}`,
            },
          }),
      );
    }
    const updatedWorkOrder: WorkOrder = { ...WORK_ORDERS_MOCK[index], ...request.body };
    WORK_ORDERS_MOCK[index] = updatedWorkOrder;

    return of(
      new HttpResponse({
        status: 200,
        body: WORK_ORDERS_MOCK[index],
      }),
    ).pipe(delay(API_DELAY));
  }

  if (request.method === 'DELETE' && detailMatch) {
    const id = detailMatch[1];
    const index = WORK_ORDERS_MOCK.findIndex((item) => item.id === id);

    if (index === -1) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            statusText: 'Not Found',
            error: {
              message: `No se encontró la orden ${id}`,
            },
          }),
      );
    }

    WORK_ORDERS_MOCK.splice(index, 1);

    return of(
      new HttpResponse({
        status: 204,
      }),
    ).pipe(delay(API_DELAY));
  }

  return next(request);
};
