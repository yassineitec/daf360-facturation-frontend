import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ApprovalKind } from './approval-item';

/** Tout ce qui décrit la file d'approbation des coûts telle que l'utilisateur l'a laissée. */
export interface CostApprovalQueueState {
  searchTerm:  string;
  kind:        '' | ApprovalKind;
  priority:    string;
  level:       string;
  category:    string;
  dateRange:   Date[] | null;
  subCategory: string;
  currency:    string;
  amountMin:   string;
  amountMax:   string;
  viewMode:    'grid' | 'list';
}

/**
 * Zone où les filtres survivent : la file (`cost/approval`) et la fiche d'une facture de
 * coût qu'elle ouvre (`cost/42`). Sans préfixe fixe, pour valoir sous le shell
 * (`/finance/cost/approval`) comme en app servie seule (`/cost/approval`).
 */
const COST_APPROVAL_ZONE = /\/cost(\/approval|\/\d+)$/;

/**
 * Mémorise les filtres de la file d'approbation des coûts pour que le retour depuis la
 * fiche d'une facture retrouve la file telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une file propre.
 * Et toute navigation hors de la zone file / fiche efface l'état — revenir par le menu
 * après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class CostApprovalQueueStateService {
  private state: CostApprovalQueueState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!COST_APPROVAL_ZONE.test(path)) this.state = null;
      });
  }

  save(state: CostApprovalQueueState): void {
    this.state = state;
  }

  restore(): CostApprovalQueueState | null {
    return this.state;
  }
}
