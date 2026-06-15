import { Routes } from '@angular/router';

export const COST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./cost.component').then(m => m.CostComponent),
  },
];
