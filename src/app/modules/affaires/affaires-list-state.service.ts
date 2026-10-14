import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AffaireSort } from './components/affaires-table-section.component';

/** Tout ce qui décrit la liste des affaires telle que l'utilisateur l'a laissée. */
export interface AffairesListState {
  searchText:    string;
  statut:        string;
  clientId:      number | null;
  clientName:    string | null;
  paysId:        number | null;
  responsableId: number | null;
  billingMode:   string;
  dateDebut:     Date[] | null;
  sort:          AffaireSort | null;
  sortParam:     string | null;
  page:          number;
  pageSize:      number;
  viewMode:      'grid' | 'list';
}

/**
 * Zone où les filtres survivent : la liste (`affaires`), le détail (`affaires/42`) et la
 * modification lancée depuis le détail (`affaires/42/edit`). Sans préfixe fixe, pour
 * valoir sous le shell (`/finance/affaires`) comme en app servie seule (`/affaires`).
 */
const AFFAIRES_ZONE = /\/affaires(\/\d+(\/edit)?)?$/;

/**
 * Mémorise les filtres de la page Affaires pour que le retour depuis le détail (fil
 * d'Ariane « Affaires ») retrouve la liste telle qu'on l'a quittée.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'une liste propre.
 * Et toute navigation hors de la zone liste / détail efface l'état — revenir sur
 * Affaires par le menu après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class AffairesListStateService {
  private state: AffairesListState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (!AFFAIRES_ZONE.test(path)) this.state = null;
      });
  }

  save(state: AffairesListState): void {
    this.state = state;
  }

  restore(): AffairesListState | null {
    return this.state;
  }
}
