import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TableSort } from '../../../shared/table-tools';
import { SupplierStatusFilter } from '../supplier.model';

/** Tout ce qui décrit la liste des fournisseurs telle que l'utilisateur l'a laissée. */
export interface SupplierListState {
  searchText:   string;
  statusFilter: SupplierStatusFilter;
  typeFilter:   string;
  ibanFilter:   '' | 'with' | 'without';
  tvaFilter:    '' | 'with' | 'without';
  sort:         TableSort | null;
  page:         number;
  pageSize:     number;
  viewMode:     'grid' | 'list';
}

/**
 * Zone où les filtres survivent : la liste (`suppliers`), la fiche (`suppliers/42`) et sa
 * modification (`suppliers/42/edit`). Sans préfixe fixe, pour valoir sous le shell
 * (`/finance/suppliers`) comme en app servie seule (`/suppliers`).
 */
const SUPPLIERS_ZONE = /\/suppliers(\/\d+(\/edit)?)?$/;

/**
 * Mémorise les filtres de la page Fournisseurs pour que le retour depuis une fiche (fil
 * d'Ariane) retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / fiche efface l'état — revenir sur
 * Fournisseurs par le menu après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class SupplierListStateService {
  private state: SupplierListState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!SUPPLIERS_ZONE.test(path)) this.state = null;
      });
  }

  save(state: SupplierListState): void {
    this.state = state;
  }

  restore(): SupplierListState | null {
    return this.state;
  }
}
