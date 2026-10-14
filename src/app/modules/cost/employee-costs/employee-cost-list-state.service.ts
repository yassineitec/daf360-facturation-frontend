import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SortDirection } from '@khalilrebhiitec/daf360';

/** Tout ce qui décrit la liste des coûts collaborateurs telle que l'utilisateur l'a laissée. */
export interface EmployeeCostListState {
  searchText:   string;
  statusFilter: 'all' | 'current' | 'expired';
  costMin:      number | null;
  costMax:      number | null;
  employees:    string[];
  period:       Date[] | null;
  viewMode:     'list' | 'grid';
  sortKey:      string | null;
  sortDir:      SortDirection;
  page:         number;
  size:         number;
}

/**
 * Zone où les filtres survivent : la liste (`cost/employee-costs`) et la page historique
 * d'un coût (`cost/employee-costs/42/history`), seul « détail » ouvert depuis la liste.
 */
const EMPLOYEE_COSTS_ZONE = /\/employee-costs(\/\d+\/history)?$/;

/**
 * Mémorise les filtres de la page Coûts collaborateurs pour que le retour depuis
 * l'historique d'un coût retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / historique efface l'état — revenir par le
 * menu après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeCostListStateService {
  private state: EmployeeCostListState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!EMPLOYEE_COSTS_ZONE.test(path)) this.state = null;
      });
  }

  save(state: EmployeeCostListState): void {
    this.state = state;
  }

  restore(): EmployeeCostListState | null {
    return this.state;
  }
}
