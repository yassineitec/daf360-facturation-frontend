import { inject }             from '@angular/core';
import { CanActivateFn }      from '@angular/router';
import { UserStore }          from './user.store';
import { environment }        from '../../environments/environment';

export const authGuard: CanActivateFn = async () => {
  const userStore = inject(UserStore);

  // Fast path: the shared NgRx store singleton is already populated — either by
  // this app's own bootstrap, or by the shell (or another federated remote)
  // that fetched /api/me first. userStore.isAuthenticated() reads that same store.
  if (userStore.isAuthenticated()) return true;

  // Not yet populated anywhere — fetch it ourselves.
  await userStore.loadCurrentUser();
  if (userStore.isAuthenticated()) return true;

  window.location.href = environment.shellUrl || '/';
  return false;
};
