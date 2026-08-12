import type { BadgeVariant } from '@khalilrebhiitec/daf360';

/**
 * Libellés et couleurs des codes techniques du module finance — **une seule source**.
 *
 * Le module affichait ses énumérations telles quelles : `EN_ATTENTE_RF`, `CREDIT_NOTED`,
 * `A_VERIFIER`, `BANK_TRANSFER` arrivaient bruts à l'écran, et chaque composant
 * réinventait sa propre table de correspondance — avec ses couleurs en dur
 * (`#fef3c7`, `#065f46`…) et parfois des codes faux : la table des frais utilisait
 * `REFUSE` alors que la base n'accepte que `REJETE`, donc ce statut n'était jamais
 * reconnu et s'affichait brut.
 *
 * Deux règles ici :
 *  · les **libellés** vivent en i18n, sous `ENUMS.<DOMAINE>.<CODE>` — un statut se lit
 *    dans les deux langues comme le reste de l'interface ;
 *  · les **couleurs** sont des variantes de badge de la lib, jamais des hex, pour que
 *    « validé » ait la même teinte dans un tableau, une pastille et un graphique.
 *
 * Les domaines et leurs valeurs sont repris des contraintes CHECK de la base, qui font
 * foi (V15 pour la facturation, V22 pour les statuts d'affaire).
 */

/** Statuts d'affaire — `affaires.statut`. */
export const AFFAIRE_STATUT_BADGE: Record<string, BadgeVariant> = {
  DRAFT:      'neutral',
  CONFIGURED: 'info',
  EN_COURS:   'success',
  SUSPENDUE:  'warning',
  CLOTUREE:   'secondary',
  ARCHIVEE:   'neutral',
};

/** Statuts de facture — `invoices.statut`. */
export const INVOICE_STATUT_BADGE: Record<string, BadgeVariant> = {
  DRAFT:          'neutral',
  SUBMITTED:      'info',
  APPROVED:       'primary',
  EMITTED:        'teal',
  SENT:           'teal',
  PARTIALLY_PAID: 'warning',
  PAID:           'success',
  RETURNED:       'warning',
  DISPUTED:       'danger',
  CANCELLED:      'neutral',
  CREDIT_NOTED:   'secondary',
};

/** Statuts de travaux supplémentaires — `travaux_supplementaires.statut`. */
export const TS_STATUT_BADGE: Record<string, BadgeVariant> = {
  CREATED:           'neutral',
  VALID_TECHNIQUE:   'info',
  VALID_COMMERCIALE: 'primary',
  INTEGRE:           'success',
  FACTURE:           'teal',
  ANNULE:            'danger',
};

/**
 * Statuts de frais remboursable — `expense_items.statut`.
 * Les quatre valeurs de la contrainte `CK_Expense_Statut`, dont `REJETE` (et non
 * `REFUSE`, qui n'existe pas en base et que l'ancienne table cherchait en vain).
 */
export const EXPENSE_STATUT_BADGE: Record<string, BadgeVariant> = {
  EN_ATTENTE: 'warning',
  VALIDE:     'success',
  REJETE:     'danger',
  INTEGRE:    'teal',
};

/** Statuts de ligne de facturation — `billing_lines.statut`. */
export const BILLING_LINE_STATUT_BADGE: Record<string, BadgeVariant> = {
  BROUILLON:     'neutral',
  EN_ATTENTE_RF: 'warning',
  VALIDE_RF:     'info',
  EN_ATTENTE_DF: 'warning',
  VALIDE_DF:     'primary',
  FACTURE:       'success',
  A_VERIFIER:    'warning',
  RETOURNE:      'danger',
  ANNULE:        'neutral',
};

/** Statuts de lot de facturation — `billing_lots.statut`. */
export const BILLING_LOT_STATUT_BADGE: Record<string, BadgeVariant> = {
  EN_ATTENTE_MANAGER: 'warning',
  VALIDE_MANAGER:     'info',
  EN_ATTENTE_RF:      'warning',
  VALIDE_RF:          'info',
  EN_ATTENTE_DF:      'warning',
  VALIDE_DF:          'primary',
  FACTURE:            'success',
  RETOURNE:           'danger',
  ANNULE:             'neutral',
};

/** Statuts de jalon / livrable — `affaire_jalons.statut`, `affaire_livrables.statut`. */
export const JALON_STATUT_BADGE: Record<string, BadgeVariant> = {
  A_FACTURER:            'neutral',
  EN_COURS:              'info',
  EN_ATTENTE_VALIDATION: 'warning',
  FACTURE:               'success',
  ANNULE:                'neutral',
};

/**
 * Domaines qui n'ont pas de couleur mais qui ont besoin d'un libellé lisible :
 * ils passent par `ENUMS.<DOMAINE>.<CODE>` sans table de badge.
 *
 *  · `INVOICE_TYPE`   — ACOMPTE, SITUATION, FINALE, AVOIR…
 *  · `BILLING_MODE`   — AV, TM, CP, RMB, LIVRABLE
 *  · `BILLING_PERIOD` — MONTHLY, QUARTERLY…
 *  · `PAYMENT_METHOD` — BANK_TRANSFER, CHECK, CASH…
 *  · `RESOURCE_TYPE`  — INTERNAL / EXTERNAL
 *  · `RATE_TYPE`      — DAILY / HOURLY
 *  · `MODE_AFFECTATION` — MANUEL / AUTO
 */

/**
 * Repli quand aucune traduction n'existe : `EN_ATTENTE_RF` → « En attente RF ».
 *
 * Ce n'est PAS un substitut aux clés i18n — c'est le filet pour un code apparu en base
 * avant d'être traduit. Sans lui, l'écran afficherait la clé i18n manquante, ce qui est
 * plus déroutant que le code lui-même.
 */
export function humanise(code: string | null | undefined): string {
  if (!code) return '—';
  const spaced = code.replace(/_/g, ' ').toLocaleLowerCase('fr');
  return spaced.charAt(0).toLocaleUpperCase('fr') + spaced.slice(1);
}

/**
 * Le libellé d'un code : la traduction si elle existe, sinon la forme lisible.
 *
 * `translate.instant()` renvoie la clé quand elle manque — on s'en sert comme signal
 * pour retomber sur `humanise`, plutôt que d'afficher `ENUMS.INVOICE_STATUT.FOO`.
 */
export function enumLabel(
  translate: { instant: (key: string) => string },
  domain: string,
  code: string | null | undefined,
): string {
  if (!code) return '—';
  const key   = `ENUMS.${domain}.${code}`;
  const label = translate.instant(key);
  return label === key ? humanise(code) : label;
}
