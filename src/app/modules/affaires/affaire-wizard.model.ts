export type BillingMode = 'AV' | 'JAL' | 'TM' | 'CP' | 'RMB';

export interface BillingModeOption {
  code: BillingMode;
  labelFr: string;
  labelEn: string;
  description: string;
  icon: string;
  requiresContractAmount: boolean;
  steps: string[];
}

export const BILLING_MODES: BillingModeOption[] = [
  {
    code: 'AV',
    labelFr: 'Facturation à l\'avancement',
    labelEn: 'Progress Billing',
    description: 'Facturation selon le taux d\'avancement validé chaque mois par le Chef de Projet.',
    icon: 'trending_up',
    requiresContractAmount: true,
    steps: ['Informations', 'Répartition CTR/BPE/TQC', 'Récapitulatif'],
  },
  {
    code: 'JAL',
    labelFr: 'Forfait par jalons',
    labelEn: 'Milestone Billing',
    description: 'Facturation déclenchée à l\'atteinte de jalons contractuels prédéfinis.',
    icon: 'flag',
    requiresContractAmount: true,
    steps: ['Informations', 'Jalons', 'Récapitulatif'],
  },
  {
    code: 'TM',
    labelFr: 'Régie Time & Materials',
    labelEn: 'Time & Materials',
    description: 'Facturation basée sur les heures validées en timesheet × taux contractuels par ressource.',
    icon: 'schedule',
    requiresContractAmount: false,
    steps: ['Informations', 'Ressources & Taux', 'Récapitulatif'],
  },
  {
    code: 'CP',
    labelFr: 'Cost-Plus',
    labelEn: 'Cost-Plus',
    description: 'Facturation des coûts réels majorés d\'un taux de marge contractuel.',
    icon: 'add_circle',
    requiresContractAmount: false,
    steps: ['Informations', 'Types de coûts & Marge', 'Récapitulatif'],
  },
  {
    code: 'RMB',
    labelFr: 'Remboursable',
    labelEn: 'Reimbursable',
    description: 'Refacturation des frais remboursables validés par le manager.',
    icon: 'receipt',
    requiresContractAmount: false,
    steps: ['Informations', 'Catégories de frais', 'Récapitulatif'],
  },
];

export interface AffaireDraftState {
  // Step 1
  id?: number;
  paysId: number;
  clientId?: number;
  clientName?: string;
  intitule: string;
  reference?: string;
  responsableUserIds: number[];
  responsableNames: string[];
  dateDebut?: string;
  dateFin?: string;
  contractAmount?: number;
  contractCurrency: string;
  billingMode?: BillingMode;
  billingPeriod: string;
  notes?: string;
  doc360Ref?: string;

  // Step 2 AV
  repartitions: { repartitionTypeId: number; percentage: number; label?: string }[];
  repartitionTotal: number;

  // Step 2 JAL
  jalons: { label: string; description?: string; montant: number; ordre: number; datePrevisionnelle?: string }[];
  jalonTotal: number;

  // Step 2 TM
  ressources: {
    userId: number; userName?: string;
    resourceType: string; rateType: string;
    rateAmount: number; rateCurrency: string;
    costAmount?: number;
  }[];

  // Step 2 CP
  eligibleCostCategoryIds: number[];
  marginRatePct?: number;

  // Step 2 RMB
  eligibleExpenseCategoryIds: number[];
}
