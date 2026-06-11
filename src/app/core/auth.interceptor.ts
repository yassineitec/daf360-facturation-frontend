import { HttpInterceptorFn } from '@angular/common/http';
import { inject }            from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStore }   from './user.store';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(UserStore);
  const auth  = inject(AuthService);

  const isPortalCall = req.url.startsWith(environment.portalUrl);
  const isFactApi    = req.url.startsWith(environment.factApiUrl);

  if (isPortalCall) {
    return next(req.clone({ withCredentials: true })).pipe(
      catchError(err => {
        if (err.status === 401) auth.login();
        return throwError(() => err);
      }),
    );
  }

  if (isFactApi) {
    const token = store.user()?.rhToken;
    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true })
      : req.clone({ withCredentials: true });

    return next(authReq).pipe(
      catchError(err => {
        if (err.status === 401) auth.login();
        return throwError(() => err);
      }),
    );
  }

  return next(req);
};
