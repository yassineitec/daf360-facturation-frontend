import { Routes } from '@angular/router';

export const SUBCONTRACTING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./subcontracting.component').then(m => m.SubcontractingComponent),
  },
];
