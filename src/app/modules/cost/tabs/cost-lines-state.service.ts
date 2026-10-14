import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { CostInvoiceSort } from './cost-lines-table-section.component';

/** Tout ce qui décrit la liste des factures de coût telle que l'utilisateur l'a laissée. */
export interface CostLinesState {
  searchText: string;
  status:     string;
  category:   string;
  dateRange:  Date[] | null;
  amountMin:  string;
  amountMax:  string;
  sort:       CostInvoiceSort | null;
  sortParam:  string | null;
  page:       number;
  size:       number;
  viewMode:   'grid' | 'list' | 'supplier';
}

/**
 * Zone où les filtres survivent : la liste (`cost`), la fiche d'une facture (`cost/42`),
 * sa modification (`cost/42/edit`) et la fiche fournisseur ouverte depuis la vue « par
 * fournisseur » (`cost/supplier/7`, `cost/supplier/none`). Sans préfixe fixe, pour valoir
 * sous le shell (`/finance/cost`) comme en app servie seule (`/cost`).
 */
const COST_LINES_ZONE = /\/cost(\/\d+(\/edit)?|\/supplier\/(\d+|none))?$/;

/**
 * Mémorise les filtres de la page Lignes de coût pour que le retour depuis une fiche (fil
 * d'Ariane) retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / fiches efface l'état — revenir par le menu
 * après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class CostLinesStateService {
  private state: CostLinesState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!COST_LINES_ZONE.test(path)) this.state = null;
      });
  }

  save(state: CostLinesState): void {
    this.state = state;
  }

  restore(): CostLinesState | null {
    return this.state;
  }
}
