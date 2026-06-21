import { inject }             from '@angular/core';
import { CanActivateFn }      from '@angular/router';
import { Store }              from '@ngrx/store';
import { selectIsAuthenticated } from '@khalilrebhiitec/daf360';
import { firstValueFrom }     from 'rxjs';
import { UserStore }          from './user.store';
import { environment }        from '../../environments/environment';

export const authGuard: CanActivateFn = async () => {
  const userStore = inject(UserStore);
  const store     = inject(Store);

  // Fast path: local signal already populated
  if (userStore.isAuthenticated()) return true;

  // Fallback: check NgRx store (shell may have already authenticated)
  const isAuthInStore = await firstValueFrom(store.select(selectIsAuthenticated));
  if (isAuthInStore) return true;

  // Last resort: call /api/me to populate local store
  await userStore.loadCurrentUser();
  if (userStore.isAuthenticated()) return true;

  window.location.href = environment.shellUrl || '/';
  return false;
};
