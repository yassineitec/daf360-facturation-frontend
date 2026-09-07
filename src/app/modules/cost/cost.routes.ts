import { Routes } from '@angular/router';
import { permissionGuard } from '@khalilrebhiitec/daf360';

export const COST_ROUTES: Routes = [
  {
    path: 'approval',
    loadComponent: () =>
      import('./approval-queue/cost-approval-queue.component').then(m => m.CostApprovalQueueComponent),
  },
  /**
   * Les ordres de mission chiffrés par RH, en attente de la décision finance.
   *
   * Porte son propre garde : celui du parent `cost` accepte quatre codes (dont celui-ci,
   * pour laisser entrer le décideur), et sans ce second garde un simple lecteur de coûts
   * atteindrait l'écran, alors que chaque appel lui renverrait un 403.
   */
  {
    path: 'missions',
    canActivate: [permissionGuard],
    data: { permissions: ['FACT_APPROVE_MISSION_COST'] },
    loadComponent: () =>
      import('./missions/mission-approval-queue.component').then(m => m.MissionApprovalQueueComponent),
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
