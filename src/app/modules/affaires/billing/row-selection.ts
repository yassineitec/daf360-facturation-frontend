import { Signal, signal } from '@angular/core';

/** Per-table multi-select state for the approval queue's bulk-validate action: a set of
 * selected row ids.
 *
 * `enforceAffaireLock` (default true) keeps the original behaviour: locked to a single
 * affaire at a time, disabling every other affaire's checkboxes in the same table until the
 * selection empties again. Pass `false` for a tab whose batch-validate backend now supports
 * cross-affaire selections (FORFAIT/RÉGIE/TS) -- isDisabledFor() then always returns false
 * and lockedAffaireId() stays null. LIVRABLE's own tab keeps the default: its batch
 * mechanism is a separate, out-of-scope concern for that feature, so its existing
 * single-affaire selection behaviour is untouched.
 *
 * The server independently re-checks whatever this class allows (never trust the client) --
 * this class exists purely so the user can't even build an invalid selection in the first
 * place, for whichever tabs still need that guard. */
export class RowSelection {
  private readonly _ids = signal<Set<number>>(new Set());
  private readonly _lockedAffaireId = signal<number | null>(null);

  readonly ids: Signal<Set<number>> = this._ids;
  readonly lockedAffaireId: Signal<number | null> = this._lockedAffaireId;

  constructor(private readonly enforceAffaireLock: boolean = true) {}

  toggle(id: number, affaireId: number): void {
    const next = new Set(this._ids());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._ids.set(next);
    if (this.enforceAffaireLock) {
      this._lockedAffaireId.set(next.size > 0 ? affaireId : null);
    }
  }

  isDisabledFor(affaireId: number): boolean {
    if (!this.enforceAffaireLock) return false;
    const locked = this._lockedAffaireId();
    return locked != null && locked !== affaireId;
  }

  clear(): void {
    this._ids.set(new Set());
    this._lockedAffaireId.set(null);
  }
}
