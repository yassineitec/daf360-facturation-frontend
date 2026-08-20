/**
 * `RMB` n'est plus un mode proposé à la création — les frais remboursables sont
 * devenus une action de la fiche affaire, pas un mode de facturation. Le code reste
 * dans l'union parce que des affaires existantes le portent encore et doivent
 * pouvoir être rouvertes dans l'assistant (voir BILLING_MODES).
 *
 * `JAL` a disparu : il ne servait plus qu'à héberger le mode LIVRABLE, que le
 * backend refusait jusqu'ici (regex du DTO de brouillon). LIVRABLE est maintenant
 * persisté sous son propre code.
 */
export type BillingMode = 'AV' | 'TM' | 'CP' | 'RMB' | 'LIVRABLE';

export interface BillingModeOption {
  code: BillingMode;
  /** Clé i18n du nom du mode — jamais un libellé en dur : le choix se lit dans les deux langues. */
  labelKey: string;
  /** Clé i18n de la phrase explicative sous le nom. */
  descKey: string;
  icon: string;
  requiresContractAmount: boolean;
}

/**
 * Les modes RÉELLEMENT proposés à l'étape 2. `RMB` n'y est plus (action de la fiche
 * affaire) et `JAL` non plus (remplacé par LIVRABLE) — mais les deux restent gérés
 * partout ailleurs dans l'assistant pour les affaires déjà enregistrées avec.
 */
export const BILLING_MODES: BillingModeOption[] = [
  {
    code: 'AV',
    labelKey: 'AFFAIRES.wizard.info.modes.AV.label',
    descKey:  'AFFAIRES.wizard.info.modes.AV.desc',
    icon: 'trending_up',
    requiresContractAmount: true,
  },
  {
    code: 'TM',
    labelKey: 'AFFAIRES.wizard.info.modes.TM.label',
    descKey:  'AFFAIRES.wizard.info.modes.TM.desc',
    icon: 'schedule',
    requiresContractAmount: false,
  },
  {
    code: 'CP',
    labelKey: 'AFFAIRES.wizard.info.modes.CP.label',
    descKey:  'AFFAIRES.wizard.info.modes.CP.desc',
    icon: 'add_circle',
    requiresContractAmount: false,
  },
  {
    code: 'LIVRABLE',
    labelKey: 'AFFAIRES.wizard.info.modes.LIVRABLE.label',
    descKey:  'AFFAIRES.wizard.info.modes.LIVRABLE.desc',
    icon: 'task',
    requiresContractAmount: true,
  },
];

/**
 * Libellé et aide du champ montant, par mode — en clés i18n. `RMB` y figure encore :
 * une affaire RMB existante rouverte dans l'assistant doit afficher son champ budget.
 */
export const BUDGET_LABEL: Record<BillingMode, { labelKey: string; hintKey: string }> = {
  AV:       { labelKey: 'AFFAIRES.wizard.info.budget.AV.label',       hintKey: 'AFFAIRES.wizard.info.budget.AV.hint'       },
  TM:       { labelKey: 'AFFAIRES.wizard.info.budget.TM.label',       hintKey: 'AFFAIRES.wizard.info.budget.TM.hint'       },
  CP:       { labelKey: 'AFFAIRES.wizard.info.budget.CP.label',       hintKey: 'AFFAIRES.wizard.info.budget.CP.hint'       },
  RMB:      { labelKey: 'AFFAIRES.wizard.info.budget.RMB.label',      hintKey: 'AFFAIRES.wizard.info.budget.RMB.hint'      },
  LIVRABLE: { labelKey: 'AFFAIRES.wizard.info.budget.LIVRABLE.label', hintKey: 'AFFAIRES.wizard.info.budget.LIVRABLE.hint' },
};

/** Les modes dont le montant saisi est un **montant contractuel** et non une enveloppe. */
export const CONTRACTUAL_MODES: ReadonlySet<BillingMode> = new Set<BillingMode>(['AV', 'LIVRABLE']);

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
  role?: string;
  budgetAllocation?: number;
  activiteId: number | null;
  activiteLabel?: string;
  disciplineId: number | null;
  disciplineLabel?: string;
}

// ── Wizard state ───────────────────────────────────────────────────────────────

export interface AffaireDraftState {
  id?: number;

  // Step 2 — Pays d'origine de l'affaire. Saisi à la création (il détermine la
  // séquence de référence `AFF-<année>-<n>` et l'unicité `(référence, pays)`), puis
  // en lecture seule : le changer après coup casserait les deux.
  paysId: number;
  paysLabel?: string;

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

  // Step 3 — LIVRABLE: set to true after first livrable is saved
  livrablesSaved?: boolean;

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
    tauxIntercompany?: number;
  }[];
  eligibleCostCategoryIds: number[];
  marginRatePct?: number;
  eligibleExpenseCategoryIds: number[];

  // Step 4 — Responsables & Budget
  responsables: ResponsableItem[];
  budgetPrevisionnel?: number;

  // Step 5 — Planification
  dateDebutFacturation?: string;
  /**
   * Durée du contrat EN MOIS. Saisie, persistée, et c'est elle qui produit
   * `dateFinContractuelle` — laquelle n'est plus saisissable directement.
   */
  dureeMois?: number;
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
    userName: r.fullName ?? '',
    resourceType: r.resourceType,
    rateType: r.rateType,
    rateAmount: Number(r.rateAmount),
    rateCurrency: r.rateCurrency,
    costAmount: r.costAmount != null ? Number(r.costAmount) : undefined,
  }));
  const responsables: AffaireDraftState['responsables'] = (dto.responsables ?? []).map((r: any) => ({
    userId: r.userId,
    userName: r.fullName ?? '',
    role: r.role,
    budgetAllocation: r.budgetAllocation != null ? Number(r.budgetAllocation) : undefined,
    activiteId: r.activiteId ?? null,
    activiteLabel: r.activiteLabel,
    disciplineId: r.disciplineId ?? null,
    disciplineLabel: r.disciplineLabel,
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
    dureeMois:                   dto.dureeMois ?? undefined,
    dateFinContractuelle:        dto.dateFinContractuelle,
    datePremireEcheance:         dto.datePremireEcheance,
  };
}
