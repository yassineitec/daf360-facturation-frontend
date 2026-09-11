import { Component, OnInit, TemplateRef, inject, signal, computed, viewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';
import {
  ButtonComponent, CardComponent, DafCellDirective, DataTableComponent, FilterField,
  FilterResult, FormFieldComponent, MetricCardComponent, MetricCardOptions, ModalRef, ModalService,
  MultiDatePickerComponent, MultiDatePickerConfig, PageComponent, PageHeaderComponent,
  PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig, SelectComponent,
  SelectOption, SortDirection, TableColumn, TableConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';

import { AffaireService } from '../../affaires/affaire.service';
import { UserRefDto } from '../../affaires/affaire.model';
import { EmployeeCostService } from './employee-cost.service';
import {
  EmployeeCostDto, EmployeeCostDriverField, deriveEmployeeCostFields,
} from './employee-cost.model';
import { displayName, formatAmount, formatDate, statusKey } from './employee-cost-display';
import { EmployeeCostTableSectionComponent } from './employee-cost-table-section.component';
import { EmployeeCostCardsSectionComponent } from './employee-cost-cards-section.component';
import { EntityAuditLogDto } from '../../affaires/billing/billing.service';
import { FactListService } from '../../../core/fact-list.service';
import { ListValueDto } from '../cost.model';
import { CurrencyRateService } from '../../../core/currency-rate.service';
import { CurrencyDisplayService } from '../../../core/currency-display.service';
import { centered } from '../../../shared/table-align';

type ViewMode = 'list' | 'grid';

@Component({
  selector: 'app-employee-cost',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, CardComponent, DafCellDirective, DataTableComponent,
    FormFieldComponent, MetricCardComponent, MultiDatePickerComponent, PageComponent, PageHeaderComponent,
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
  private readonly ratesSvc   = inject(CurrencyRateService);
  private readonly displaySvc = inject(CurrencyDisplayService);

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

  searchText   = signal('');
  statusFilter = signal<'all' | 'current' | 'expired'>('all');
  costMin      = signal<number | null>(null);
  costMax      = signal<number | null>(null);
  viewMode     = signal<ViewMode>('grid');

  page = signal(0);
  size = signal(25);

  /** Owned here, not inside the table section, so a sort reorders the FULL filtered
   * set before pagination slices it — sorting only the current page's 25 rows would
   * be wrong (see employee-cost-table-section.component.ts's class doc comment). */
  sortKey = signal<string | null>(null);
  sortDir = signal<SortDirection>(null);

  isSaving   = signal(false);
  saveError  = signal<string | null>(null);
  editingId  = signal<number | null>(null);

  private readonly formTpl = viewChild.required<TemplateRef<unknown>>('formTpl');
  private modalRef?: ModalRef;

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

  /** `daf-multi-date-picker` travaille en `Date` ; le formulaire stocke l'ISO (yyyy-MM-dd)
   * qu'attend l'API, même pattern que expense-form.component.ts / wizard-step-planning
   * .component.ts — un champ `type: 'date'` retombait sur le calendrier natif du
   * navigateur, hors charte. */
  private toDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  private toIso(v: Date | Date[] | null): string {
    const d = Array.isArray(v) ? v[0] : v;
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get dateDebutValue(): Date | Date[] | null { return this.toDate(this.newRecord.dateDebut); }
  set dateDebutValue(v: Date | Date[] | null) { this.newRecord.dateDebut = this.toIso(v); }

  get dateFinValue(): Date | Date[] | null { return this.toDate(this.newRecord.dateFin); }
  set dateFinValue(v: Date | Date[] | null) { this.newRecord.dateFin = this.toIso(v); }

  readonly dateDebutConfig = computed<MultiDatePickerConfig>(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('COST.EMPLOYEE_COST.DATE_DEBUT'),
      selectionMode: 'single',
      required: true,
      allowPastDays: true,
      allowWeekends: true,
      fullWidth: true,
    };
  });

  readonly dateFinConfig = computed<MultiDatePickerConfig>(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('COST.EMPLOYEE_COST.DATE_FIN'),
      selectionMode: 'single',
      required: true,
      allowPastDays: true,
      allowWeekends: true,
      fullWidth: true,
    };
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

  /** TEST : 1re carte — mêmes 2 sous-affichages empilés à droite que les cartes 3/4
   * (ligne verticale, `border-l-2`) : part des collaborateurs actifs / expirés dans
   * le total suivi à gauche. */
  readonly activePercent = computed(() => {
    const total = this.totalCount();
    return total === 0 ? '—' : `${((this.activeCount() / total) * 100).toFixed(1)}%`;
  });

  readonly expiredPercent = computed(() => {
    const total = this.totalCount();
    return total === 0 ? '—' : `${((this.expiredCount() / total) * 100).toFixed(1)}%`;
  });

  private avgOf(selector: (r: EmployeeCostDto) => number): number | null {
    const target = this.displaySvc.selectedCurrency();
    const rows = this.rows().filter(r => r.basicCost > 0);
    if (rows.length === 0) return null;
    return rows.reduce((sum, r) => sum + this.ratesSvc.convert(selector(r), r.currency, target), 0) / rows.length;
  }

  /** CORRIGÉ : "interne" = `basicCost` (la base la plus basse), pas
   * `internalSellingCost` — sinon les marges de la carte 4 (interne vs interco/
   * externe) ressortent négatives, ce qui n'a aucun sens pour "mesurer la
   * rentabilité". `internalSellingCost`/`externalSellingCost` sont les deux prix de
   * vente (×1,1 et ×1,2), tous deux calculés AU-DESSUS de ce coût de base. */
  readonly avgInternalCost = computed(() => {
    const target = this.displaySvc.selectedCurrency();
    const avg = this.avgOf(r => r.basicCost);
    return avg === null ? '—' : formatAmount(avg, target);
  });

  /** TEST : 3e carte — fusionne "Coût de vente interco moyen" et "Coût de vente
   * externe moyen" en UNE carte à deux valeurs, avec le taux entre les deux.
   * "interco" = `internalSellingCost` (×1,1) — le champ que le code appelle déjà
   * "internal", "interco" en étant juste le nom métier. */
  readonly avgIntercoCost = computed(() => {
    const target = this.displaySvc.selectedCurrency();
    const avg = this.avgOf(r => r.internalSellingCost);
    return avg === null ? '—' : formatAmount(avg, target);
  });

  readonly avgExternalCost = computed(() => {
    const target = this.displaySvc.selectedCurrency();
    const avg = this.avgOf(r => r.externalSellingCost);
    return avg === null ? '—' : formatAmount(avg, target);
  });

  /** Taux = (externe − interco) / interco × 100. Constante mathématique (~9,1 %,
   * puisque externe = 1,2×base et interco = 1,1×base) — contrôle d'intégrité,
   * comme `avgMargin` plus bas, pas un indicateur qui varie vraiment. */
  readonly externalVsIntercoRate = computed(() => {
    const interco = this.avgOf(r => r.internalSellingCost);
    const externe = this.avgOf(r => r.externalSellingCost);
    if (interco === null || externe === null || interco === 0) return '—';
    return `${(((externe - interco) / interco) * 100).toFixed(1)}%`;
  });

  /** TEST : 4e carte — les 2 marges de rentabilité de la maquette, même disposition
   * que la carte 3 (une 3e valeur combinée à gauche, les 2 marges empilées à
   * droite). "Interne" = basicCost, cohérent avec avgInternalCost/avgIntercoCost
   * ci-dessus — sinon ces marges ressortent négatives (voir la note plus haut). */
  readonly marginInterneInterco = computed(() => {
    const interne = this.avgOf(r => r.basicCost);
    const interco = this.avgOf(r => r.internalSellingCost);
    if (interne === null || interco === null || interco === 0) return '—';
    return `${(((interco - interne) / interco) * 100).toFixed(1)}%`;
  });

  readonly marginInterneExterne = computed(() => {
    const interne = this.avgOf(r => r.basicCost);
    const externe = this.avgOf(r => r.externalSellingCost);
    if (interne === null || externe === null || externe === 0) return '—';
    return `${(((externe - interne) / externe) * 100).toFixed(1)}%`;
  });

  /** Proven token pairs already in use elsewhere in this app (client-list's kpiTotal,
   * cost-lines' kpiApproved, sous-traitants-tab's kpiInactive) — reused rather than
   * invented, so nothing here risks a Tailwind class the app has never generated. */
  readonly kpiExpired   : MetricCardOptions = { icon: 'history',      iconColor: 'text-outline', iconBg: 'bg-surface-container' };

  readonly kpiAvgInternal = computed<MetricCardOptions>(() => {
    this.translate.currentLang();
    return {
      icon: 'payments', iconColor: 'text-warning', iconBg: 'bg-warning/10',
      helpTitle: this.translate.instant('COST.EMPLOYEE_COST.KPI_AVG_INTERNAL'),
      help:      this.translate.instant('COST.EMPLOYEE_COST.KPI_AVG_INTERNAL_HELP'),
    };
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('COST.EMPLOYEE_COST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('COST.EMPLOYEE_COST.VIEW_LIST') },
    ];
  });

  /** Status (3-way, not a binary "include expired" checkbox — "expired only" has no
   * way to ask for it otherwise) and a basic-cost range live *inside* the filter
   * panel rather than loose controls beside the search box — same call as cost-lines
   * putting status there (§1): one control, one place a person learns to look for
   * every list filter. */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        name: 'status',
        label: t('COST.EMPLOYEE_COST.FILTER_STATUS_LABEL'),
        type: 'select',
        options: [
          { value: 'all',      label: t('COST.EMPLOYEE_COST.FILTER_STATUS_ALL') },
          { value: 'current',  label: t('COST.EMPLOYEE_COST.FILTER_STATUS_CURRENT') },
          { value: 'expired',  label: t('COST.EMPLOYEE_COST.FILTER_STATUS_EXPIRED') },
        ],
      },
      {
        name: 'costMin',
        label: t('COST.EMPLOYEE_COST.FILTER_COST_MIN_LABEL'),
        type: 'text',
        placeholder: t('COST.EMPLOYEE_COST.FILTER_COST_MIN_PLACEHOLDER'),
      },
      {
        name: 'costMax',
        label: t('COST.EMPLOYEE_COST.FILTER_COST_MAX_LABEL'),
        type: 'text',
        placeholder: t('COST.EMPLOYEE_COST.FILTER_COST_MAX_PLACEHOLDER'),
      },
    ];
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
      initialValues: {
        status:  this.statusFilter(),
        costMin: this.costMin() != null ? String(this.costMin()) : '',
        costMax: this.costMax() != null ? String(this.costMax()) : '',
      },
    };
  });

  /** Search + status + cost range, all client-side over the full loaded set —
   * `list()` has no server-side query params to push either into (unlike cost-lines,
   * whose status filter re-fetches). Basic cost is compared in its own original
   * currency (not display-converted) — min/max are numbers someone typed with a
   * currency in mind, converting the row instead of the bound would silently move it
   * across the threshold every time the radial menu changes. */
  readonly filteredRows = computed<EmployeeCostDto[]>(() => {
    const q      = this.searchText().toLowerCase().trim();
    const status = this.statusFilter();
    const min    = this.costMin();
    const max    = this.costMax();
    return this.rows()
      .filter(r => status === 'all' || (status === 'current' ? r.sourceStatus === 'Current' : r.sourceStatus === 'Expired'))
      .filter(r => min == null || r.basicCost >= min)
      .filter(r => max == null || r.basicCost <= max)
      .filter(r => !q || displayName(r).toLowerCase().includes(q) || r.employeeEmail.toLowerCase().includes(q));
  });

  /** Raw-value comparator per sort key — plain fields sort correctly as strings
   * (ISO dates), numbers need a numeric comparison rather than `basicCost.toString()`
   * lexical order (which would put 100 before 20). */
  private static readonly SORT_ACCESSORS: Record<string, (r: EmployeeCostDto) => string | number> = {
    employee: r => displayName(r).toLowerCase(),
    basic:    r => r.basicCost,
    internal: r => r.internalSellingCost,
    external: r => r.externalSellingCost,
    period:   r => r.dateDebut,
    status:   r => r.sourceStatus ?? '',
  };

  readonly sortedRows = computed<EmployeeCostDto[]>(() => {
    const key = this.sortKey();
    const dir = this.sortDir();
    const accessor = key ? EmployeeCostComponent.SORT_ACCESSORS[key] : null;
    if (!accessor || !dir) return this.filteredRows();
    return [...this.filteredRows()].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  readonly totalPagesCount = computed(() => Math.ceil(this.sortedRows().length / this.size()) || 1);

  readonly pagedRows = computed<EmployeeCostDto[]>(() => {
    const start = this.page() * this.size();
    return this.sortedRows().slice(start, start + this.size());
  });

  onSort(event: { key: string; dir: SortDirection }): void {
    this.sortKey.set(event.dir ? event.key : null);
    this.sortDir.set(event.dir);
    this.page.set(0);
  }

  /** Mirrors approval-detail.component.ts's own `auditColumns` — same `EntityAuditLogDto`
   * shape, same `<daf-data-table>` pattern — but under this feature's own i18n namespace
   * rather than the billing module's `AFFAIRES.billing.approval.*` keys. */
  readonly auditColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return centered([
      { key: 'timestampUtc', label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_DATE'),    type: 'custom' },
      { key: 'action',       label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_ACTION'),  type: 'text' },
      { key: 'transition',   label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_STATUS'),  type: 'custom' },
      { key: 'actorRole',    label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_USER'),    type: 'text' },
      { key: 'details',      label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_DETAILS'), type: 'custom' },
    ]);
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
    const status = result['status'];
    this.statusFilter.set(status === 'current' || status === 'expired' ? status : 'all');

    const min = Number(result['costMin']);
    const max = Number(result['costMax']);
    this.costMin.set(result['costMin'] && !isNaN(min) ? min : null);
    this.costMax.set(result['costMax'] && !isNaN(max) ? max : null);

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
    this.openModal(this.translate.instant('COST.EMPLOYEE_COST.ADD_TITLE'));
  }

  /** Popup, not a side drawer — the form + audit history live in one `<ng-template>`
   * body (buttons included), since `ModalConfig.buttons` is a non-reactive snapshot
   * and this form needs `isSaving()` to keep driving the Save button's spinner. */
  private openModal(title: string): void {
    this.modalRef = this.modals.open({
      title,
      icon: 'badge',
      body: this.formTpl(),
      size: 'lg',
      closeOnBackdrop: false,
    });
  }

  closeDrawer(): void {
    this.modalRef?.close();
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
        this.modalRef?.close();
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
    this.openModal(this.translate.instant('COST.EMPLOYEE_COST.EDIT_TITLE'));
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

  /** One row per cost record currently visible (search + include-expired filter applied,
   * pagination ignored — an export is a full extract, not just the current page), same
   * `xlsx` pattern as affaire-wip-tab.component.ts's exportWipExcel(): plain row objects
   * keyed by translated column headers, one sheet, no shared wrapper exists in this app
   * to route through instead. */
  exportExcel(): void {
    const rows = this.filteredRows();
    if (!rows.length) return;

    const t = (k: string) => this.translate.instant(k);
    const sheetRows = rows.map(r => ({
      [t('COST.EMPLOYEE_COST.COL_EMPLOYEE')]:          displayName(r),
      [t('COST.EMPLOYEE_COST.EMPLOYEE_EMAIL')]:        r.employeeEmail,
      [t('COST.EMPLOYEE_COST.COL_BASIC')]:             r.basicCost,
      [t('COST.EMPLOYEE_COST.COL_INTERNAL')]:          r.internalSellingCost,
      [t('COST.EMPLOYEE_COST.COL_EXTERNAL')]:          r.externalSellingCost,
      [t('COST.EMPLOYEE_COST.CURRENCY')]:              r.currency,
      [t('COST.EMPLOYEE_COST.DATE_DEBUT')]:             formatDate(r.dateDebut),
      [t('COST.EMPLOYEE_COST.DATE_FIN')]:               formatDate(r.dateFin),
      [t('COST.EMPLOYEE_COST.COL_STATUS')]:            r.sourceStatus ? t(statusKey(r.sourceStatus)) : '—',
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), t('COST.EMPLOYEE_COST.EXPORT_SHEET'));
    XLSX.writeFile(wb, `Couts_Collaborateurs_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
