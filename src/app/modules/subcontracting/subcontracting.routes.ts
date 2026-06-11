import { Routes } from '@angular/router';

export const SUBCONTRACTING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./subcontracting-list.component').then(m => m.SubcontractingListComponent),
  },
];
