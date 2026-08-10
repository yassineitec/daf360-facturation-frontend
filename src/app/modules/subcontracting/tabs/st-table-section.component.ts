import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { SousTraitantDto } from '../subcontracting.model';
import { TableActionComponent } from '../../../shared/table-action.component';
import { initials } from '../subcontracting-display';

/**
 * List view of the Sous-traitants tab on the house table style (UI-PLAYBOOK §6b): no
 * wrapper and no outer card, `showHeader: false`, `emptyMessage`, icon-only row actions.
 *
 * Stateless: list in, `(edit)` / `(deactivate)` out.
 */
@Component({
  selector: 'app-st-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()">

      <!-- Conditional per row (deactivate only on an active one) and permission-gated,
           so it cannot be config.actions: TableAction has no row predicate (§6b rule 4). -->
      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (canManage()) {
            <fact-table-action id="edit" [tooltip]="tips().edit" (action)="edit.emit(row['_raw'])" />
            @if (row['_raw'].isActive) {
              <fact-table-action id="delete" variant="danger" [tooltip]="tips().deactivate"
                                 (action)="deactivate.emit(row['_raw'])" />
            }
          }
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class StTableSectionComponent {
  private readonly translate = inject(TranslateService);

  list         = input.required<SousTraitantDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  canManage    = input(false);

  readonly edit       = output<SousTraitantDto>();
  readonly deactivate = output<SousTraitantDto>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    return {
      edit:       this.translate.instant('SUBCONTRACTING.ST.EDIT'),
      deactivate: this.translate.instant('SUBCONTRACTING.ST.DEACTIVATE'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'name',    label: t('SUBCONTRACTING.ST.TABLE.NAME'),    type: 'avatar' },
      { key: 'email',   label: t('SUBCONTRACTING.ST.TABLE.EMAIL'),   type: 'text'   },
      { key: 'phone',   label: t('SUBCONTRACTING.ST.TABLE.PHONE'),   type: 'text'   },
      { key: 'taxId',   label: t('SUBCONTRACTING.ST.TABLE.TAX_ID'),  type: 'text'   },
      { key: 'status',  label: t('SUBCONTRACTING.ST.TABLE.STATUS'),  type: 'badge'  },
      { key: '_actions', label: '', align: 'right', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.list().map(st => ({
      id: st.id,
      // Identity column carries the name and its country as the secondary line,
      // rather than splitting them across two columns (§6b rule 6).
      name: {
        name:     st.name,
        initials: initials(st.name),
        subtitle: st.country ?? undefined,
      } satisfies AvatarCell,
      email: st.contactEmail ?? '—',
      phone: st.contactPhone ?? '—',
      taxId: st.taxId ?? '—',
      status: {
        label:   t(st.isActive ? 'SUBCONTRACTING.ST.ACTIVE' : 'SUBCONTRACTING.ST.INACTIVE'),
        options: { variant: st.isActive ? 'success' : 'neutral', dot: true, size: 'sm' },
      } satisfies BadgeCell,
      _raw: st,
    }));
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader:   false,
    // Not hoverable and no rowClick: a subcontractor has no detail page to open.
    hoverable:    false,
    loading:      this.loading(),
    skeletonRows: 6,
    emptyMessage: this.emptyMessage(),
  }));
}
