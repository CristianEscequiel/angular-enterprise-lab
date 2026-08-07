import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { delay, of, throwError } from 'rxjs';

import { WORK_ORDERS_MOCK } from '../../features/work-orders/data-access/work-order.mock'

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
    const id = Number(detailMatch[1]);
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

  return next(request);
};
