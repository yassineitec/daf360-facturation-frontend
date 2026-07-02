import { Routes } from '@angular/router';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./supplier-list/supplier-list.component').then(m => m.SupplierListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./supplier-new/supplier-new.component').then(m => m.SupplierNewComponent),
  },
];
