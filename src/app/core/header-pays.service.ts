import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { selectSelectedCountryId, selectSelectedCountryIds } from '@khalilrebhiitec/daf360';
import { catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AffaireService } from '../modules/affaires/affaire.service';

/** GET /api/hr/ref/pays — on n'en lit que l'id RH et le code ISO. */
interface RhPays { id: number; isoCode: string | null; }

/**
 * Le pays du drapeau de la navbar, traduit en identifiant FINANCE (`pays_ref.id`).
 *
 * POURQUOI UNE TRADUCTION
 * -----------------------
 * Le drapeau est construit par le shell à partir des pays RH : le store porte donc un id de
 * la table `pays` du RH. Or `pays_ref` (finance) et `pays` (RH) ne partagent pas leurs ids —
 * en local ils sont décalés de 1 (Tunisie = 179 au RH, 178 en finance ; 179 en finance est la
 * Turquie). Envoyer l'id brut à l'API finance filtrait donc sur le mauvais pays.
 *
 * Le seul point commun fiable est le code ISO : id RH → ISO (via /api/hr/ref/pays) → id
 * finance (via /ref/pays). Si les ids sont un jour réalignés, la traduction reste juste.
 *
 * `paysId` : id finance, ou `null` pour « Tous les pays » — et aussi `null` le temps que
 * les deux référentiels arrivent (les pages chargent alors « tous », puis rechargent le
 * pays dès qu'il est connu : leurs effets suivent ce signal). Si l'API RH ne répond pas, on
 * retombe sur l'id brut, c'est-à-dire sur le comportement d'avant cette traduction.
 */
@Injectable({ providedIn: 'root' })
export class HeaderPaysService {
  private readonly http       = inject(HttpClient);
  private readonly affaireSvc = inject(AffaireService);

  /** L'id RH tel que le shell l'a mis dans le store ; null = « Tous les pays ». */
  private readonly rhId = inject(Store).selectSignal(selectSelectedCountryId);

  /** id RH → ISO. `null` tant que non chargé ; `'failed'` si l'API RH a échoué. */
  private readonly rhIsoById = toSignal(
    this.http.get<RhPays[]>(`${environment.hrApiUrl}/api/hr/ref/pays`).pipe(
      map(list => new Map(list.map(p => [p.id, (p.isoCode ?? '').trim().toUpperCase()] as const))),
      catchError(() => of('failed' as const)),
    ),
    { initialValue: null },
  );

  /** ISO → id finance. `null` tant que non chargé. */
  private readonly financeIdByIso = toSignal(
    this.affaireSvc.getPays().pipe(
      map(list => new Map(list.map(p => [(p.isoCode ?? '').trim().toUpperCase(), p.id] as const))),
    ),
    { initialValue: null },
  );

  /** Les ids RH de TOUS les drapeaux cochés ([] = « Tous les pays »). */
  private readonly rhIds = inject(Store).selectSignal(selectSelectedCountryIds);

  /**
   * Multi-pays : les ids FINANCE de tous les drapeaux cochés, triés et séparés par des
   * virgules (`178,63`) — ce qu'attendent les endpoints finance passés en liste. `undefined`
   * = « Tous les pays » (aucun drapeau), et aussi le temps que les deux référentiels arrivent.
   *
   * Texte trié : deux sélections identiques donnent la même valeur, donc un `effect` qui la
   * compare au dernier chargement ne recharge que sur un vrai changement de drapeaux.
   */
  readonly paysList: Signal<string | undefined> = computed(() => {
    const raw = this.rhIds().map(Number).filter(id => Number.isInteger(id) && id > 0);
    if (!raw.length) return undefined;

    const isoById = this.rhIsoById();
    let ids: number[];
    if (isoById === 'failed') {
      ids = raw;                                     // pas de traduction possible : ids bruts
    } else {
      const idByIso = this.financeIdByIso();
      if (!isoById || !idByIso) return undefined;    // référentiels pas encore arrivés
      ids = raw.map(id => {
        const iso = isoById.get(id);
        return (iso ? idByIso.get(iso) : undefined) ?? id;
      });
    }
    return [...new Set(ids)].sort((a, b) => a - b).join(',');
  });

  /** L'id FINANCE du pays du drapeau ; null = « Tous les pays » (ou pas encore résolu). */
  readonly paysId: Signal<number | null> = computed(() => {
    const raw = Number(this.rhId() ?? NaN);
    if (!Number.isInteger(raw) || raw <= 0) return null;

    const isoById = this.rhIsoById();
    if (isoById === 'failed') return raw;          // pas de traduction possible : id brut
    const idByIso = this.financeIdByIso();
    if (!isoById || !idByIso) return null;         // référentiels pas encore arrivés

    const iso = isoById.get(raw);
    const financeId = iso ? idByIso.get(iso) : undefined;
    return financeId ?? raw;
  });
}
