import { Routes } from '@angular/router';

export const CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./client-list.component').then(m => m.ClientListComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./client-detail.component').then(m => m.ClientDetailComponent),
  },
];
