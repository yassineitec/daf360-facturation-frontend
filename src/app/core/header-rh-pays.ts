import { Signal, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectSelectedCountryIds } from '@khalilrebhiitec/daf360';

/**
 * Les drapeaux cochés, en ids RH BRUTS (table `pays` du RH), triés et séparés par des
 * virgules (`179,64`) ; `undefined` = « Tous les pays ».
 *
 * Pour les données qui viennent du RH ou de la paie (missions, embauches, avances), dont les
 * ids de pays sont ceux du RH. Les données FINANCE, elles, prennent les ids traduits par
 * `HeaderPaysService.paysList`.
 *
 * Texte trié : deux sélections identiques donnent la même valeur, donc un `effect` qui la
 * compare au dernier chargement ne recharge que sur un vrai changement de drapeaux.
 * À appeler dans un contexte d'injection.
 */
export function injectHeaderRhPays(): Signal<string | undefined> {
  const ids = inject(Store).selectSignal(selectSelectedCountryIds);
  return computed(() => {
    const list = [...new Set(ids().map(Number).filter(id => Number.isInteger(id) && id > 0))]
      .sort((a, b) => a - b);
    return list.length ? list.join(',') : undefined;
  });
}

/** Cet élément est-il d'un des pays cochés (`179,64`) ? Sans drapeau, tout passe. */
export function inRhPays(pays: string | undefined, paysId: number | null | undefined): boolean {
  if (!pays) return true;
  return paysId != null && pays.split(',').includes(String(paysId));
}
