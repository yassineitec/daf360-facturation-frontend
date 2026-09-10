export type BillingMode = 'FORFAIT' | 'REGIE' | 'LIVRABLE';

export interface BillingModeOption {
  code: BillingMode;
  /** Clé i18n du nom du mode — jamais un libellé en dur : le choix se lit dans les deux langues. */
  labelKey: string;
  /** Clé i18n de la phrase explicative sous le nom. */
  descKey: string;
  icon: string;
  requiresContractAmount: boolean;
}

export const BILLING_MODES: BillingModeOption[] = [
  {
    code: 'FORFAIT',
    labelKey: 'AFFAIRES.wizard.info.modes.FORFAIT.label',
    descKey:  'AFFAIRES.wizard.info.modes.FORFAIT.desc',
    icon: 'trending_up',
    requiresContractAmount: true,
  },
  {
    code: 'REGIE',
    labelKey: 'AFFAIRES.wizard.info.modes.REGIE.label',
    descKey:  'AFFAIRES.wizard.info.modes.REGIE.desc',
    icon: 'schedule',
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

export const BUDGET_LABEL: Record<BillingMode, { labelKey: string; hintKey: string }> = {
  FORFAIT:  { labelKey: 'AFFAIRES.wizard.info.budget.FORFAIT.label',  hintKey: 'AFFAIRES.wizard.info.budget.FORFAIT.hint'  },
  REGIE:    { labelKey: 'AFFAIRES.wizard.info.budget.REGIE.label',    hintKey: 'AFFAIRES.wizard.info.budget.REGIE.hint'    },
  LIVRABLE: { labelKey: 'AFFAIRES.wizard.info.budget.LIVRABLE.label', hintKey: 'AFFAIRES.wizard.info.budget.LIVRABLE.hint' },
};

/** Les modes dont le montant saisi est un **montant contractuel** et non une enveloppe. */
export const CONTRACTUAL_MODES: ReadonlySet<BillingMode> = new Set<BillingMode>(['FORFAIT', 'LIVRABLE']);

// ── DTOs matching backend ──────────────────────────────────────────────────────

export interface ExternalProjectResult {
  serverReference: string;
  erpReference: string;
  projectName: string;
  clientName: string;
  status: string;
}

export interface DisciplineDto {
  /**
   * NULL pour une discipline déjà saisie librement dans cette base et reproposée par
   * `/disciplines/known` : elle n'a qu'un libellé, jamais d'identifiant DOC360. Les
   * disciplines venant de l'ODS en portent toujours un.
   */
  id: number | null;
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

  // Step 2 — Pays d'origine de l'affaire.
  paysId: number;
  paysLabel?: string;

  // Step 1 — DOC360 project (optional)
  doc360ProjectName?: string;
  doc360ErpReference?: string;
  doc360ServerReference?: string;
  doc360ClientName?: string;

  // Step 2 — Informations générales
  clientId?: number;
  clientName?: string;
  clientKycDone?: boolean;

  /**
   * Step 2 — Contacts du client rattachés à l'affaire. Ce sont EUX qui reçoivent les
   * factures : l'affaire ne peut plus être activée sans au moins un.
   *
   * Choisis à l'étape 2 et non dans une étape à part, parce qu'ils dépendent du client
   * qu'on vient de sélectionner juste au-dessus — une étape séparée aurait permis d'y
   * arriver sans client.
   */
  contactIds: number[];
  /**
   * Le destinataire des factures parmi `contactIds`. Un drapeau et non une déduction
   * depuis le libellé de fonction, qui est du texte libre : rien ne garantit qu'il
   * contienne « finance ».
   */
  billingContactId?: number;
  intitule: string;
  reference?: string;
  doc360Ref?: string;
  erpReference?: string | null;
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
    userEmail?: string;
    rateType: string;
    rateAmount: number; rateCurrency: string;
    costAmount?: number;
    tauxIntercompany?: number;
    tauxVente?: number;
    rateSource?: 'EXTERNAL' | 'INTERNAL';
    costDataMissing?: boolean;
  }[];
  eligibleCostCategoryIds: number[];
  marginRatePct?: number;
  eligibleExpenseCategoryIds: number[];

  // Step 4 — Responsables & Budget
  responsables: ResponsableItem[];
  budgetPrevisionnel?: number;

  // Step 5 — Planification
  dateDebutFacturation?: string;
  dureeMois?: number;
  dateFinContractuelle?: string;
  datePremireEcheance?: string;
}

export function mapDraftToState(dto: any, clientName: string, clientKycDone: boolean): AffaireDraftState {
  const repartitions: AffaireDraftState['repartitions'] = (dto.contactAllocationItems ?? []).map((r: any) => ({
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
  const contacts: any[] = dto.contacts ?? [];
  return {
    id:                          dto.id,
    paysId:                      dto.paysId ?? 0,
    clientId:                    dto.clientId,
    clientName,
    clientKycDone,
    contactIds:                  contacts.map(c => c.contactId),
    billingContactId:            contacts.find(c => c.isBilling)?.contactId,
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
