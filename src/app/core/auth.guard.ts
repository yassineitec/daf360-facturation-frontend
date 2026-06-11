import { inject }        from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { UserStore }     from './user.store';
import { AuthService }   from './auth.service';

export const authGuard: CanActivateFn = () => {
  const store = inject(UserStore);
  const auth  = inject(AuthService);

  if (store.isAuthenticated()) return true;

  auth.login();
  return false;
};
