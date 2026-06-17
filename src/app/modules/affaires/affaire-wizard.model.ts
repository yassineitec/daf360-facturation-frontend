export type BillingMode = 'AV' | 'JAL' | 'TM' | 'CP' | 'RMB';

export interface BillingModeOption {
  code: BillingMode;
  labelFr: string;
  labelEn: string;
  description: string;
  icon: string;
  requiresContractAmount: boolean;
}

export const BILLING_MODES: BillingModeOption[] = [
  {
    code: 'AV',
    labelFr: 'Facturation à l\'avancement',
    labelEn: 'Progress Billing',
    description: 'Facturation selon le taux d\'avancement validé chaque mois par le Chef de Projet.',
    icon: 'trending_up',
    requiresContractAmount: true,
  },
  {
    code: 'JAL',
    labelFr: 'Forfait par jalons',
    labelEn: 'Milestone Billing',
    description: 'Facturation déclenchée à l\'atteinte de jalons contractuels prédéfinis.',
    icon: 'flag',
    requiresContractAmount: true,
  },
  {
    code: 'TM',
    labelFr: 'Régie Time & Materials',
    labelEn: 'Time & Materials',
    description: 'Facturation basée sur les heures validées en timesheet × taux contractuels par ressource.',
    icon: 'schedule',
    requiresContractAmount: false,
  },
  {
    code: 'CP',
    labelFr: 'Cost-Plus',
    labelEn: 'Cost-Plus',
    description: 'Facturation des coûts réels majorés d\'un taux de marge contractuel.',
    icon: 'add_circle',
    requiresContractAmount: false,
  },
  {
    code: 'RMB',
    labelFr: 'Remboursable',
    labelEn: 'Reimbursable',
    description: 'Refacturation des frais remboursables validés par le manager.',
    icon: 'receipt',
    requiresContractAmount: false,
  },
];

export const WIZARD_STEPS_LABELS = [
  'Recherche DOC360',
  'Informations',
  'Mode de facturation',
  'Responsables & Budget',
  'Planification',
  'Récapitulatif',
];

// ── DTOs matching backend ──────────────────────────────────────────────────────

export interface ExternalProjectResult {
  serverReference: string;
  projectNumber: string;
  projectName: string;
  clientName: string;
  status: string;
}

export interface DisciplineDto {
  id: number;
  code: string;
  label: string;
}

export interface ResponsableItem {
  userId: number;
  userName: string;
  isPrimary: boolean;
  role?: string;
}

// ── Wizard state ───────────────────────────────────────────────────────────────

export interface AffaireDraftState {
  id?: number;

  // paysId — NOT shown in UI; populated from backend response after draft creation
  paysId: number;

  // Step 1 — DOC360 project (optional)
  doc360ProjectName?: string;
  doc360ProjectNumber?: string;
  doc360ServerReference?: string;  // used to populate discipline dropdown in step 4
  doc360ClientName?: string;

  // Step 2 — Informations générales
  clientId?: number;
  clientName?: string;
  clientKycDone?: boolean;
  intitule: string;
  reference?: string;
  doc360Ref?: string;    // manual reference (distinct from DOC360 project)
  notes?: string;

  // Step 3 — Mode de facturation
  billingMode?: BillingMode;
  billingPeriod: string;
  contractAmount?: number;
  contractCurrency: string;

  // Step 3 — Mode-specific sub-data
  repartitions: { repartitionTypeId: number; percentage: number; label?: string }[];
  repartitionTotal: number;
  jalons: { label: string; description?: string; montant: number; ordre: number; datePrevisionnelle?: string }[];
  jalonTotal: number;
  ressources: {
    userId: number; userName?: string;
    resourceType: string; rateType: string;
    rateAmount: number; rateCurrency: string;
    costAmount?: number;
  }[];
  eligibleCostCategoryIds: number[];
  marginRatePct?: number;
  eligibleExpenseCategoryIds: number[];

  // Step 4 — Responsables & Budget
  responsables: ResponsableItem[];
  budgetPrevisionnel?: number;
  activiteId?: number;
  disciplineId?: number;
  disciplineLabel?: string;
  disciplineServerRef?: string;

  // Step 5 — Planification
  dateDebutFacturation?: string;
  dateFinContractuelle?: string;
  datePremireEcheance?: string;
}
