import { Routes } from '@angular/router';

export const TREASURY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./treasury-dashboard/treasury-dashboard.component').then(m => m.TreasuryDashboardComponent),
  },
];
