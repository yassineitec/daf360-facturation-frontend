import { Signal, signal } from '@angular/core';

/** Per-table multi-select state for the approval queue's bulk-validate action: a set of
 * selected row ids, locked to a single affaire at a time. Checking a row for an affaire
 * disables every other affaire's checkboxes in the same table until the selection empties
 * again — the server independently re-checks this (never trust the client), this is purely
 * so the user can't even build an invalid selection in the first place. */
export class RowSelection {
  private readonly _ids = signal<Set<number>>(new Set());
  private readonly _lockedAffaireId = signal<number | null>(null);

  readonly ids: Signal<Set<number>> = this._ids;
  readonly lockedAffaireId: Signal<number | null> = this._lockedAffaireId;

  toggle(id: number, affaireId: number): void {
    const next = new Set(this._ids());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._ids.set(next);
    this._lockedAffaireId.set(next.size > 0 ? affaireId : null);
  }

  isDisabledFor(affaireId: number): boolean {
    const locked = this._lockedAffaireId();
    return locked != null && locked !== affaireId;
  }

  clear(): void {
    this._ids.set(new Set());
    this._lockedAffaireId.set(null);
  }
}
