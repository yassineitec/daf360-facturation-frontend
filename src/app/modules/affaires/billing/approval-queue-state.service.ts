import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Valeurs des signaux d'état de la file d'approbation, par nom (voir
 * `ApprovalQueueComponent.persisted`) : onglets, recherches, filtres, tris et pages.
 */
export type ApprovalQueueState = Record<string, unknown>;

/** La file (`billing/approval`) et ses détails (`billing/approval/line/42`, `.../livrable/42`). */
const APPROVAL_ZONE = /\/billing\/approval(\/(line|livrable)\/\d+)?$/;
/** Facture brouillon ouverte par une validation DF : son enregistrement ramène à la file. */
const APPROVAL_INVOICE_EDIT = /\/invoicing\/\d+\/edit$/;

/**
 * Mémorise l'état de la file d'approbation pour que le retour depuis un détail retrouve
 * l'écran tel qu'on l'a quitté.
 *
 * Volontairement en mémoire seulement : un rechargement (F5) repart d'un écran propre.
 * Et toute navigation hors de la zone file / détail / facture issue de la validation
 * efface l'état — revenir par le menu après être passé ailleurs ne ramène pas l'ancien filtre.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalQueueStateService {
  private state: ApprovalQueueState | null = null;

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const [path, query = ''] = e.urlAfterRedirects.split('#')[0].split('?');
        const inZone = APPROVAL_ZONE.test(path)
          || (APPROVAL_INVOICE_EDIT.test(path) && new URLSearchParams(query).get('fromApproval') === '1');
        if (!inZone) this.state = null;
      });
  }

  save(state: ApprovalQueueState): void {
    this.state = state;
  }

  restore(): ApprovalQueueState | null {
    return this.state;
  }
}
