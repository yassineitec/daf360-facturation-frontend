import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * One icon action inside a `daf-data-table` row — **visually identical to the lib's
 * own `config.actions` buttons** (UI-PLAYBOOK §6b).
 *
 * Why this exists: `TableAction` has no per-row predicate, so a table whose actions
 * depend on the row (approve only on a SUBMITTED invoice, record a payment only once
 * it is emitted) cannot use `config.actions`. Without this, such a table falls back to
 * a projected cell full of labelled `daf-button`s — the single biggest source of drift
 * between tables.
 *
 * This is the facturation twin of rh-frontend's `rh-table-action`; the playbook calls
 * for one copy per app until the lib ships a row predicate. The classes are copied
 * from `DataTableComponent.actionBtnClasses()` / `resolveIconFill()` — keep them in
 * sync, or better: when the lib adds `hidden?: (row) => boolean` to `TableAction`,
 * move every projected `_actions` column onto `config.actions` and delete both copies.
 *
 * ```html
 * <ng-template dafCell="_actions" let-row>
 *   <div class="flex items-center justify-end gap-2">
 *     @if (row['_raw'].statut === 'SUBMITTED') {
 *       <fact-table-action icon="fact_check" [tooltip]="'…' | translate" (action)="approve.emit(row)" />
 *     }
 *     <fact-table-action id="view" [tooltip]="'…' | translate" (action)="open.emit(row)" />
 *   </div>
 * </ng-template>
 * ```
 */
@Component({
  selector: 'fact-table-action',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [title]="tooltip()" [disabled]="disabled() || loading()" [class]="classes()">
      <span class="material-symbols-outlined"
            style="font-size:20px"
            [class.animate-spin]="loading()"
            [style.font-variation-settings]="iconFill()">{{ loading() ? 'progress_activity' : resolvedIcon() }}</span>
    </button>
  `,
  host: {
    // The cell of a non-`clickable` column lets the click bubble straight to the row
    // and fire `rowClick` — the lib's own actions cell stops it, so we must too.
    '(click)': 'onClick($event)',
  },
})
export class TableActionComponent {
  /** Action id — resolves the default icon, exactly like `TableAction.id` does. */
  readonly id       = input<string>('');
  readonly icon     = input<string>('');
  readonly tooltip  = input<string>('');
  readonly variant  = input<'default' | 'danger'>('default');
  readonly disabled = input(false);
  readonly loading  = input(false);

  readonly action = output<Event>();

  /** Same default map as the lib's `resolveActionIcon`. */
  private static readonly DEFAULT_ICONS: Record<string, string> = {
    view: 'visibility', consult: 'visibility', show: 'visibility',
    edit: 'stylus',     update: 'stylus',      modify: 'stylus',
    delete: 'delete',   remove: 'delete',
  };

  /** Outline (unfilled) for the view-type icons, filled for everything else. */
  private static readonly OUTLINE_IDS = new Set(['view', 'consult', 'show']);

  protected readonly resolvedIcon = computed(() =>
    this.icon() || TableActionComponent.DEFAULT_ICONS[this.id()] || 'more_horiz',
  );

  protected readonly iconFill = computed(() => {
    const fill = TableActionComponent.OUTLINE_IDS.has(this.id()) ? 0 : 1;
    return `'FILL' ${fill}, 'wght' ${fill ? 400 : 300}, 'GRAD' 0, 'opsz' 24`;
  });

  protected readonly classes = computed(() => {
    const base = 'flex items-center justify-center p-1 rounded-md transition-all duration-150'
               + ' disabled:opacity-40 disabled:pointer-events-none';
    return this.variant() === 'danger'
      ? `${base} text-danger hover:bg-error-container/40 hover:text-danger active:scale-95`
      : `${base} text-on-surface-variant hover:opacity-70`;
  });

  protected onClick(event: Event): void {
    event.stopPropagation();
    if (this.disabled() || this.loading()) return;
    this.action.emit(event);
  }
}
