import { Routes } from '@angular/router';

export const COST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./cost-list.component').then(m => m.CostListComponent),
  },
];
