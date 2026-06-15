import { inject }        from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { UserStore }     from './user.store';
import { environment }   from '../../environments/environment';

export const authGuard: CanActivateFn = () => {
  const store = inject(UserStore);

  if (store.isAuthenticated()) return true;

  window.location.href = `${environment.portalUrl}/oauth2/authorization/azure`;
  return false;
};
