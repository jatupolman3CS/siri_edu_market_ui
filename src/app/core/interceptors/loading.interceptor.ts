import { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';
import { finishLoading, startLoading } from '../services/loading';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  startLoading();
  return next(req).pipe(finalize(() => finishLoading()));
};

