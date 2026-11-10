import { inject }             from '@angular/core';
import { CanActivateFn }      from '@angular/router';
import { UserStore }          from './user.store';
import { CurrencyContextService } from './currency-context.service';
import { environment }        from '../../environments/environment';

export const authGuard: CanActivateFn = async () => {
  const userStore = inject(UserStore);
  const currencyContext = inject(CurrencyContextService);

  // Fast path: the shared NgRx store singleton is already populated — either by
  // this app's own bootstrap, or by the shell (or another federated remote)
  // that fetched /api/me first. userStore.isAuthenticated() reads that same store.
  if (userStore.isAuthenticated()) {
    currencyContext.init();
    return true;
  }

  // Not yet populated anywhere — fetch it ourselves.
  await userStore.loadCurrentUser();
  if (userStore.isAuthenticated()) {
    currencyContext.init();
    return true;
  }

  window.location.href = environment.shellUrl || '/';
  return false;
};
