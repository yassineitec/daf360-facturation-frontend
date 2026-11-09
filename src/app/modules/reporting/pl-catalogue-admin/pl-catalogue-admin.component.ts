import { Component, DestroyRef, OnInit, Pipe, PipeTransform, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  ButtonComponent, CheckboxComponent, DafCellDirective, DataTableComponent, FormFieldComponent,
  ModalService, PageComponent, PageHeaderComponent, SelectComponent, SelectOption,
  StatusBadgeComponent, TabItem, TabsComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto } from '../../affaires/affaire.model';
import { UserStore } from '../../../core/user.store';
import { GroupCatalogueLineService } from '../group-catalogue-line.service';
import { GroupCatalogueLineDto, PlPeriodDto } from '../pl-reporting.model';
import { PlPeriodService } from '../pl-period.service';
import { PlCatalogueAdminService } from '../pl-catalogue-admin.service';
import { PlFxRateAdminService } from '../pl-fx-rate-admin.service';
import { PlBudgetRowAdminService } from '../pl-budget-row-admin.service';
import {
  PlBudgetRowDto, PlBudgetRowMappingDto, PlBudgetRowMappingEntryDto, PlBudgetRowTransform,
} from '../pl-budget-row.model';
import {
  PL_CATALOGUE_SOURCE_TYPES, PlCataloguePreviewResultDto, PlCatalogueSourceType,
  PlCatalogueStatusConfigDto, PlCatalogueStatusConfigVersionDto, PlCategoryLineMappingDto,
  PlCategoryLineMappingVersionDto, PlCategoryMappingRole, PlCostCategoryDto,
} from '../pl-catalogue.model';
import { DeriveRatesRequest, PlMonthlyExchangeRateDto } from '../pl-fx-rate.model';

/** Sentinel for the "Global Default" pays option — `paysId=null` server-side, never a real id. */
const GLOBAL_DEFAULT = 0;

/** WP6(i) — the only currency pair this dev environment has ever had real TND data for; the
 *  derive/list screens default to it but accept free text (the backend validates the pair, not
 *  this list). */
const DEFAULT_FX_PAIR = 'TND/EUR';

type CatalogueTab = 'status' | 'mapping' | 'fx';
type MappingSheet = 'template' | 'budget';

interface MappingEdit {
  catalogueLineId: number | null;
  mappingRole: PlCategoryMappingRole | null;
}

/** `row['catalogueLineIds']` on the Budget mapping table is a `number[]`, but `daf-select`'s
 *  `[selected]` input expects `string[]` — this tiny standalone pipe keeps that conversion purely
 *  declarative in the template, matching this codebase's existing pipe usage style. Only ever
 *  used from `pl-catalogue-admin.component.html`, so it lives in this file rather than its own. */
@Pipe({ name: 'plAsStrings', standalone: true })
export class PlAsStringsPipe implements PipeTransform {
  transform(value: number[]): string[] {
    return value.map(String);
  }
}

/**
 * P&L source catalogue admin (docs/PL_CATALOGUE_PLAN.md §6 in daf360-facturation-service,
 * F.08 follow-on). Two sub-screens sharing one pays selector:
 *  - Status config: which statuses count as "active" per source type (COST_BOOKED etc.).
 *  - Category → line mapping (DEC-CATMAP-1): which `group_catalogue_lines` row each REAL,
 *    per-pays cost category (`fact_configurable_list_values` type `COST_CATEGORY` — the same
 *    category a user picks on a cost line) re-attributes to, and under what role (COST/
 *    EXTERNAL_COGS/MANUAL/EXCLUDED) — see coverage check below. `group_catalogue_lines` itself
 *    is the TARGET only; rendered one row per line (not per category), each with a multi-select
 *    of the categories currently assigned to it — `lines` below still reads it for that grouping.
 *
 * Two plan items from §6 are NOT built here, by deliberate scope decision, not oversight:
 *  - Preview (run a DRAFT config against a closed period without persisting) — no backend
 *    endpoint exists for this; building one safely (a parallel, non-mutating execution path
 *    through PlPeriodService/PlWorkbookExportService) is a meaningfully sized feature in its
 *    own right, not "a small addition" — left for a dedicated follow-up pass.
 *  - Version history (list of ARCHIVED versions with who/when) — `getStatusConfig`/
 *    `getCategoryMapping` only ever return the current DRAFT-or-ACTIVE row, never the archive;
 *    there is no endpoint to list past versions. Only the CURRENT version/status is shown.
 *  - The plan's "two-actor" activation (mirroring budget_references' separate CD/Group
 *    approval steps) is not implemented — the backend's `activate` endpoints are single-step
 *    (one `approvedBy`), matching what's actually built; the UI reflects that honestly as one
 *    "Activer" action rather than inventing a second step the API can't support.
 */
@Component({
  selector: 'app-pl-catalogue-admin',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent, SelectComponent,
    TabsComponent, CheckboxComponent, StatusBadgeComponent, DataTableComponent, DafCellDirective,
    FormFieldComponent, PlAsStringsPipe,
  ],
  host: { class: 'block' },
  templateUrl: './pl-catalogue-admin.component.html',
})
export class PlCatalogueAdminComponent implements OnInit {
  private readonly svc        = inject(PlCatalogueAdminService);
  private readonly fxSvc      = inject(PlFxRateAdminService);
  private readonly clientSvc  = inject(ClientService);
  private readonly lineSvc    = inject(GroupCatalogueLineService);
  private readonly periodSvc  = inject(PlPeriodService);
  private readonly userStore  = inject(UserStore);
  private readonly modals     = inject(ModalService);
  private readonly translate  = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly budgetRowSvc = inject(PlBudgetRowAdminService);

