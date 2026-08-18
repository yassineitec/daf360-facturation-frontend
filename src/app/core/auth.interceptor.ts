import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject }            from '@angular/core';
import { catchError, throwError, from, switchMap, EMPTY } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStore }   from './user.store';
import { AuthService } from './auth.service';

function withToken(req: HttpRequest<unknown>, token: string | null | undefined): HttpRequest<unknown> {
  return token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true })
    : req.clone({ withCredentials: true });
}

/**
 * Auth only — this interceptor raises NO user-facing error notification.
 *
 * The 403 and 5xx toasts were removed deliberately. A 403 is ordinary traffic here: every
 * finance endpoint carries its own @PreAuthorize (e.g. the RMB expenses list requires
 * FACT_VIEW_BILLING), so a user without a code hit a toast on every page that happened to
 * load that section. The right place to decide is the caller:
 *
 *   - a page the user may not open -> `permissionGuard` -> /forbidden, no request made;
 *   - a section inside a page they may open -> the section hides itself
 *     (`*dafHasPermission` for a static code, or a catch on 403 when it is data-dependent).
 *
 * Errors still propagate through `throwError`, so nothing is swallowed. Note this app has
 * no component-level error feedback yet, so a failed write is currently silent — that is
 * the trade-off of removing the 5xx branch, and the reason to add per-action messages where
 * a write can fail.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(UserStore);
  const auth  = inject(AuthService);

  const isPortalCall = req.url.startsWith(environment.portalUrl);
  const isFactApi    = req.url.startsWith(environment.factApiUrl);
  const isHrApi      = req.url.startsWith(environment.hrApiUrl);

  if (isPortalCall) {
    return next(req.clone({ withCredentials: true })).pipe(
      catchError(err => {
        if (err.status === 401) auth.login();
        return throwError(() => err);
      }),
    );
  }

  if (isFactApi || isHrApi) {
    return next(withToken(req, store.user()?.rhToken)).pipe(
      catchError(err => {
        if (err.status !== 401) return throwError(() => err);
        // Token expired or missing — refresh from portal then retry once.
        return from(auth.refreshToken()).pipe(
          switchMap(isAuthenticated => {
            if (!isAuthenticated) { auth.login(); return EMPTY; }
            return next(withToken(req, store.user()?.rhToken));
          }),
          catchError(() => { auth.login(); return EMPTY; }),
        );
      }),
    );
  }

  return next(req);
};
