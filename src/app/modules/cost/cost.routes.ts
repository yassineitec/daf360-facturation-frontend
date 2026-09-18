import { Routes } from '@angular/router';
import { permissionGuard } from '@khalilrebhiitec/daf360';

export const COST_ROUTES: Routes = [
  /**
   * Deux files en une : les lignes de coût (FACT_APPROVE_COST_L1) et les demandes
   * d'embauche chiffrées par RH (APPROVE_HIRING_COST).
   *
   * Garde propre, comme `cost/missions` juste en dessous et pour la même raison : celui du
   * parent accepte quatre codes, dont de simples lecteurs de coûts, qui atteignaient donc
   * cet écran alors que chaque appel leur renvoyait un 403.
   *
   * APPROVE_HIRING_COST n'est pas un code FACT_* — il appartient au catalogue RH, où le
   * décideur des embauches est déjà géré. Il est cité ici parce que c'est l'écran qui vit
   * de ce côté ; le déclarer aussi dans FactPermissionCatalog ferait administrer la même
   * permission depuis deux panneaux.
   */
  {
    path: 'approval',
    canActivate: [permissionGuard],
    data: { permissions: ['FACT_APPROVE_COST_L1', 'APPROVE_HIRING_COST'] },
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
  /**
   * Full-page audit history for one employee-cost record — reached from that row's own
   * "History" action, never from the sidebar. THREE segments, so it never collides with
   * the bare 'employee-costs' route above or the single-segment ':id' catch-all further
   * down (same reasoning as the 'supplier/...' routes' own comment below).
   */
  {
    path: 'employee-costs/:id/history',
    loadComponent: () =>
      import('./employee-costs/employee-cost-history.component').then(m => m.EmployeeCostHistoryComponent),
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
  /**
   * Cost-lines-by-supplier cards (2026-09-09 plan) — both routes below are
   * TWO-segment paths ("supplier/none" / "supplier/<id>") and never collide with the
   * bare single-segment ":id" further down regardless of array position: Angular's
   * router requires an exact remaining-segment-count match, and ":id" has no children.
   * Placed here anyway, ahead of ":id", to keep every literal-prefixed route grouped
   * together before the catch-all, matching this file's own existing convention.
   *
   * "supplier/none" MUST stay listed before "supplier/:supplierId" — both are
   * two-segment paths, so ordering between these two genuinely matters: reversed,
   * "supplier/:supplierId" would greedily match "none" as supplierId="none".
   *
   * `data.mode` (not param-sniffing) is how CostLineDetailComponent tells its three
   * modes apart — see the component's own doc comment.
   */
  {
    path: 'supplier/none',
    data: { mode: 'unassigned' },
    loadComponent: () =>
      import('./cost-detail/cost-line-detail.component').then(m => m.CostLineDetailComponent),
  },
  {
    path: 'supplier/:supplierId',
    data: { mode: 'supplier' },
    loadComponent: () =>
      import('./cost-detail/cost-line-detail.component').then(m => m.CostLineDetailComponent),
  },
  /**
   * Read-only cost-line detail page. Distinct from `:id/edit` (the edit form) and
   * reached from the approval queue's "view details" action. Deliberately LAST in this
   * array: `:id` is a single-segment wildcard, and placing it earlier would greedily
   * match the literal single-segment paths above it (`approval`, `missions`, `new`,
   * `rate-computations`, `employee-costs`, `create`).
   */
  {
    path: ':id',
    data: { mode: 'line' },
    loadComponent: () =>
      import('./cost-detail/cost-line-detail.component').then(m => m.CostLineDetailComponent),
  },
];
