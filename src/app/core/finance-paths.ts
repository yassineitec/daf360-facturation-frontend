import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';

/** `data` flag set on the remote's root route (app.routes.ts) — marks where this app is mounted. */
export const FINANCE_ROOT_ROUTE = 'financeRoot';

/**
 * Absolute links into this remote without hard-coding its mount point.
 *
 * The shell owns the prefix: the app lives under `/finance` there, but at the root when it
 * is served alone on its port. A literal `/finance/...` (or worse, `/fact/...`, the API
 * prefix) breaks in one of the two — this reads the real prefix off the current router
 * state instead.
 *
 * Rule: within a module, keep relative links (`['..']` back to the list); use these only
 * to jump across modules (approval → affaire, approval → invoice), where a relative path
 * would depend on how deep the current URL is.
 */
@Injectable({ providedIn: 'root' })
export class FinancePaths {
  private readonly router = inject(Router);

  /** `/finance` under the shell, `` standalone. */
  root(): string {
    const segments: string[] = [];
    let snap: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (snap) {
      // routeConfig rather than snap.data: `data` is inherited by empty-path children.
      if (snap.routeConfig?.data?.[FINANCE_ROOT_ROUTE]) {
        return segments.length ? '/' + segments.join('/') : '';
      }
      segments.push(...snap.url.map(s => s.path));
      snap = snap.firstChild;
    }
    // Not inside the remote yet (e.g. mid-bootstrap) — the shell's mount point.
    return '/finance';
  }

  affaire(id: number | string): unknown[]  { return [`${this.root()}/affaires`, id]; }
  invoices(): unknown[]                     { return [`${this.root()}/invoicing`]; }
  invoice(id: number | string): unknown[]  { return [`${this.root()}/invoicing`, id]; }
  invoiceEdit(id: number | string): unknown[] { return [`${this.root()}/invoicing`, id, 'edit']; }
  approvalQueue(): unknown[]                { return [`${this.root()}/billing/approval`]; }
}
