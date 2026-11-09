import { Component, DestroyRef, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
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

interface MappingEdit {
  catalogueLineId: number | null;
  mappingRole: PlCategoryMappingRole | null;
}

/**
 * P&L source catalogue admin (docs/PL_CATALOGUE_PLAN.md §6 in daf360-facturation-service,
 * F.08 follow-on). Two sub-screens sharing one pays selector:
 *  - Status config: which statuses count as "active" per source type (COST_BOOKED etc.).
 *  - Category → line mapping (DEC-CATMAP-1): which `group_catalogue_lines` row each REAL,
 *    per-pays cost category (`fact_configurable_list_values` type `COST_CATEGORY` — the same
 *    category a user picks on a cost line) re-attributes to, and under what role (COST/
 *    EXTERNAL_COGS/MANUAL/EXCLUDED) — see coverage check below. `group_catalogue_lines` itself
 *    is now the TARGET only; `lines`/`lineOptions` below still read it for that dropdown.
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
    FormFieldComponent,
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

  readonly lineOptions = computed<SelectOption[]>(() =>
    this.lines().map(l => ({ value: String(l.id), label: `${l.labelFr} (${l.code})` })));

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
      { key: 'categoryLabel', label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_CATEGORY') },
      { key: 'targetLine',    label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_LINE'), type: 'custom' },
      { key: 'role',          label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_ROLE'), type: 'custom' },
      { key: 'status',        label: t('REPORTING.PL_CATALOGUE.MAPPING.COL_STATUS'), type: 'custom', align: 'center' },
    ];
  });

  readonly mappingRows = computed<TableRow[]>(() => {
    this.mappingTick();
    return this.realCategories().map(category => {
      const edit = this.editedMapping.get(category.code);
      return {
        id: category.code,
        categoryCode: category.code,
        categoryLabel: `${category.labelFr} (${category.code})`,
        targetLineId: edit?.catalogueLineId != null ? String(edit.catalogueLineId) : '',
        mappingRole: edit?.mappingRole ?? '',
        // DEC-CATMAP-1: a real category with no DRAFT/ACTIVE mapping row shows up here
        // genuinely unmapped (blank target/role) — never silently defaulted or hidden.
        mapped: edit != null && edit.catalogueLineId != null && edit.mappingRole != null,
      };
    });
  });

  readonly mappingTableConfig = computed<TableConfig>(() => ({
    showHeader: true,
    loading: this.mappingLoading() || this.realCategoriesLoading(),
    emptyMessage: this.translate.instant('REPORTING.PL_CATALOGUE.MAPPING.EMPTY'),
  }));

  onLineTargetChange(categoryCode: string, values: string[]): void {
    const lineId = Number(values[0]);
    const current = this.editedMapping.get(categoryCode) ?? { catalogueLineId: null, mappingRole: null };
    this.editedMapping.set(categoryCode, { ...current, catalogueLineId: Number.isFinite(lineId) ? lineId : null });
    this.mappingTick.update(v => v + 1);
  }

  onLineRoleChange(categoryCode: string, values: string[]): void {
    const role = (values[0] || null) as PlCategoryMappingRole | null;
    const current = this.editedMapping.get(categoryCode) ?? { catalogueLineId: null, mappingRole: null };
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
