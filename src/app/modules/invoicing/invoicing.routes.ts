import { Routes } from '@angular/router';
import { approvalDraftLeaveGuard } from './invoice-new/approval-draft-leave.guard';

export const INVOICING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./invoice-list/invoice-list.component').then(m => m.InvoiceListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./invoice-new/invoice-new.component').then(m => m.InvoiceNewComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./invoice-new/invoice-new.component').then(m => m.InvoiceNewComponent),
    canDeactivate: [approvalDraftLeaveGuard],
  },
  {
    path: ':id',
    loadComponent: () => import('./invoice-detail/invoice-detail.component').then(m => m.InvoiceDetailComponent),
  },
];
