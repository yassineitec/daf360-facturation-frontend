import { Signal, computed, inject } from '@angular/core';
import { HeaderPaysService } from './header-pays.service';

/**
 * L'entité UNIQUE d'un écran qui ne travaille que sur une entité à la fois (réglages,
 * reporting P&L, budget, barèmes…), tirée des drapeaux de la barre — même règle que
 * /rh/admin :
 * - un drapeau coché → ce pays ;
 * - aucun → le pays de l'utilisateur (\`own\`) ;
 * - plusieurs → le pays de l'utilisateur s'il est coché, sinon le premier coché.
 *
 * Ids FINANCE (\`pays_ref\`). 0 = pas encore connu (drapeaux non résolus et pays de
 * l'utilisateur pas encore arrivé). À appeler dans un contexte d'injection.
 */
export function injectFlagEntity(own: Signal<number>): Signal<number> {
  const flags = inject(HeaderPaysService).paysList;
  return computed(() => {
    const ids = (flags() ?? '').split(',').map(Number).filter(id => Number.isInteger(id) && id > 0);
    const mine = own();
    if (ids.length === 1) return ids[0];
    if (!ids.length || ids.includes(mine)) return mine;
    return ids[0];
  });
}

/** Plusieurs drapeaux (ou aucun) : l'écran dit quelle entité il montre. */
export function injectSeveralFlags(): Signal<boolean> {
  const flags = inject(HeaderPaysService).paysList;
  return computed(() => (flags() ?? '').split(',').filter(Boolean).length !== 1);
}
