import type { LineDetailDto } from '../billing/billing.service';

/**
 * Colonne « Facturé » des historiques WIP (onglets WIP et TS WIP) — part RÉELLEMENT facturée
 * du montant incrémental d'une période.
 *
 * Règle du 2026-11-23 : la validation DF crée la facture en BROUILLON et passe déjà la ligne de
 * facturation à FACTURE ; la période ne doit pourtant compter comme facturée qu'une fois la
 * facture complétée (/finance/invoicing/{id}/edit) et soumise. Une facture ne compte donc que
 * si son statut n'est pas dans {@link NOT_INVOICED_STATUSES}, et pour le montant HT saisi
 * dedans — un « % à facturer » abaissé à l'édition fait baisser le pourcentage.
 */

/** Statuts de facture qui ne valent PAS facturation : pas encore soumise, ou annulée. */
export const NOT_INVOICED_STATUSES: ReadonlySet<string> =
  new Set(['DRAFT', 'RETURNED', 'CANCELLED', 'CREDIT_NOTED']);

/** Ce qu'il faut savoir d'une facture liée : son statut et le total HT de chacune de ses lignes. */
export interface LinkedInvoiceInfo {
  status:     string;
  lineTotals: number[];
}

export interface WipInvoicedProgress {
  /** Montant encore à facturer pour la période (null = pas de ligne de facturation). */
  remainderPending: number | null;
  /** Montant facturé pour la période (null = pas de ligne de facturation). */
  montantFacture:   number | null;
  isComplete:       boolean;
}

const round3 = (n: number) => Number(n.toFixed(3));

/**
 * @param montantIncremental montant déclaré de la période
 * @param originLine         ligne de facturation de la déclaration (null si absente)
 * @param lines              toutes les lignes de l'affaire (pour suivre les reprises de solde)
 * @param invoices           factures liées déjà chargées (id → statut + lignes) ; une facture
 *                           pas encore chargée ne compte pas
 *
 * La période est découpée en « parts », une par maillon de sa chaîne de reprises de solde
 * (`carriedForwardFromLineId`) : le maillon d'origine porte le montant confirmé par le client
 * (montant − son solde reporté), chaque reprise porte le solde qu'elle a absorbé (solde du
 * maillon précédent − son propre solde). Une part ne compte que si la facture de son maillon
 * est soumise. Pour le maillon d'origine, si sa facture n'a qu'une ligne, c'est le montant
 * saisi sur cette ligne qui compte (plafonné à la part).
 */
export function wipInvoicedProgress(
  montantIncremental: number,
  originLine: LineDetailDto | null,
  lines: LineDetailDto[],
  invoices: ReadonlyMap<number, LinkedInvoiceInfo>,
): WipInvoicedProgress {
  if (!originLine) return { remainderPending: null, montantFacture: null, isComplete: false };

  // Tant que le MT Client n'est pas saisi, rien n'est facturé.
  if (originLine.statut === 'EN_ATTENTE_CLIENT') {
    return { remainderPending: montantIncremental, montantFacture: 0, isComplete: false };
  }

  const issued = (l: LineDetailDto): LinkedInvoiceInfo | null => {
    if (l.invoiceId == null) return null;
    const inv = invoices.get(l.invoiceId);
    return inv && !NOT_INVOICED_STATUSES.has(inv.status) ? inv : null;
  };

  let facture = 0;
  let prev: LineDetailDto | null = null;
  let cur: LineDetailDto | undefined = originLine;
  for (let i = 0; cur && i < 50; i++) {
    const ownCarry = cur.wipCarriedForward ?? 0;
    let part = prev === null
      ? montantIncremental - ownCarry
      : (prev.wipCarriedForward ?? 0) - ownCarry;
    const inv = issued(cur);
    if (inv) {
      if (prev === null && inv.lineTotals.length === 1) part = Math.min(part, inv.lineTotals[0]);
      facture += Math.max(part, 0);
    }
    prev = cur;
    const prevId: number = cur.id;
    cur = lines.find(l => l.carriedForwardFromLineId === prevId);
  }

  const montantFacture   = round3(Math.min(facture, montantIncremental));
  const remainderPending = round3(montantIncremental - montantFacture);
  return { remainderPending, montantFacture, isComplete: remainderPending < 0.01 };
}
