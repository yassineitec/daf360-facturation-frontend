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
    path: 'rate-computations',
    loadComponent: () =>
      import('./rate-computations/rate-computation.component').then(m => m.RateComputationComponent),
  },
  {
    path: 'employee-costs',
    loadComponent: () =>
      import('./employee-costs/employee-cost.component').then(m => m.EmployeeCostComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./cost.component').then(m => m.CostComponent),
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./cost-create.component').then(m => m.CostCreateComponent),
  },
];
