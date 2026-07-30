import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject }            from '@angular/core';
import { catchError, throwError, from, switchMap, EMPTY } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { UserStore }   from './user.store';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

function withToken(req: HttpRequest<unknown>, token: string | null | undefined): HttpRequest<unknown> {
  return token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true })
    : req.clone({ withCredentials: true });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(UserStore);
  const auth  = inject(AuthService);
  const toast = inject(ToastService);
  const t     = inject(TranslateService);

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
        if (err.status === 403) {
          toast.error(t.instant('ERRORS.FORBIDDEN'));
          return throwError(() => err);
        }
        if (err.status === 0 || err.status >= 500) {
          toast.error(t.instant('ERRORS.SERVER'));
          return throwError(() => err);
        }
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
