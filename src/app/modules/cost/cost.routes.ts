import { Routes } from '@angular/router';

export const COST_ROUTES: Routes = [
  {
    path: 'approval',
    loadComponent: () =>
      import('./approval-queue/cost-approval-queue.component').then(m => m.CostApprovalQueueComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./cost-form/cost-form.component').then(m => m.CostFormComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./cost-form/cost-form.component').then(m => m.CostFormComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./cost.component').then(m => m.CostComponent),
  },
];