  /** WP1(c) DEC10 — distinct from `FACT_ADMIN_PL_CATALOGUE` (create/save a DRAFT); only a
   *  DIFFERENT user holding this permission can activate it (server enforces `createdBy !=
   *  approvedBy`, see `activateErrorMessage`). */
  readonly canApprove = computed(() => this.userStore.hasPermission('FACT_APPROVE_PL_CATALOGUE'));
  /** WP6(f,h,i)/DEC19 — Finance-Manager-only; gates the FX-rates tab's very existence, not just
   *  an action inside it, since this table is Finance-internal (see `PlFxRateAdminController`'s
   *  own doc comment). */
  readonly canManageFxRates = computed(() => this.userStore.hasPermission('FACT_MANAGE_FX_RATES'));

  // ── Pays selector (shared by both tabs) ─────────────────────────────────────
  paysList = signal<PaysRefDto[]>([]);
  /** `GLOBAL_DEFAULT` (0) = the `paysId IS NULL` global default row, never a real pays id. */
  paysId = signal<number>(GLOBAL_DEFAULT);

  readonly paysOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: String(GLOBAL_DEFAULT), label: this.translate.instant('REPORTING.PL_CATALOGUE.GLOBAL_DEFAULT') },
      ...this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` })),
    ];
  });

  private get effectivePaysId(): number | null {
    return this.paysId() === GLOBAL_DEFAULT ? null : this.paysId();
  }

  onPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (!Number.isFinite(id) || id === this.paysId()) return;
    this.paysId.set(id);
    this.loadStatusConfig();
    this.loadRealCostCategories();
    this.loadMapping();
    this.loadClosedPeriods();
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  activeTab = signal<CatalogueTab>('status');

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const tabs: TabItem[] = [
      { id: 'status',  label: this.translate.instant('REPORTING.PL_CATALOGUE.TAB_STATUS') },
      { id: 'mapping', label: this.translate.instant('REPORTING.PL_CATALOGUE.TAB_MAPPING') },
    ];
    if (this.canManageFxRates()) {
      tabs.push({ id: 'fx', label: this.translate.instant('REPORTING.PL_CATALOGUE.TAB_FX') });
    }
    return tabs;
  });

  private fxLoaded = false;

  onTabChange(id: string): void {
    this.activeTab.set(id as CatalogueTab);
    if (id === 'fx' && !this.fxLoaded) {
      this.fxLoaded = true;
      this.loadFxRates();
    }
  }

  firstLoad = signal(true);

  ngOnInit(): void {
    forkJoin({
      myPays:  this.clientSvc.getMyPays(),
      allPays: this.clientSvc.getPays(),
      lines:   this.lineSvc.list(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ allPays, lines }) => {
        this.paysList.set(allPays);
        this.lines.set(lines);
        this.loadStatusConfig();
        this.loadRealCostCategories();
        this.loadMapping();
        this.loadClosedPeriods();
        this.firstLoad.set(false);
      },
      error: () => {
        this.statusError.set(this.translate.instant('REPORTING.PL_CATALOGUE.LOAD_ERROR'));
        this.mappingError.set(this.translate.instant('REPORTING.PL_CATALOGUE.LOAD_ERROR'));
        this.firstLoad.set(false);
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Status config
  // ════════════════════════════════════════════════════════════════════════════

  sourceType = signal<PlCatalogueSourceType>('COST_BOOKED');

  readonly sourceTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return PL_CATALOGUE_SOURCE_TYPES.map(t => ({
      value: t, label: this.translate.instant('REPORTING.PL_CATALOGUE.SOURCE_TYPE.' + t),
    }));
  });

  onSourceTypeSelected(values: string[]): void {
    const t = values[0] as PlCatalogueSourceType;
    if (!t || t === this.sourceType()) return;
    this.sourceType.set(t);
    this.loadStatusConfig();
  }

  statusConfig  = signal<PlCatalogueStatusConfigDto | null>(null);
  statusLoading = signal(false);
  statusError   = signal<string | null>(null);
  statusSaving  = signal(false);
  statusActivating = signal(false);
  statusSuccess = signal<string | null>(null);

  /** The statuses currently checked in the editor — seeded from `statusConfig()` on every load,
   *  edited locally until "Enregistrer" commits it. A plain `Set`, not a signal-of-array, so
   *  `toggleStatus` doesn't need to rebuild the whole array on every click. */
  private editedSelected = new Set<string>();
  /** Bumped on every edit so `computed()`s reading `editedSelected` (a plain mutable Set) know
   *  to re-run — signals don't track mutations inside a non-signal object. */
  private editedTick = signal(0);

  /**
   * Today's exact hard-coded defaults (`PlCatalogueConfigService.DEFAULTS`), mirrored here only
   * to drive the "today's behaviour" badge — informational only, never sent to the server. Keep
   * in sync with the backend constant if it changes; this duplication is a known, accepted
   * trade-off (the backend doesn't expose a `GET .../defaults` endpoint to read it from).
   */
  private static readonly DEFAULT_STATUSES: Record<PlCatalogueSourceType, readonly string[]> = {
    COST_BOOKED:      ['POSTED', 'PARTIALLY_PAID'],
    CUSTOMER_BILLED:  ['EMITTED', 'SENT', 'PARTIALLY_PAID', 'PAID'],
    CUSTOMER_OPEN:    ['EMITTED', 'SENT', 'PARTIALLY_PAID'],
    COST_PAYABLE:     [],
    WIP_DECLARATION:  [],
  };

  isDefaultStatus(status: string): boolean {
    return PlCatalogueAdminComponent.DEFAULT_STATUSES[this.sourceType()].includes(status);
  }

  /**
   * Reads a backend error for display. Fixes a real pre-existing bug found while building this:
   * every call site here read `err.error?.message`, but `GlobalExceptionHandler` returns Spring's
   * `ProblemDetail` (field `detail`, plus an optional `rule` code) — `.message` is never present
   * on that body, so no backend error text has ever actually reached this screen; every failure
   * silently fell back to the generic translated message. `RG_PL_CATALOGUE_SELF_APPROVAL` (WP1(c)
   * DEC10's two-person-activation rule) gets its own friendly, translated wording instead of the
   * raw backend sentence, since it's the one error a user here is actually expected to hit.
   */
  private backendErrorMessage(err: unknown, fallbackKey: string): string {
    const body = (err as { error?: { detail?: string; rule?: string } } | undefined)?.error;
    if (body?.rule === 'RG_PL_CATALOGUE_SELF_APPROVAL') {
      return this.translate.instant('REPORTING.PL_CATALOGUE.SELF_APPROVAL_ERROR');
    }
    return body?.detail ?? this.translate.instant(fallbackKey);
  }

  /** WIP_DECLARATION has no server-side never-selectable set (D4: all statuses stay choosable),
   *  but selecting the "not yet validated" statuses deserves a visible warning, not a block. */
  private static readonly WIP_WARN_STATUSES = new Set(['EN_ATTENTE', 'PENDING']);

  readonly wipWarningStatuses = computed(() => {
    this.editedTick();
    if (this.sourceType() !== 'WIP_DECLARATION') return [];
    return [...this.editedSelected].filter(s => PlCatalogueAdminComponent.WIP_WARN_STATUSES.has(s));
  });

  readonly statusEntries = computed(() => {
    this.editedTick();
    const cfg = this.statusConfig();
    if (!cfg) return [];
    return cfg.entries.map(e => ({ ...e, selected: this.editedSelected.has(e.status) }));
  });

  isStatusChecked(status: string): boolean {
    this.editedTick();
    return this.editedSelected.has(status);
  }

  toggleStatus(status: string, checked: boolean): void {
    if (checked) this.editedSelected.add(status); else this.editedSelected.delete(status);
    this.editedTick.update(v => v + 1);
  }

  loadStatusConfig(): void {
    this.statusLoading.set(true);
    this.statusError.set(null);
    this.statusSuccess.set(null);
    this.svc.getStatusConfig(this.effectivePaysId, this.sourceType())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: cfg => {
          this.statusConfig.set(cfg);
          this.editedSelected = new Set(cfg.entries.filter(e => e.selected).map(e => e.status));
          this.editedTick.update(v => v + 1);
          this.statusLoading.set(false);
        },
        error: err => {
          this.statusError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
          this.statusLoading.set(false);
        },
      });
  }

  saveStatusDraft(): void {
    this.statusSaving.set(true);
    this.statusError.set(null);
    this.statusSuccess.set(null);
    this.svc.saveStatusConfig({
      paysId: this.effectivePaysId,
      sourceType: this.sourceType(),
      selectedStatuses: [...this.editedSelected],
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: cfg => {
        this.statusConfig.set(cfg);
        this.statusSaving.set(false);
        this.statusSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.SAVE_SUCCESS'));
      },
      error: err => {
        this.statusError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.SAVE_ERROR'));
        this.statusSaving.set(false);
      },
    });
  }

  readonly canActivateStatus = computed(() => this.statusConfig()?.configStatus === 'DRAFT');

  activateStatus(): void {
    const cfg = this.statusConfig();
    if (!cfg?.version) return;
    this.statusActivating.set(true);
    this.statusError.set(null);
    this.svc.activateStatusConfig(this.effectivePaysId, this.sourceType(), cfg.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.statusConfig.set(updated);
          this.editedSelected = new Set(updated.entries.filter(e => e.selected).map(e => e.status));
          this.editedTick.update(v => v + 1);
          this.statusActivating.set(false);
          this.statusSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.ACTIVATE_SUCCESS'));
        },
        error: err => {
          this.statusError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.ACTIVATE_ERROR'));
          this.statusActivating.set(false);
        },
      });
  }

  badgeVariant(status: string): 'success' | 'neutral' | 'warning' {
    if (status === 'ACTIVE') return 'success';
    if (status === 'DRAFT') return 'warning';
    return 'neutral';
  }

  // ── WP1(c): status-config version history ───────────────────────────────────

  private readonly statusHistoryTpl = viewChild.required<TemplateRef<unknown>>('statusHistoryTpl');
  statusHistory = signal<PlCatalogueStatusConfigVersionDto[]>([]);
  statusHistoryLoading = signal(false);
  statusHistoryError = signal<string | null>(null);

  openStatusHistory(): void {
    this.statusHistoryLoading.set(true);
    this.statusHistoryError.set(null);
    this.svc.getStatusConfigHistory(this.effectivePaysId, this.sourceType())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: versions => {
          this.statusHistory.set(versions);
          this.statusHistoryLoading.set(false);
        },
        error: err => {
          this.statusHistoryError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
          this.statusHistoryLoading.set(false);
        },
      });
    this.modals.open({
      title: this.translate.instant('REPORTING.PL_CATALOGUE.HISTORY.TITLE'),
      size: 'lg',
      body: this.statusHistoryTpl(),
      buttons: [{ label: this.translate.instant('REPORTING.DETAIL.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  // ── WP1(c): status-config preview (DRAFT vs. ACTIVE, one closed period, nothing persisted) ──

  private readonly previewTpl = viewChild.required<TemplateRef<unknown>>('previewTpl');
  closedPeriods = signal<PlPeriodDto[]>([]);
  previewPeriodId = signal<number | null>(null);
  previewResult = signal<PlCataloguePreviewResultDto | null>(null);
  previewLoading = signal(false);
  previewError = signal<string | null>(null);

  readonly previewPeriodOptions = computed<SelectOption[]>(() =>
    this.closedPeriods()
      .filter(p => p.status !== 'OPEN')
      .map(p => ({ value: String(p.id), label: `${p.periodYear}-${String(p.periodMonth).padStart(2, '0')} (${p.status})` })));

  private loadClosedPeriods(): void {
    this.closedPeriods.set([]);
    if (this.effectivePaysId == null) return; // no periods for the "Global Default" pseudo-pays
    this.periodSvc.getPeriods(this.effectivePaysId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: periods => this.closedPeriods.set(periods),
      error: () => this.closedPeriods.set([]),
    });
  }

  onPreviewPeriodSelected(values: string[]): void {
    const id = Number(values[0]);
    this.previewPeriodId.set(Number.isFinite(id) ? id : null);
  }

  openPreview(): void {
    this.previewResult.set(null);
    this.previewError.set(null);
    this.modals.open({
      title: this.translate.instant('REPORTING.PL_CATALOGUE.PREVIEW.TITLE'),
      size: 'md',
      body: this.previewTpl(),
      buttons: [{ label: this.translate.instant('REPORTING.DETAIL.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  runPreview(): void {
    const cfg = this.statusConfig();
    const periodId = this.previewPeriodId();
    if (!cfg?.version || periodId == null) return;
    this.previewLoading.set(true);
    this.previewError.set(null);
    this.svc.previewStatusConfig(periodId, this.sourceType(), cfg.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.previewResult.set(result);
          this.previewLoading.set(false);
        },
        error: err => {
          this.previewError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
          this.previewLoading.set(false);
        },
      });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Category → line mapping
  // ════════════════════════════════════════════════════════════════════════════

  /** TARGET side only (DEC-CATMAP-1) — the fixed `group_catalogue_lines` registry, unchanged. */
  lines = signal<GroupCatalogueLineDto[]>([]);

  /** SOURCE side (DEC-CATMAP-1) — the real, per-pays `COST_CATEGORY` list; reloaded on every
   *  pays change, unlike `lines` above which is global and fetched once. */
  realCategories = signal<PlCostCategoryDto[]>([]);
  realCategoriesLoading = signal(false);

  private loadRealCostCategories(): void {
    this.realCategoriesLoading.set(true);
    this.svc.listRealCostCategories(this.effectivePaysId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: categories => {
          this.realCategories.set(categories);
          this.realCategoriesLoading.set(false);
        },
        error: () => {
          this.realCategories.set([]);
          this.realCategoriesLoading.set(false);
        },
      });
  }

  readonly roleOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const roles: PlCategoryMappingRole[] = ['COST', 'EXTERNAL_COGS', 'MANUAL', 'EXCLUDED'];
    return roles.map(r => ({ value: r, label: this.translate.instant('REPORTING.PL_CATALOGUE.ROLE.' + r) }));
  });

  mapping        = signal<PlCategoryLineMappingDto | null>(null);
  mappingLoading = signal(false);
  mappingError   = signal<string | null>(null);
  mappingSaving  = signal(false);
  mappingActivating = signal(false);
  mappingSuccess = signal<string | null>(null);

  /** One entry per `group_catalogue_lines.code` (the "category" in this screen) — seeded from
   *  `mapping()` on every load, edited locally until "Enregistrer" commits it. Keyed by code, so
   *  a duplicate entry for the same category is structurally impossible here (unlike a flat
   *  list) — the coverage check below only ever needs to find UNMAPPED categories. */
  private editedMapping = new Map<string, MappingEdit>();
  private mappingTick = signal(0);

  loadMapping(): void {
    this.mappingLoading.set(true);
    this.mappingError.set(null);
    this.mappingSuccess.set(null);
    this.svc.getCategoryMapping(this.effectivePaysId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: dto => {
          this.mapping.set(dto);
          this.editedMapping = new Map(
            dto.entries.map(e => [e.categoryCode, { catalogueLineId: e.catalogueLineId, mappingRole: e.mappingRole }]));
          this.mappingTick.update(v => v + 1);
          this.mappingLoading.set(false);
        },
        error: err => {
          this.mappingError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
          this.mappingLoading.set(false);
        },
      });
  }

  readonly mappingColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'lineLabel',  label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_LINE') },
      { key: 'categories', label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_CATEGORY'), type: 'custom' },
      { key: 'roles',      label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_ROLE'), type: 'custom' },
    ];
  });

  /** One row per TARGET line (not per source category) — lets a line like "Material & Energy"
   *  show every real cost category currently feeding it as a single multi-select, instead of
   *  forcing the user to find and re-target each category's own row one at a time. The
   *  underlying `editedMapping` (keyed by category code) is unchanged; this is purely a
   *  different grouping of the same data for rendering. */
  readonly mappingRows = computed<TableRow[]>(() => {
    this.mappingTick();
    const byLine = new Map<number, string[]>();
    for (const category of this.realCategories()) {
      const edit = this.editedMapping.get(category.code);
      if (edit?.catalogueLineId != null) {
        const codes = byLine.get(edit.catalogueLineId) ?? [];
        codes.push(category.code);
        byLine.set(edit.catalogueLineId, codes);
      }
    }
    return this.lines().map(line => ({
      id: String(line.id),
      lineId: line.id,
      lineLabel: line.excelRow ? `${line.labelFr} (${line.code}) · row ${line.excelRow}` : `${line.labelFr} (${line.code})`,
      categoryCodes: byLine.get(line.id) ?? [],
    }));
  });

  readonly categoryOptions = computed<SelectOption[]>(() =>
    this.realCategories().map(c => ({ value: c.code, label: `${c.labelFr} (${c.code})` })));

  categoryLabel(code: string): string {
    const c = this.realCategories().find(c => c.code === code);
    return c ? `${c.labelFr} (${c.code})` : code;
  }

  roleFor(categoryCode: string): PlCategoryMappingRole | null {
    return this.editedMapping.get(categoryCode)?.mappingRole ?? null;
  }

  readonly mappingTableConfig = computed<TableConfig>(() => ({
    showHeader: true,
    loading: this.mappingLoading() || this.realCategoriesLoading(),
    emptyMessage: this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.EMPTY'),
  }));

  /** Multi-select change for one TARGET line's row — categories removed from the selection stop
   *  targeting this line (becoming unmapped, not silently reassigned); categories newly added
   *  here are moved onto this line even if they previously targeted a different one, keeping the
   *  "each category maps to exactly one line" invariant the coverage check already enforces. */
  onCategoriesForLineChange(lineId: number, categoryCodes: string[]): void {
    const selected = new Set(categoryCodes);
    for (const [code, edit] of this.editedMapping) {
      if (edit.catalogueLineId === lineId && !selected.has(code)) {
        this.editedMapping.delete(code);
      }
    }
    for (const code of categoryCodes) {
      const current = this.editedMapping.get(code);
      if (current?.catalogueLineId !== lineId) {
        this.editedMapping.set(code, { catalogueLineId: lineId, mappingRole: current?.mappingRole ?? null });
      }
    }
    this.mappingTick.update(v => v + 1);
  }

  /** DEC-CATMAP-1 edge case confirmed in real Tunisia data (HONORAIRES=COST vs.
   *  CAPEX_EQUIP=EXCLUDED, both targeting OTHER_ONEOFF): mappingRole is a property of each
   *  (category, line) pair, not of the line as a whole — two categories sharing a target line
   *  can legitimately carry different roles, so this stays per-category, not per-line. */
  onCategoryRoleChange(categoryCode: string, values: string[]): void {
    const role = (values[0] || null) as PlCategoryMappingRole | null;
    const current = this.editedMapping.get(categoryCode);
    if (!current) return;
    this.editedMapping.set(categoryCode, { ...current, mappingRole: role });
    this.mappingTick.update(v => v + 1);
  }

  /** Mirrors the backend's `coverageCheck` (every active line mapped exactly once) — computed
   *  client-side so "Enregistrer" can be disabled with an immediate, specific reason instead of
   *  only finding out after a round trip. The server re-validates independently regardless
   *  (AC4/AC5) — this is UX, not the authority. */
  readonly mappingCoverage = computed(() => {
    this.mappingTick();
    const unmapped = this.realCategories()
      .filter(c => {
        const e = this.editedMapping.get(c.code);
        return !e || e.catalogueLineId == null || e.mappingRole == null;
      })
      .map(c => c.code);
    return { ok: unmapped.length === 0, unmappedCategoryCodes: unmapped };
  });

  saveMappingDraft(): void {
    if (!this.mappingCoverage().ok) {
      this.mappingError.set(this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.COVERAGE_BLOCKED', {
        codes: this.mappingCoverage().unmappedCategoryCodes.join(', '),
      }));
      return;
    }
    this.mappingSaving.set(true);
    this.mappingError.set(null);
    this.mappingSuccess.set(null);
    const entries = [...this.editedMapping.entries()].map(([categoryCode, e]) => ({
      categoryCode, catalogueLineId: e.catalogueLineId!, mappingRole: e.mappingRole!,
    }));
    this.svc.saveCategoryMapping({ paysId: this.effectivePaysId, entries })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.mappingSaving.set(false);
          this.mappingSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.SAVE_SUCCESS'));
          this.loadMapping();
        },
        error: err => {
          this.mappingError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.SAVE_ERROR'));
          this.mappingSaving.set(false);
        },
      });
  }

  readonly canActivateMapping = computed(() => this.mapping()?.configStatus === 'DRAFT');

  activateMapping(): void {
    const m = this.mapping();
    if (!m?.version) return;
    this.mappingActivating.set(true);
    this.mappingError.set(null);
    this.svc.activateCategoryMapping(this.effectivePaysId, m.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.mapping.set(updated);
          this.editedMapping = new Map(
            updated.entries.map(e => [e.categoryCode, { catalogueLineId: e.catalogueLineId, mappingRole: e.mappingRole }]));
          this.mappingTick.update(v => v + 1);
          this.mappingActivating.set(false);
          this.mappingSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.ACTIVATE_SUCCESS'));
        },
        error: err => {
          this.mappingError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.ACTIVATE_ERROR'));
          this.mappingActivating.set(false);
        },
      });
  }

  // ── WP1(c): category-mapping version history (same pattern as status-config's own above) ───

  private readonly mappingHistoryTpl = viewChild.required<TemplateRef<unknown>>('mappingHistoryTpl');
  mappingHistory = signal<PlCategoryLineMappingVersionDto[]>([]);
  mappingHistoryLoading = signal(false);
  mappingHistoryError = signal<string | null>(null);

  openMappingHistory(): void {
    this.mappingHistoryLoading.set(true);
    this.mappingHistoryError.set(null);
    this.svc.getCategoryMappingHistory(this.effectivePaysId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: versions => {
          this.mappingHistory.set(versions);
          this.mappingHistoryLoading.set(false);
        },
        error: err => {
          this.mappingHistoryError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
          this.mappingHistoryLoading.set(false);
        },
      });
    this.modals.open({
      title: this.translate.instant('REPORTING.PL_CATALOGUE.HISTORY.TITLE'),
      size: 'lg',
      body: this.mappingHistoryTpl(),
      buttons: [{ label: this.translate.instant('REPORTING.DETAIL.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Budget-row mapping (Sheet selector, sibling to the Template category mapping above)
  // ════════════════════════════════════════════════════════════════════════════

  mappingSheet = signal<MappingSheet>('template');

  readonly mappingSheetOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'template', label: this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.SHEET_TEMPLATE') },
      { value: 'budget', label: this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.SHEET_BUDGET') },
    ];
  });

  private budgetRowsLoaded = false;

  onMappingSheetSelected(values: string[]): void {
    const sheet = values[0] as MappingSheet;
    if (!sheet || sheet === this.mappingSheet()) return;
    this.mappingSheet.set(sheet);
    if (sheet === 'budget' && !this.budgetRowsLoaded) {
      this.budgetRowsLoaded = true;
      this.loadBudgetRows();
      this.loadBudgetRowMapping();
    }
  }

  budgetRows = signal<PlBudgetRowDto[]>([]);
  budgetRowsLoading = signal(false);

  budgetRowMapping = signal<PlBudgetRowMappingDto | null>(null);
  budgetRowMappingLoading = signal(false);
  budgetRowMappingError = signal<string | null>(null);
  budgetRowMappingSaving = signal(false);
  budgetRowMappingActivating = signal(false);
  budgetRowMappingSuccess = signal<string | null>(null);

  /** Keyed by `catalogueLineId` (the SOURCE, a `group_catalogue_lines` id) -- mirrors
   *  `editedMapping`'s shape one level up: which Budget row it feeds and with which transform. */
  private editedBudgetRowByLineId = new Map<number, { budgetRowId: number; transform: PlBudgetRowTransform | null }>();
  private budgetMappingTick = signal(0);

  readonly transformOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const transforms: PlBudgetRowTransform[] = ['DIRECT', 'NEGATE', 'POSITIVE_PART', 'NEGATIVE_PART'];
    return transforms.map(t => ({ value: t, label: this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.TRANSFORM.' + t) }));
  });

  private loadBudgetRows(): void {
    this.budgetRowsLoading.set(true);
    this.budgetRowSvc.listBudgetRows().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => {
        this.budgetRows.set(rows);
        this.budgetRowsLoading.set(false);
      },
      error: () => {
        this.budgetRows.set([]);
        this.budgetRowsLoading.set(false);
      },
    });
  }

  loadBudgetRowMapping(): void {
    this.budgetRowMappingLoading.set(true);
    this.budgetRowMappingError.set(null);
    this.budgetRowMappingSuccess.set(null);
    this.budgetRowSvc.getBudgetRowMapping().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: dto => {
        this.budgetRowMapping.set(dto);
        this.editedBudgetRowByLineId = new Map(
          dto.entries.map(e => [e.catalogueLineId, { budgetRowId: e.budgetRowId, transform: e.transform }]));
        this.budgetMappingTick.update(v => v + 1);
        this.budgetRowMappingLoading.set(false);
      },
      error: err => {
        this.budgetRowMappingError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
        this.budgetRowMappingLoading.set(false);
      },
    });
  }

  /** One row per `pl_budget_row` TARGET, each with the `group_catalogue_lines` SOURCE ids
   *  currently assigned to it -- the exact same grouping shape as `mappingRows()` above, just
   *  keyed by `catalogueLineId` (number) instead of `categoryCode` (string). */
  readonly budgetMappingRows = computed<TableRow[]>(() => {
    this.budgetMappingTick();
    const byRow = new Map<number, number[]>();
    for (const [lineId, edit] of this.editedBudgetRowByLineId) {
      const ids = byRow.get(edit.budgetRowId) ?? [];
      ids.push(lineId);
      byRow.set(edit.budgetRowId, ids);
    }
    return this.budgetRows().map(row => ({
      id: String(row.id),
      budgetRowId: row.id,
      rowLabel: `${row.labelFr} (${row.code}) · row ${row.excelRow}`,
      catalogueLineIds: byRow.get(row.id) ?? [],
    }));
  });

  readonly budgetSourceOptions = computed<SelectOption[]>(() =>
    this.lines().map(l => ({
      value: String(l.id),
      label: l.excelRow ? `${l.labelFr} (${l.code}) · Template row ${l.excelRow}` : `${l.labelFr} (${l.code})`,
    })));

  budgetSourceLabel(lineId: number): string {
    const line = this.lines().find(l => l.id === lineId);
    return line ? `${line.labelFr} (${line.code})` : String(lineId);
  }

  budgetTransformFor(lineId: number): PlBudgetRowTransform | null {
    return this.editedBudgetRowByLineId.get(lineId)?.transform ?? null;
  }

  onCatalogueLinesForBudgetRowChange(budgetRowId: number, lineIdStrings: string[]): void {
    const selected = new Set(lineIdStrings.map(Number));
    for (const [lineId, edit] of this.editedBudgetRowByLineId) {
      if (edit.budgetRowId === budgetRowId && !selected.has(lineId)) {
        this.editedBudgetRowByLineId.delete(lineId);
      }
    }
    for (const lineId of selected) {
      const current = this.editedBudgetRowByLineId.get(lineId);
      if (current?.budgetRowId !== budgetRowId) {
        this.editedBudgetRowByLineId.set(lineId, { budgetRowId, transform: current?.transform ?? null });
      }
    }
    this.budgetMappingTick.update(v => v + 1);
  }

  onBudgetRowTransformChange(lineId: number, values: string[]): void {
    const transform = (values[0] || null) as PlBudgetRowTransform | null;
    const current = this.editedBudgetRowByLineId.get(lineId);
    if (!current) return;
    this.editedBudgetRowByLineId.set(lineId, { ...current, transform });
    this.budgetMappingTick.update(v => v + 1);
  }

  /** Mirrors `mappingCoverage()` one level up: every ACTIVE `pl_budget_row` must have at least
   *  one source assigned, computed client-side for immediate UX feedback. */
  readonly budgetMappingCoverage = computed(() => {
    this.budgetMappingTick();
    const coveredRowIds = new Set<number>();
    const incompleteRowIds = new Set<number>();
    for (const edit of this.editedBudgetRowByLineId.values()) {
      coveredRowIds.add(edit.budgetRowId);
      if (edit.transform == null) incompleteRowIds.add(edit.budgetRowId);
    }
    const unmapped = this.budgetRows()
        .filter(r => !coveredRowIds.has(r.id) || incompleteRowIds.has(r.id))
        .map(r => r.code);
    return { ok: unmapped.length === 0, unmappedBudgetRowCodes: unmapped };
  });

  saveBudgetRowMappingDraft(): void {
    if (!this.budgetMappingCoverage().ok) {
      this.budgetRowMappingError.set(this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.BUDGET_COVERAGE_BLOCKED', {
        codes: this.budgetMappingCoverage().unmappedBudgetRowCodes.join(', '),
      }));
      return;
    }
    this.budgetRowMappingSaving.set(true);
    this.budgetRowMappingError.set(null);
    this.budgetRowMappingSuccess.set(null);
    const entries = [...this.editedBudgetRowByLineId.entries()]
        .filter(([, e]) => e.transform != null)
        .map(([catalogueLineId, e]) => ({ budgetRowId: e.budgetRowId, catalogueLineId, transform: e.transform! }));
    this.budgetRowSvc.saveBudgetRowMapping({ entries }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.budgetRowMappingSaving.set(false);
        this.budgetRowMappingSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.SAVE_SUCCESS'));
        this.loadBudgetRowMapping();
      },
      error: err => {
        this.budgetRowMappingError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.SAVE_ERROR'));
        this.budgetRowMappingSaving.set(false);
      },
    });
  }

  readonly canActivateBudgetRowMapping = computed(() => this.budgetRowMapping()?.configStatus === 'DRAFT');

  activateBudgetRowMapping(): void {
    const m = this.budgetRowMapping();
    if (!m?.version) return;
    this.budgetRowMappingActivating.set(true);
    this.budgetRowMappingError.set(null);
    this.budgetRowSvc.activateBudgetRowMapping(m.version).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.budgetRowMapping.set(updated);
        this.editedBudgetRowByLineId = new Map(
          updated.entries.map(e => [e.catalogueLineId, { budgetRowId: e.budgetRowId, transform: e.transform }]));
        this.budgetMappingTick.update(v => v + 1);
        this.budgetRowMappingActivating.set(false);
        this.budgetRowMappingSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.ACTIVATE_SUCCESS'));
      },
      error: err => {
        this.budgetRowMappingError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.ACTIVATE_ERROR'));
        this.budgetRowMappingActivating.set(false);
      },
    });
  }

  readonly budgetMappingColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'rowLabel',   label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_LINE') },
      { key: 'sources',    label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_BUDGET_SOURCES'), type: 'custom' },
      { key: 'transforms', label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_TRANSFORM'), type: 'custom' },
    ];
  });

  readonly budgetMappingTableConfig = computed<TableConfig>(() => ({
    showHeader: true,
    loading: this.budgetRowMappingLoading() || this.budgetRowsLoading(),
    emptyMessage: this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.EMPTY'),
  }));

  // ════════════════════════════════════════════════════════════════════════════
  // WP6(f,h,i)/DEC19: monthly FX rates (Finance Manager only, FACT_MANAGE_FX_RATES)
  // Only ever shown/usable when `canManageFxRates()` — gated both by the tab's own visibility
  // (see `tabs`) and server-side on every call in `PlFxRateAdminController`.
  // ════════════════════════════════════════════════════════════════════════════

  fxPair = signal<string>(DEFAULT_FX_PAIR);
  fxRates = signal<PlMonthlyExchangeRateDto[]>([]);
  fxLoading = signal(false);
  fxError = signal<string | null>(null);
  fxSuccess = signal<string | null>(null);

  fxFromMonth = signal<string>('');
  fxToMonth = signal<string>('');
  fxDeriving = signal(false);
  fxConfirming = signal(false);

  /** Plain text inputs, not a native month/date picker — `FormFieldOptions`'s type union isn't
   *  confirmed to include a month-only variant, and `YearMonth`-shaped "YYYY-MM" text is exactly
   *  what `DeriveRatesRequest` needs on the wire anyway. `fxMonthPattern` below guards the format
   *  client-side; the server validates `YearMonth` parsing regardless. */
  readonly fxFromMonthFieldOptions = computed(() => ({
    label: this.translate.instant('REPORTING.PL_CATALOGUE.FX.FROM_MONTH'), placeholder: 'YYYY-MM', required: true,
  }));
  readonly fxToMonthFieldOptions = computed(() => ({
    label: this.translate.instant('REPORTING.PL_CATALOGUE.FX.TO_MONTH'), placeholder: 'YYYY-MM', required: true,
  }));
  readonly fxPairFieldOptions = computed(() => ({
    label: this.translate.instant('REPORTING.PL_CATALOGUE.FX.PAIR'), placeholder: 'TND/EUR', required: true,
  }));

  private static readonly MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

  readonly fxCanDerive = computed(() =>
    PlCatalogueAdminComponent.MONTH_PATTERN.test(this.fxFromMonth())
    && PlCatalogueAdminComponent.MONTH_PATTERN.test(this.fxToMonth())
    && this.fxPair().trim().length > 0);

  readonly fxColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'month',       label: t('REPORTING.PL_CATALOGUE.FX.COL_MONTH') },
      { key: 'rateMonthEnd', label: t('REPORTING.PL_CATALOGUE.FX.COL_MONTH_END') },
      { key: 'rateMonthAvg', label: t('REPORTING.PL_CATALOGUE.FX.COL_MONTH_AVG') },
      { key: 'minMax',       label: t('REPORTING.PL_CATALOGUE.FX.COL_MIN_MAX') },
      { key: 'nLines',       label: t('REPORTING.PL_CATALOGUE.FX.COL_N_LINES') },
      { key: 'status',       label: t('REPORTING.PL_CATALOGUE.FX.COL_STATUS'), type: 'custom' },
      { key: 'source',       label: t('REPORTING.PL_CATALOGUE.FX.COL_SOURCE') },
    ];
  });

  readonly fxRows = computed<TableRow[]>(() => this.fxRates().map(r => ({
    id: r.id,
    month: `${r.rateYear}-${String(r.rateMonth).padStart(2, '0')}`,
    rateMonthEnd: r.rateMonthEnd != null ? r.rateMonthEnd.toFixed(4) : '—',
    rateMonthAvg: r.rateMonthAvg != null ? r.rateMonthAvg.toFixed(4) : '—',
    minMax: r.rateMin != null && r.rateMax != null ? `${r.rateMin.toFixed(4)} – ${r.rateMax.toFixed(4)}` : '—',
    nLines: r.nLines ?? '—',
    status: r.status,
    source: r.source,
  })));

  readonly fxTableConfig = computed<TableConfig>(() => ({
    showHeader: true,
    loading: this.fxLoading(),
    emptyMessage: this.translate.instant('REPORTING.PL_CATALOGUE.FX.EMPTY'),
  }));

  /** Only DERIVED/SEED rows are ever confirmable (CONFIRMED stays confirmed forever, per
   *  WP6(i)'s idempotency rule; REVIEW needs a human to resolve the >2% spread first, not a
   *  blind bulk-confirm). */
  readonly fxConfirmableIds = computed(() =>
    this.fxRates().filter(r => r.status === 'DERIVED' || r.status === 'SEED').map(r => r.id));

  fxStatusVariant(status: string): 'success' | 'neutral' | 'warning' | 'danger' {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'REVIEW') return 'danger';
    if (status === 'DERIVED' || status === 'SOURCED') return 'neutral';
    return 'warning'; // SEED
  }

  onFxPairChange(value: string | number | null): void {
    this.fxPair.set(value != null ? String(value) : '');
  }

  loadFxRates(): void {
    const pair = this.fxPair().trim();
    if (!pair) return;
    this.fxLoading.set(true);
    this.fxError.set(null);
    this.fxSvc.listRates(pair).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rates => {
        this.fxRates.set(rates);
        this.fxLoading.set(false);
      },
      error: err => {
        this.fxError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
        this.fxLoading.set(false);
      },
    });
  }

  onFxFromMonthChange(value: string | number | null): void { this.fxFromMonth.set(value != null ? String(value) : ''); }
  onFxToMonthChange(value: string | number | null): void { this.fxToMonth.set(value != null ? String(value) : ''); }

  /** WP6(i) — proposes/updates DERIVED rows from this environment's own already-stored data
   *  only; never overwrites a CONFIRMED row; writes no row for a month with no stored rate. */
  deriveFxRates(): void {
    if (!this.fxCanDerive()) return;
    const pair = this.fxPair().trim();
    const fromMonth = this.fxFromMonth();
    const toMonth = this.fxToMonth();
    this.fxDeriving.set(true);
    this.fxError.set(null);
    this.fxSuccess.set(null);
    const req: DeriveRatesRequest = { currencyPair: pair, fromMonth, toMonth };
    this.fxSvc.derive(req).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.fxDeriving.set(false);
        const skipped = result.skippedConfirmedMonths.length;
        const noData = result.monthsWithNoData.length;
        this.fxSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.FX.DERIVE_SUCCESS', {
          n: result.derivedOrUpdated.length, skipped, noData,
        }));
        this.loadFxRates();
      },
      error: err => {
        this.fxError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
        this.fxDeriving.set(false);
      },
    });
  }

  /** DEC19 — bulk "Confirm" for every DERIVED/SEED row currently listed; never un-confirms, never
   *  touches REVIEW rows (those need a human to resolve the spread first). */
  confirmAllFxRates(): void {
    const ids = this.fxConfirmableIds();
    if (ids.length === 0) return;
    this.fxConfirming.set(true);
    this.fxError.set(null);
    this.fxSuccess.set(null);
    this.fxSvc.confirm(ids).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.fxConfirming.set(false);
        this.fxSuccess.set(this.translate.instant('REPORTING.PL_CATALOGUE.FX.CONFIRM_SUCCESS', { n: ids.length }));
        this.loadFxRates();
      },
      error: err => {
        this.fxError.set(this.backendErrorMessage(err, 'REPORTING.PL_CATALOGUE.LOAD_ERROR'));
        this.fxConfirming.set(false);
      },
    });
  }
}
