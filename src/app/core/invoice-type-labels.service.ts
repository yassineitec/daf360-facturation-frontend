import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FactListService } from './fact-list.service';
import { ListValueDto, localizedLabel } from '../modules/cost/cost.model';
import { enumLabel } from '../shared/enum-labels';

/**
 * Libellé d'un type de facture tel que paramétré dans /finance/admin (liste INVOICE_TYPE
 * du pays de la facture), dans la langue de l'écran. Repli sur ENUMS.INVOICE_TYPE pour un
 * code absent de la liste (valeur désactivée depuis, ancienne facture).
 */
export function invoiceTypeLabel(
  values: ListValueDto[], code: string | null | undefined, translate: TranslateService,
): string {
  const v = code ? values.find(x => x.code === code) : undefined;
  return (v && localizedLabel(v.labelFr, v.labelEn, translate.currentLang()))
    || enumLabel(translate, 'INVOICE_TYPE', code);
}

/**
 * Les libellés INVOICE_TYPE par pays, pour les écrans qui affichent des factures de
 * plusieurs pays (liste, cartes) ou qui n'ont pas la liste sous la main (fiche facture,
 * onglet Factures de l'affaire).
 *
 * `ensure()` se fait à part de `label()` : un `computed` qui lit `label()` ne doit pas
 * déclencher l'appel lui-même (écrire un signal depuis un computed est interdit, et la
 * réponse arrive synchrone quand FactListService l'a déjà en cache).
 */
@Injectable({ providedIn: 'root' })
export class InvoiceTypeLabels {
  private readonly listSvc   = inject(FactListService);
  private readonly translate = inject(TranslateService);
  private readonly byPays    = signal<ReadonlyMap<number, ListValueDto[]>>(new Map());

  /** Charge (ou relit du cache de FactListService, que l'admin vide à chaque
   * modification) la liste de chacun de ces pays. */
  ensure(paysIds: Iterable<number | null | undefined>): void {
    for (const paysId of new Set(paysIds)) {
      if (!paysId) continue;
      this.listSvc.getListValues('INVOICE_TYPE', paysId)
        .subscribe(values => this.byPays.update(m => new Map(m).set(paysId, values)));
    }
  }

  label(code: string | null | undefined, paysId: number | null | undefined): string {
    return invoiceTypeLabel((paysId && this.byPays().get(paysId)) || [], code, this.translate);
  }
}
