export type WipEmailMode = 'TM' | 'AV' | 'LIVRABLE' | 'TS';

export interface WipEmailTemplate {
  id: number;
  mode: WipEmailMode;
  paysId: number | null;
  subjectTemplate: string;
  bodyTemplate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveWipEmailTemplateRequest {
  mode: WipEmailMode;
  paysId: number | null;
  subjectTemplate: string;
  bodyTemplate: string;
  active: boolean;
}

/** Tokens available per mode — shown in the editor for easy insertion. */
export const WIP_EMAIL_TOKENS_COMMON = [
  '{{client_name}}', '{{affaire_reference}}', '{{affaire_intitule}}',
  '{{period_from}}', '{{period_to}}', '{{currency}}',
];

export const WIP_EMAIL_TOKENS_BY_MODE: Record<WipEmailMode, string[]> = {
  TM:       [...WIP_EMAIL_TOKENS_COMMON, '{{amount}}', '{{carried_forward}}'],
  AV:       [...WIP_EMAIL_TOKENS_COMMON, '{{amount}}', '{{taux_precedent}}', '{{taux_saisi}}'],
  LIVRABLE: [...WIP_EMAIL_TOKENS_COMMON, '{{total_amount}}', '{{livrables_summary}}'],
  TS:       ['{{client_name}}', '{{affaire_reference}}', '{{affaire_intitule}}',
             '{{currency}}', '{{total_amount}}', '{{ts_summary}}'],
};
