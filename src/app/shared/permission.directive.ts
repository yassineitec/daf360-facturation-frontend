import {
  Directive, TemplateRef, ViewContainerRef,
  effect, inject, input,
} from '@angular/core';
import { UserStore } from '../core/user.store';

@Directive({
  selector: '[appHasPermission]',
})
export class PermissionDirective {
  appHasPermission = input<string | null>(null);

  private store = inject(UserStore);
  private tpl   = inject(TemplateRef<unknown>);
  private vcr   = inject(ViewContainerRef);

  constructor() {
    effect(() => {
      const perm = this.appHasPermission();
      this.vcr.clear();
      if (!perm || this.store.hasPermission(perm)) {
        this.vcr.createEmbeddedView(this.tpl);
      }
    });
  }
}
