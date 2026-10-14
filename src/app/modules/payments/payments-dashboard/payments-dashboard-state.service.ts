import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TableSort } from '../../../shared/table-tools';

/** Tout ce qui décrit la balance âgée du recouvrement telle que l'utilisateur l'a laissée. */
export interface PaymentsDashboardState {
  searchText:  string;
  affaireId:   string;
  clientId:    string;
  dateRange:   Date[] | null;
  overdueOnly: boolean;
  sort:        TableSort | null;
  page:        number;
  pageSize:    number;
  viewMode:    'grid' | 'list';
}

/**
 * Zone où les filtres survivent : la liste (`recouvrement`) et la fiche de recouvrement
 * d'une facture (`recouvrement/42`). Sans préfixe fixe, pour valoir sous le shell
 * (`/finance/recouvrement`) comme en app servie seule (`/recouvrement`).
 */
const RECOUVREMENT_ZONE = /\/recouvrement(\/\d+)?$/;

/**
 * Mémorise les filtres de la page Recouvrement pour que le retour depuis une fiche (fil
 * d'Ariane) retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / fiche efface l'état — revenir par le menu
 * après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class PaymentsDashboardStateService {
  private state: PaymentsDashboardState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!RECOUVREMENT_ZONE.test(path)) this.state = null;
      });
  }

  save(state: PaymentsDashboardState): void {
    this.state = state;
  }

  restore(): PaymentsDashboardState | null {
    return this.state;
  }
}
