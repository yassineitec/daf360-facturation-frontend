import { Routes } from '@angular/router';

export const PAYMENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./payments-dashboard.component').then(m => m.PaymentsDashboardComponent),
  },
  {
    path: 'reconciliation',
    loadComponent: () =>
      import('./reconciliation/reconciliation.component').then(m => m.ReconciliationComponent),
  },
];
