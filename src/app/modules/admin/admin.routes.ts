import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-list/admin-list.component').then(m => m.AdminListComponent),
  },
];
