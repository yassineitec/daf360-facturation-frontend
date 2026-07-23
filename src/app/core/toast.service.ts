import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { UiActions } from '@khalilrebhiitec/daf360';

type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Thin wrapper over the lib's shared-store notifications. The lib ToastHostComponent
 * (rendered by the shell) renders whatever lands in the shared UI store, so a dispatch
 * from the facturation remote shows a toast in the host. Mirrors the shell/RH/log pattern.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly store = inject(Store);
  private seq = 0;

  private push(type: ToastType, message: string, title?: string): void {
    this.store.dispatch(UiActions.addNotification({
      notification: {
        id: `fact-${Date.now()}-${this.seq++}`,
        type,
        message,
        ...(title ? { title } : {}),
        duration: 4000,
      },
    }));
  }

  success(message: string, title?: string): void { this.push('success', message, title); }
  error(message: string, title?: string): void   { this.push('error', message, title); }
  warning(message: string, title?: string): void { this.push('warning', message, title); }
  info(message: string, title?: string): void    { this.push('info', message, title); }
}
