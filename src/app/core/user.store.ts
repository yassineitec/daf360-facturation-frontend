import { Injectable, computed, inject } from '@angular/core';
import { HttpClient }                    from '@angular/common/http';
import { toSignal }                      from '@angular/core/rxjs-interop';
import { Store }                         from '@ngrx/store';
import { lastValueFrom }                 from 'rxjs';
import {
  MeResponse,
  UserActions,
  selectCurrentUser,
  selectUserPermissions,
} from '@khalilrebhiitec/daf360';
import { environment }                   from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserStore {
  private http  = inject(HttpClient);
  private store = inject(Store);

  readonly user            = toSignal(this.store.select(selectCurrentUser), { initialValue: null });
  readonly permissions     = toSignal(this.store.select(selectUserPermissions), {
    initialValue: [] as string[],
  });
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin         = computed(() =>
    this.user()?.roleName?.toLowerCase() === 'administrateur'
  );

  hasPermission(code: string): boolean {
    if (this.isAdmin()) return true;
    return this.permissions().includes(code);
  }

  /**
   * Also used by AuthService.refreshToken() to re-confirm an existing session
   * after a 401 from fact-api — a failure here must actually clear the user
   * (not just record an error) so isAuthenticated() reflects reality and the
   * caller correctly falls back to login instead of retrying with a stale user.
   */
  async loadCurrentUser(): Promise<void> {
    try {
      const me = await lastValueFrom(
        this.http.get<MeResponse>(`${environment.portalUrl}/api/me`, { withCredentials: true })
      );
      this.store.dispatch(UserActions.loadCurrentUserSuccess({ user: me }));
    } catch {
      this.store.dispatch(UserActions.clearUser());
    }
  }

  clear(): void {
    this.store.dispatch(UserActions.clearUser());
  }
}
