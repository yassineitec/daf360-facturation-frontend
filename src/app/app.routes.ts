import { Routes }                from '@angular/router';
import { authGuard }             from './core/auth.guard';
import { FactShellComponent }    from './layout/fact-shell.component';
import { AuthCallbackComponent } from './core/auth-callback.component';

export const routes: Routes = [
  {
    path: 'auth/callback',
    component: AuthCallbackComponent,
  },
  {
    path: 'fact',
    component: FactShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'affaires',
        loadChildren: () =>
          import('./modules/affaires/affaires.routes').then(m => m.AFFAIRES_ROUTES),
      },
      {
        path: 'invoicing',
        loadChildren: () =>
          import('./modules/invoicing/invoicing.routes').then(m => m.INVOICING_ROUTES),
      },
      {
        path: 'payments',
        loadChildren: () =>
          import('./modules/payments/payments.routes').then(m => m.PAYMENTS_ROUTES),
      },
      {
        path: 'subcontracting',
        loadChildren: () =>
          import('./modules/subcontracting/subcontracting.routes').then(m => m.SUBCONTRACTING_ROUTES),
      },
      {
        path: 'cost',
        loadChildren: () =>
          import('./modules/cost/cost.routes').then(m => m.COST_ROUTES),
      },
      {
        path: 'reporting',
        loadChildren: () =>
          import('./modules/reporting/reporting.routes').then(m => m.REPORTING_ROUTES),
      },
      {
        path: 'clients',
        loadChildren: () =>
          import('./modules/clients/clients.routes').then(m => m.CLIENTS_ROUTES),
      },
      {
        path: 'admin',
        loadChildren: () =>
          import('./modules/admin/admin.routes').then(m => m.ADMIN_ROUTES),
      },
      {
        path: 'billing',
        children: [
          {
            path: 'approval',
            loadComponent: () =>
              import('./modules/affaires/billing/approval-queue.component').then(m => m.ApprovalQueueComponent),
          },
        ],
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./modules/suppliers/supplier-list.component').then(m => m.SupplierListComponent),
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./modules/home/home.component').then(m => m.HomeComponent),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: '/fact/home', pathMatch: 'full' },
];
