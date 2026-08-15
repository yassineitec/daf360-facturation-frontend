import { Routes } from '@angular/router';

export const PAYMENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./payments-dashboard/payments-dashboard.component').then(m => m.PaymentsDashboardComponent),
  },
  {
    path: 'reconciliation',
    loadComponent: () =>
      import('./reconciliation/reconciliation.component').then(m => m.ReconciliationComponent),
  },
  // Après `reconciliation` : `:id` capterait le segment sinon.
  {
    path: ':id',
    loadComponent: () =>
      import('./recouvrement-detail/recouvrement-detail.component').then(m => m.RecouvrementDetailComponent),
  },
];
