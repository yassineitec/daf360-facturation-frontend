import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TableSort } from '../../../shared/table-tools';

/** Tout ce qui décrit la liste des factures telle que l'utilisateur l'a laissée. */
export interface InvoiceListState {
  searchText: string;
  statut:     string;
  dateRange:  Date[] | null;
  client:     string;
  affaire:    string;
  dueRange:   Date[] | null;
  minTtc:     string;
  maxTtc:     string;
  overdue:    boolean;
  sort:       TableSort | null;
  page:       number;
  pageSize:   number;
  viewMode:   'grid' | 'list';
}

/**
 * Zone où les filtres survivent : la liste (`invoicing`), le détail (`invoicing/42`) et la
 * modification lancée depuis le détail (`invoicing/42/edit`). Sans préfixe fixe, pour
 * valoir sous le shell (`/finance/invoicing`) comme en app servie seule (`/invoicing`).
 */
const INVOICING_ZONE = /\/invoicing(\/\d+(\/edit)?)?$/;

/**
 * Mémorise les filtres de la page Factures pour que le retour depuis le détail (fil
 * d'Ariane) retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / détail efface l'état — revenir sur
 * Factures par le menu après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceListStateService {
  private state: InvoiceListState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!INVOICING_ZONE.test(path)) this.state = null;
      });
  }

  save(state: InvoiceListState): void {
    this.state = state;
  }

  restore(): InvoiceListState | null {
    return this.state;
  }
}
