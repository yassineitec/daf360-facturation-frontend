import { Routes } from '@angular/router';

export const INVOICING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./invoice-list.component').then(m => m.InvoiceListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./invoice-new.component').then(m => m.InvoiceNewComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./invoice-detail.component').then(m => m.InvoiceDetailComponent),
  },
];
