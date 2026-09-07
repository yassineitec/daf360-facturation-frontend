import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, DafCellDirective, DataTableComponent, DrawerComponent, FilterField,
  FilterResult, FormFieldComponent, MetricCardComponent, MetricCardOptions, ModalService,
  PageComponent, PageHeaderComponent, PaginationComponent, SearchToolbarComponent,
  SearchToolbarFilterConfig, SelectComponent, SelectOption, TableColumn, TableConfig,
  ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';

import { AffaireService } from '../../affaires/affaire.service';
import { UserRefDto } from '../../affaires/affaire.model';
import { EmployeeCostService } from './employee-cost.service';
import {
  EmployeeCostDto, EmployeeCostDriverField, deriveEmployeeCostFields,
} from './employee-cost.model';
import { displayName, formatAmount, formatDate } from './employee-cost-display';
import { EmployeeCostTableSectionComponent } from './employee-cost-table-section.component';
import { EmployeeCostCardsSectionComponent } from './employee-cost-cards-section.component';
import { EntityAuditLogDto } from '../../affaires/billing/billing.service';
import { FactListService } from '../../../core/fact-list.service';
import { ListValueDto } from '../cost.model';

type ViewMode = 'list' | 'grid';

@Component({
  selector: 'app-employee-cost',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, DafCellDirective, DataTableComponent, DrawerComponent,
    FormFieldComponent, MetricCardComponent, PageComponent, PageHeaderComponent,
    PaginationComponent, SearchToolbarComponent, SelectComponent, EmployeeCostTableSectionComponent,
    EmployeeCostCardsSectionComponent,
  ],
  templateUrl: './employee-cost.component.html',
})
export class EmployeeCostComponent implements OnInit {
  private readonly svc        = inject(EmployeeCostService);
  private readonly translate  = inject(TranslateService);
  private readonly modals     = inject(ModalService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly listSvc    = inject(FactListService);

  rows          = signal<EmployeeCostDto[]>([]);
  isLoading     = signal(false);
  hasLoadedOnce = signal(false);
  serverError   = signal<string | null>(null);
  actionError   = signal<string | null>(null);

  /** Drives `daf-page`'s full-page skeleton — only ever true before the *first* load
   * resolves. A save/delete triggers `load()` again, and that reload must not blank
   * the page out from under someone who is mid-edit; `daf-data-table` /
   * `daf-entity-card`'s own (much smaller) skeletons cover that case instead, via
   * `isLoading()` passed straight to the active section below. */
  readonly firstLoad = computed(() => this.isLoading() && !this.hasLoadedOnce());

  searchText     = signal('');
  includeExpired = signal(false);
  viewMode       = signal<ViewMode>('list'); // dense reference data (hundreds of rows) — table first, unlike cost-lines' 'grid' default

  page = signal(0);
  size = signal(25);

  showDrawer = signal(false);
  isSaving   = signal(false);
  saveError  = signal<string | null>(null);
  editingId  = signal<number | null>(null);

  auditTrail   = signal<EntityAuditLogDto[]>([]);
  loadingAudit = signal(false);

  currencies = signal<ListValueDto[]>([]);

  /** Same reasoning as wizard-step-info.component.ts's own currencyOptions (show a real
   * backend-driven list when available, degrade to a known-good hardcoded set if the
   * configurable-list call fails or returns empty) — but the fallback labels here are bare
   * currency codes rather than the wizard's translated descriptions ("EUR — Euro"), since
   * a code alone is enough context in this drawer's compact currency field. No
   * `translate.currentLang()` read needed here (unlike the wizard's version): nothing in
   * this fallback list is actually translated. */
  readonly currencyOptions = computed<SelectOption[]>(() => {
    const list = this.currencies();
    if (list.length > 0) {
      return list.map(c => ({ value: c.code, label: `${c.code} — ${c.labelFr}` }));
    }
    return [
      { value: 'EUR', label: 'EUR' },
      { value: 'USD', label: 'USD' },
      { value: 'TND', label: 'TND' },
      { value: 'MAD', label: 'MAD' },
    ];
  });

  /** The drawer's employee picker. A signal of its own, not a `newRecord` field like
   * the rest of the form — `userOptions` below needs to react to it (to keep an
   * edited row's email selectable even when it's missing from `users()`, see the
   * fallback-option comment there), and a `computed()` only tracks real signal reads,
   * never a plain-object property mutated in place. */
  selectedEmail = signal('');

  /** Every user with an email, for the drawer's searchable picker — the same
   * `/ref/users` list the affaire wizard's own collaborator picker uses
   * (wizard-step-tm.component.ts), reused here via AffaireService rather than
   * duplicating a second "list employees" endpoint. */
  users        = signal<UserRefDto[]>([]);
  usersLoading = signal(false);

  readonly currentYear = new Date().getFullYear();

  newRecord = {
    driver: 'basic' as EmployeeCostDriverField,
    basicCost: null as number | null,
    internalSellingCost: null as number | null,
    externalSellingCost: null as number | null,
    currency: 'EUR',
    dateDebut: `${this.currentYear}-01-01`,
    dateFin: `${this.currentYear}-12-31`,
  };

  /** Sorted for a picker someone scans by eye; the value is always the email —
   * that's the one field the backend actually keys a cost record on. */
  readonly userOptions = computed<SelectOption[]>(() => {
    const options = this.users()
      .slice()
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(u => ({ value: u.email, label: `${u.fullName} (${u.email})` }));

    // An edited row's email can be absent from the current /ref/users list (e.g. a
    // deactivated account, or one of the emails imported straight from DAF_ODS that
    // never resolved to a user_ref_id) — without this the picker would show the field
    // as empty even though a value is genuinely selected.
    const current = this.selectedEmail();
    if (current && !options.some(o => o.value === current)) {
      options.unshift({ value: current, label: current });
    }
    return options;
  });

  // ── KPIs — counted over every loaded row, unaffected by the search box below, same
  // reasoning as cost-lines.component.ts's draftCount/pendingCount/approvedCount. ──
  readonly totalCount   = computed(() => this.rows().length);
  readonly activeCount  = computed(() => this.rows().filter(r => r.sourceStatus === 'Current').length);
  readonly expiredCount = computed(() => this.rows().filter(r => r.sourceStatus === 'Expired').length);

  /** Proven token pairs already in use elsewhere in this app (client-list's kpiTotal,
   * cost-lines' kpiApproved, sous-traitants-tab's kpiInactive) — reused rather than
   * invented, so nothing here risks a Tailwind class the app has never generated. */
  readonly kpiTotal   : MetricCardOptions = { icon: 'group',        iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiActive  : MetricCardOptions = { icon: 'check_circle', iconColor: 'text-teal',    iconBg: 'bg-teal/10' };
  readonly kpiExpired : MetricCardOptions = { icon: 'history',      iconColor: 'text-outline', iconBg: 'bg-surface-container' };

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('COST.EMPLOYEE_COST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('COST.EMPLOYEE_COST.VIEW_LIST') },
    ];
  });

