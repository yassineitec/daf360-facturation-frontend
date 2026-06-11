import { Routes } from '@angular/router';

export const REPORTING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reporting-list.component').then(m => m.ReportingListComponent),
  },
];
