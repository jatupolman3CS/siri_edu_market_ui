import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Attaches `Authorization: Bearer <accessToken>` to every outgoing request
 * when an access token is available in AuthService.
 *
 * Once the backend returns a real JWT the token will be stored here.
 * Currently uses a dev placeholder so all API wiring can be tested.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // When a real JWT token is available, use it; otherwise fall through (dev mode).
  const token = authService.accessToken();

  if (token) {
    const authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
    return next(authReq);
  }

  return next(req);
};
