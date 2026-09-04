import { HttpInterceptorFn } from '@angular/common/http';
import { delay } from 'rxjs';

export const mockDelayInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    delay(300)
  );
};
