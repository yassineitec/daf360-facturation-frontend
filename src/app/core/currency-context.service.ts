import { Injectable, inject, signal } from '@angular/core';
import { UserStore } from './user.store';
import { AffaireService } from '../modules/affaires/affaire.service';

/**
 * The logged-in user's own country's default currency (`pays_ref.devise` -- the ARX
 * accounting currency, e.g. Tunisia=EUR, Egypt=USD -- never the country's national one).
 * Loaded once after login (`init()`, called from `authGuard`) so formatting helpers across
 * the app can default to it instead of a hardcoded literal.
 *
 * `null` for an admin (sees every country, so no single default makes sense) and before
 * `init()` has resolved -- callers should always prefer a record's OWN currency field first
 * and treat this service as the SECOND fallback, with a literal as the final, rarely-hit
 * resort (2026-11 currency-audit follow-up: "admin uses the record's own currency").
 */
@Injectable({ providedIn: 'root' })
export class CurrencyContextService {
  private readonly userStore = inject(UserStore);
  private readonly affaireSvc = inject(AffaireService);

  private readonly _defaultCurrency = signal<string | null>(null);
  readonly defaultCurrency = this._defaultCurrency.asReadonly();

  private loaded = false;

  /** Idempotent -- safe to call from every guard/bootstrap path that might run first. */
  init(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (this.userStore.isAdmin()) {
      this._defaultCurrency.set(null);
      return;
    }
    const paysId = this.userStore.user()?.paysId;
    if (!paysId) return;

    this.affaireSvc.getPays().subscribe(list => {
      const pays = list.find(p => p.id === paysId);
      this._defaultCurrency.set(pays?.devise ?? null);
    });
  }
}
