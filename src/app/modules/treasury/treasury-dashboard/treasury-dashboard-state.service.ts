import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TableSort } from '../../../shared/table-tools';
import { TreasuryHorizon } from '../treasury.model';

/** Tout ce qui décrit la page Trésorerie telle que l'utilisateur l'a laissée. */
export interface TreasuryDashboardState {
  horizon:       TreasuryHorizon;
  bucketSearch:  string;
  inflowSearch:  string;
  outflowSearch: string;
  inflowSort:    TableSort | null;
  outflowSort:   TableSort | null;
  inflowPage:    number;
  outflowPage:   number;
  flowPageSize:  number;
}

/**
 * Zone où les filtres survivent : la page (`tresorerie`) et la fiche de recouvrement d'une
 * facture qu'elle ouvre (`recouvrement/42`). Sans préfixe fixe, pour valoir sous le shell
 * (`/finance/tresorerie`) comme en app servie seule (`/tresorerie`).
 */
const TREASURY_ZONE = /\/(tresorerie|recouvrement\/\d+)$/;

/**
 * Mémorise l'horizon, les recherches, les tris et les pages de la Trésorerie pour que le
 * retour depuis la fiche d'une facture retrouve la page telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une page propre.
 * Et toute navigation hors de la zone page / fiche efface l'état — revenir par le menu
 * après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class TreasuryDashboardStateService {
  private state: TreasuryDashboardState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!TREASURY_ZONE.test(path)) this.state = null;
      });
  }

  save(state: TreasuryDashboardState): void {
    this.state = state;
  }

  restore(): TreasuryDashboardState | null {
    return this.state;
  }
}
