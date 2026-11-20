/**
 * Les trois onglets de « Validation des dépenses » (approval-hub.component.ts).
 *
 * Fichier sans composant à dessein : finance-modules.ts (bundle principal) et cost.routes.ts
 * lisent APPROVAL_TABS_PERMISSIONS, et l'importer depuis le composant tirerait les trois
 * écrans hors de leur chargement différé.
 *
 * Chaque onglet n'apparaît que si l'utilisateur détient l'un de ses codes — les mêmes que
 * vérifient les services derrière (facturation, rh-service pour les missions,
 * payroll-service pour les avances).
 */
export type ApprovalTab = 'requests' | 'missions' | 'advances';

export interface ApprovalTabDef {
  id: ApprovalTab;
  icon: string;
  labelKey: string;
  permissions: string[];
}

export const APPROVAL_TABS: ApprovalTabDef[] = [
  {
    id: 'requests', icon: 'fact_check',
    labelKey: 'COST.APPROVAL_QUEUE.TAB_REQUESTS',
    permissions: ['FACT_APPROVE_COST_L1', 'APPROVE_HIRING_COST', 'FACT_APPROVE_SALARY_ADVANCE',
                  'FACT_VALIDATE_SALARY_ADVANCE_ABOVE_THRESHOLD'],
  },
  {
    id: 'missions', icon: 'flight_takeoff',
    labelKey: 'FACTURATION.layout.NAV.COST_MISSIONS',
    permissions: ['FACT_APPROVE_MISSION_COST'],
  },
  {
    id: 'advances', icon: 'account_balance_wallet',
    labelKey: 'FACTURATION.layout.NAV.SALARY_ADVANCES',
    permissions: ['FACT_APPROVE_SALARY_ADVANCE', 'FACT_VALIDATE_SALARY_ADVANCE_ABOVE_THRESHOLD',
                  'FACT_VIEW_SALARY_ADVANCES'],
  },
];

/** Union des codes des trois onglets : garde de la route `cost/approval` et entrée de sidebar. */
export const APPROVAL_TABS_PERMISSIONS: string[] = [...new Set(APPROVAL_TABS.flatMap(t => t.permissions))];
