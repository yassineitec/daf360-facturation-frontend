import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TableSort } from '../../../shared/table-tools';

/** Tout ce qui décrit la liste des clients telle que l'utilisateur l'a laissée. */
export interface ClientListState {
  searchText: string;
  sector:     string;
  status:     '' | 'active' | 'inactive';
  kyc:        '' | 'done' | 'pending';
  country:    string;
  currency:   string;
  affaires:   '' | 'with' | 'without';
  sort:       TableSort | null;
  page:       number;
  pageSize:   number;
  viewMode:   'grid' | 'list';
}

/**
 * Zone où les filtres survivent : la liste (`clients`), la fiche (`clients/42`) et sa
 * modification (`clients/42/edit`). Sans préfixe fixe, pour valoir sous le shell
 * (`/finance/clients`) comme en app servie seule (`/clients`).
 */
const CLIENTS_ZONE = /\/clients(\/\d+(\/edit)?)?$/;

/**
 * Mémorise les filtres de la page Clients pour que le retour depuis une fiche (fil
 * d'Ariane) retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / fiche efface l'état — revenir sur Clients
 * par le menu après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class ClientListStateService {
  private state: ClientListState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!CLIENTS_ZONE.test(path)) this.state = null;
      });
  }

  save(state: ClientListState): void {
    this.state = state;
  }

  restore(): ClientListState | null {
    return this.state;
  }
}
