import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { DevAuthBypassService } from '../dev/dev-auth-bypass.service';

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
  // DEV-BYPASS: the API picks the seeded account from this header; null in any normal build.
  const devRole = inject(DevAuthBypassService).currentRoleHeader();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (devRole) headers['X-Dev-Role'] = devRole;

  return Object.keys(headers).length > 0 ? next(req.clone({ setHeaders: headers })) : next(req);
};
