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

export const BUDGET_LABEL: Record<BillingMode, { label: string; hint: string }> = {
  AV:  {
    label: 'Montant contractuel',
    hint:  'Montant total du contrat. La somme des répartitions CTR/BPE/TQC sera appliquée sur ce montant.',
  },
  JAL: {
    label: 'Montant contractuel',
    hint:  'Montant total du contrat. La somme des jalons doit être égale à ce montant.',
  },
  TM:  {
    label: 'Budget prévisionnel',
    hint:  'Enveloppe budgétaire estimée. La facturation réelle est basée sur les heures validées × taux contractuels.',
  },
  CP:  {
    label: 'Budget prévisionnel',
    hint:  'Enveloppe budgétaire estimée. La facturation réelle est basée sur les coûts réels + taux de marge.',
  },
  RMB: {
    label: 'Budget prévisionnel',
    hint:  'Enveloppe de remboursements estimée. La facturation réelle est basée sur les frais validés.',
  },
};

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
  erpReference: string;
  projectName: string;
  clientName: string;
  status: string;
}

export interface DisciplineDto {
  id: number;
  levelLabel: string;
  levelConcat?: string;
}

export interface ResponsableItem {
  userId: number;
  userName: string;
  isPrimary: boolean;
  role?: string;
  budgetAllocation?: number;
  activites: { activiteId: number; activiteLabel: string }[];
  disciplines: { disciplineId: number; disciplineLabel: string }[];
}

// ── Wizard state ───────────────────────────────────────────────────────────────

export interface AffaireDraftState {
  id?: number;

  // paysId — NOT shown in UI; populated from backend response after draft creation
  paysId: number;

  // Step 1 — DOC360 project (optional)
  doc360ProjectName?: string;
  doc360ErpReference?: string;     // erp_reference from ODS (e.g. ERP project code)
  doc360ServerReference?: string;  // used to populate discipline dropdown in step 4
  doc360ClientName?: string;

  // Step 2 — Informations générales
  clientId?: number;
  clientName?: string;
  clientKycDone?: boolean;
  intitule: string;
  reference?: string;
  doc360Ref?: string;    // manual reference (distinct from DOC360 project)
  erpReference?: string | null;  // affaire's own ERP reference (from backend entity)
  notes?: string;

  // Step 3 — Mode de facturation
  billingMode?: BillingMode;
  billingModeLocked?: boolean;
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

  // Step 5 — Planification
  dateDebutFacturation?: string;
  dateFinContractuelle?: string;
  datePremireEcheance?: string;
}

export function mapDraftToState(dto: any, clientName: string, clientKycDone: boolean): AffaireDraftState {
  const repartitions: AffaireDraftState['repartitions'] = (dto.ctrBpeTqcItems ?? []).map((r: any) => ({
    repartitionTypeId: r.repartitionTypeId,
    percentage: Number(r.percentage),
    label: r.label,
  }));
  const jalons: AffaireDraftState['jalons'] = (dto.jalons ?? []).map((j: any) => ({
    label: j.label,
    description: j.description,
    montant: Number(j.montant),
    ordre: j.ordre,
    datePrevisionnelle: j.datePrevisionnelle,
  }));
  const ressources: AffaireDraftState['ressources'] = (dto.ressources ?? []).map((r: any) => ({
    userId: r.userId,
    userName: '',
    resourceType: r.resourceType,
    rateType: r.rateType,
    rateAmount: Number(r.rateAmount),
    rateCurrency: r.rateCurrency,
    costAmount: r.costAmount != null ? Number(r.costAmount) : undefined,
  }));
  const responsables: AffaireDraftState['responsables'] = (dto.responsables ?? []).map((r: any) => ({
    userId: r.userId,
    userName: '',
    isPrimary: r.isPrimary,
    role: r.role,
    budgetAllocation: r.budgetAllocation != null ? Number(r.budgetAllocation) : undefined,
    activites: (r.activites ?? []).map((a: any) => ({
      activiteId: a.activiteId,
      activiteLabel: a.activiteLabel ?? '',
    })),
    disciplines: (r.disciplines ?? []).map((d: any) => ({
      disciplineId: d.disciplineId,
      disciplineLabel: d.disciplineLabel ?? '',
    })),
  }));
  return {
    id:                          dto.id,
    paysId:                      dto.paysId ?? 0,
    clientId:                    dto.clientId,
    clientName,
    clientKycDone,
    intitule:                    dto.intitule ?? '',
    reference:                   dto.reference,
    doc360Ref:                   dto.doc360Ref,
    erpReference:                dto.erpReference ?? null,
    doc360ServerReference:       dto.doc360Ref,
    notes:                       dto.notes,
    billingMode:                 dto.billingMode,
    billingModeLocked:           dto.billingModeLocked ?? false,
    billingPeriod:               dto.billingPeriod ?? 'MONTHLY',
    contractAmount:              dto.contractAmount != null ? Number(dto.contractAmount) : undefined,
    contractCurrency:            dto.contractCurrency ?? 'EUR',
    budgetPrevisionnel:          dto.budgetPrevisionnel != null ? Number(dto.budgetPrevisionnel) : undefined,
    repartitions,
    repartitionTotal:            repartitions.reduce((s, r) => s + r.percentage, 0),
    jalons,
    jalonTotal:                  jalons.reduce((s, j) => s + j.montant, 0),
    ressources,
    eligibleCostCategoryIds:     dto.eligibleCostCategoryIds ?? [],
    eligibleExpenseCategoryIds:  dto.eligibleExpenseCategoryIds ?? [],
    marginRatePct:               dto.cpMarginRatePct != null ? Number(dto.cpMarginRatePct) : undefined,
    responsables,
    dateDebutFacturation:        dto.dateDebutFacturation,
    dateFinContractuelle:        dto.dateFinContractuelle,
    datePremireEcheance:         dto.datePremireEcheance,
  };
}
