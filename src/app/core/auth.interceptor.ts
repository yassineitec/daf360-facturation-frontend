import { HttpInterceptorFn } from '@angular/common/http';
import { inject }            from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStore }   from './user.store';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(UserStore);
  const auth  = inject(AuthService);  // used for portal 401 redirect

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

    // Do NOT redirect to login on facturation-backend 401s — propagate to the component.
    // Only portal 401s (session expired) should trigger an OAuth redirect.
    return next(authReq);
  }

  return next(req);
};