  /** The active/expired switch lives *inside* the filter panel rather than as a loose
   * checkbox beside the search box — same call as cost-lines putting status there
   * (§1): one control, one place a person learns to look for every list filter. */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [{
      name: 'includeExpired',
      label: this.translate.instant('COST.EMPLOYEE_COST.INCLUDE_EXPIRED'),
      type: 'checkbox',
    }];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('COST.EMPLOYEE_COST.FILTER_TITLE'),
      applyLabel:   t('COST.EMPLOYEE_COST.FILTER_APPLY'),
      cancelLabel:  t('COST.EMPLOYEE_COST.FILTER_CANCEL'),
      resetLabel:   t('COST.EMPLOYEE_COST.FILTER_RESET'),
      triggerLabel: t('COST.EMPLOYEE_COST.FILTERS'),
      initialValues: { includeExpired: this.includeExpired() },
    };
  });

  /** Search + the active/expired switch, both client-side over the full loaded set —
   * `list()` has no server-side query params to push either into (unlike cost-lines,
   * whose status filter re-fetches). */
  readonly filteredRows = computed<EmployeeCostDto[]>(() => {
    const q = this.searchText().toLowerCase().trim();
    return this.rows()
      .filter(r => this.includeExpired() || r.sourceStatus === 'Current')
      .filter(r => !q || displayName(r).toLowerCase().includes(q) || r.employeeEmail.toLowerCase().includes(q));
  });

  readonly totalPagesCount = computed(() => Math.ceil(this.filteredRows().length / this.size()) || 1);

  readonly pagedRows = computed<EmployeeCostDto[]>(() => {
    const start = this.page() * this.size();
    return this.filteredRows().slice(start, start + this.size());
  });

  /** Mirrors approval-detail.component.ts's own `auditColumns` — same `EntityAuditLogDto`
   * shape, same `<daf-data-table>` pattern — but under this feature's own i18n namespace
   * rather than the billing module's `AFFAIRES.billing.approval.*` keys. */
  readonly auditColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'timestampUtc', label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_DATE'),    type: 'custom' },
      { key: 'action',       label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_ACTION'),  type: 'text' },
      { key: 'transition',   label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_STATUS'),  type: 'custom' },
      { key: 'actorRole',    label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_USER'),    type: 'text' },
      { key: 'details',      label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_DETAILS'), type: 'custom' },
    ];
  });

  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: false }));

  ngOnInit(): void {
    this.load();
    this.usersLoading.set(true);
    this.affaireSvc.getUsers().subscribe({
      next:  u  => { this.users.set(u); this.usersLoading.set(false); },
      error: () => this.usersLoading.set(false),
    });
    this.listSvc.getListValues('CURRENCY', 0).subscribe({
      next: c => this.currencies.set(c),
      error: () => this.currencies.set([]),
    });
  }

  private load(): void {
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.list().subscribe({
      next: list => {
        this.rows.set(list);
        this.isLoading.set(false);
        this.hasLoadedOnce.set(true);
        // A delete can empty out the page someone was looking at (e.g. the last row on
        // the last page) — land back on the new last page instead of a page that no
        // longer has any rows in it.
        if (this.page() >= this.totalPagesCount()) {
          this.page.set(Math.max(0, this.totalPagesCount() - 1));
        }
      },
      error: err => {
        this.serverError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.LOAD_ERROR'));
        this.isLoading.set(false);
        this.hasLoadedOnce.set(true);
      },
    });
  }

  onSearch(value: string): void {
    this.searchText.set(value);
    this.page.set(0);
  }

  applyFilters(result: FilterResult): void {
    this.includeExpired.set(!!result['includeExpired']);
    this.page.set(0);
  }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPagesCount()) return;
    this.page.set(p);
  }

  /** `pageSizeChange` fires alone — the page decides to go back to the first page,
   * same convention as cost-lines.component.ts (§7). */
  onPageSize(size: number): void {
    this.size.set(size);
    this.page.set(0);
  }

  openAdd(): void {
    this.editingId.set(null);
    this.saveError.set(null);
    this.selectedEmail.set('');
    this.resetNewRecord();
    this.auditTrail.set([]);
    this.showDrawer.set(true);
  }

  closeDrawer(): void {
    this.showDrawer.set(false);
  }

  onEmployeeSelect(values: string[]): void {
    this.selectedEmail.set(values[0] ?? '');
  }

  onCurrencyChange(values: string[]): void {
    this.newRecord.currency = values[0] ?? 'EUR';
  }

  /** Whichever field the person types into becomes the driver; the other two
   * immediately recompute — impossible to save numbers that don't satisfy the
   * fixed 1.1 / 1.2 markup formula. */
  onFieldInput(driver: EmployeeCostDriverField, value: number | null): void {
    this.newRecord.driver = driver;
    if (value === null || value === undefined) {
      this.newRecord.basicCost = null;
      this.newRecord.internalSellingCost = null;
      this.newRecord.externalSellingCost = null;
      return;
    }
    const derived = deriveEmployeeCostFields(driver, value);
    this.newRecord.basicCost = derived.basicCost;
    this.newRecord.internalSellingCost = derived.internalSellingCost;
    this.newRecord.externalSellingCost = derived.externalSellingCost;
  }

  save(): void {
    if (!this.selectedEmail() || this.newRecord.basicCost === null) {
      this.saveError.set(this.translate.instant('COST.EMPLOYEE_COST.FIELDS_REQUIRED'));
      return;
    }
    this.isSaving.set(true);
    this.saveError.set(null);

    const req = {
      basicCost: this.newRecord.basicCost,
      currency: this.newRecord.currency,
      dateDebut: this.newRecord.dateDebut,
      dateFin: this.newRecord.dateFin,
    };

    const request$ = this.editingId() !== null
      ? this.svc.update(this.editingId()!, req)
      : this.svc.create({ employeeEmail: this.selectedEmail(), ...req });

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showDrawer.set(false);
        this.editingId.set(null);
        this.resetNewRecord();
        this.load();
      },
      error: err => {
        this.saveError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.SAVE_ERROR'));
        this.isSaving.set(false);
      },
    });
  }

  edit(row: EmployeeCostDto): void {
    this.editingId.set(row.id);
    this.saveError.set(null); // don't carry a stale error banner over from a prior Add attempt
    this.selectedEmail.set(row.employeeEmail);
    this.newRecord = {
      driver: 'basic',
      basicCost: row.basicCost,
      internalSellingCost: row.internalSellingCost,
      externalSellingCost: row.externalSellingCost,
      currency: row.currency,
      dateDebut: row.dateDebut,
      dateFin: row.dateFin,
    };
    this.auditTrail.set([]);
    this.loadingAudit.set(true);
    this.svc.getAuditLog(row.id).subscribe({
      next: entries => {
        if (this.editingId() === row.id) { this.auditTrail.set(entries); }
        this.loadingAudit.set(false);
      },
      error: () => {
        if (this.editingId() === row.id) { this.auditTrail.set([]); }
        this.loadingAudit.set(false);
      },
    });
    this.showDrawer.set(true);
  }

  /** A destructive action gets a confirmation, unlike the plain-HTML version this
   * screen used to render straight to a `<button (click)="remove(row)">` — the
   * library's own documented use for `ModalService` is exactly this dialog. */
  remove(row: EmployeeCostDto): void {
    const name = displayName(row);
    this.modals.open({
      title: this.translate.instant('COST.EMPLOYEE_COST.DELETE_CONFIRM_TITLE'),
      icon:  'delete',
      body:  this.translate.instant('COST.EMPLOYEE_COST.DELETE_CONFIRM_BODY', { name }),
      buttons: [
        { label: this.translate.instant('COST.EMPLOYEE_COST.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('COST.EMPLOYEE_COST.DELETE'),
          variant: 'primary',
          action: r => {
            this.actionError.set(null);
            this.svc.delete(row.id).subscribe({
              next:  () => { r.close(); this.load(); },
              error: err => {
                r.close();
                this.actionError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.DELETE_ERROR'));
              },
            });
          },
        },
      ],
    });
  }

  private resetNewRecord(): void {
    this.newRecord = {
      driver: 'basic',
      basicCost: null,
      internalSellingCost: null,
      externalSellingCost: null,
      currency: 'EUR',
      dateDebut: `${this.currentYear}-01-01`,
      dateFin: `${this.currentYear}-12-31`,
    };
  }

  fmtDateTime(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  /** Which of the raw snapshot's fields to show, in this order, and how to label/format
   * each one — reuses the SAME formatters the rest of this screen already uses
   * (`formatAmount`/`formatDate` from `employee-cost-display.ts`) so a changed cost or
   * date reads the same way here as it does in the main table. `userRefId` is
   * deliberately excluded: it's an internal id with no meaning to whoever is reading
   * this history, and `employeeEmail` already identifies the person. */
  private static readonly AUDIT_FIELDS: {
    key: string; labelKey: string; format: (v: unknown) => string;
  }[] = [
    { key: 'employeeEmail', labelKey: 'COST.EMPLOYEE_COST.EMPLOYEE_EMAIL', format: v => String(v) },
    { key: 'basicCost', labelKey: 'COST.EMPLOYEE_COST.BASIC_COST', format: v => formatAmount(Number(v)) },
    { key: 'internalSellingCost', labelKey: 'COST.EMPLOYEE_COST.INTERNAL_SELLING_COST', format: v => formatAmount(Number(v)) },
    { key: 'externalSellingCost', labelKey: 'COST.EMPLOYEE_COST.EXTERNAL_SELLING_COST', format: v => formatAmount(Number(v)) },
    { key: 'currency', labelKey: 'COST.EMPLOYEE_COST.CURRENCY', format: v => String(v) },
    { key: 'dateDebut', labelKey: 'COST.EMPLOYEE_COST.DATE_DEBUT', format: v => formatDate(String(v)) },
    { key: 'dateFin', labelKey: 'COST.EMPLOYEE_COST.DATE_FIN', format: v => formatDate(String(v)) },
    { key: 'sourceStatus', labelKey: 'COST.EMPLOYEE_COST.HISTORY_COL_STATUS', format: v => String(v) },
  ];

  /** Renders the real field-level changes from an audit entry's `metadata` JSON
   * (`{"before":{...},"after":{...}}`) — only the fields that actually differ, so a long
   * unchanged field list doesn't drown out what matters. CREATE/DELETE entries only carry
   * one side, so everything on that side is shown as-is (nothing to diff against).
   * STATUS_NORMALIZED cascade entries carry no metadata at all — '—' for those.
   * Takes the raw `metadata` string rather than the whole row — `daf-data-table`'s
   * `dafCell` template context types `row` as `TableRow` (`Record<string, any>`), not
   * `EntityAuditLogDto`, same reason `fmtDateTime` above takes a single field instead of
   * the whole row via `row['timestampUtc']`. */
  formatAuditDetails(metadata: string | null | undefined): string {
    if (!metadata) return '—';
    try {
      const parsed = JSON.parse(metadata) as { before?: Record<string, unknown>; after?: Record<string, unknown> };
      const { before, after } = parsed;
      const label = (labelKey: string) => this.translate.instant(labelKey);

      if (before && after) {
        const changes = EmployeeCostComponent.AUDIT_FIELDS
          .filter(f => JSON.stringify(before[f.key]) !== JSON.stringify(after[f.key]))
          .map(f => `${label(f.labelKey)}: ${f.format(before[f.key])} → ${f.format(after[f.key])}`);
        return changes.length ? changes.join(', ') : '—';
      }

      const only = after ?? before;
      if (!only) return '—';
      return EmployeeCostComponent.AUDIT_FIELDS
        .filter(f => only[f.key] !== undefined)
        .map(f => `${label(f.labelKey)}: ${f.format(only[f.key])}`)
        .join(', ');
    } catch {
      return '—';
    }
  }
}
