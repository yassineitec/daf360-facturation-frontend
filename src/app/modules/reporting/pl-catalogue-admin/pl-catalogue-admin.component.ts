import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  ButtonComponent, CheckboxComponent, DafCellDirective, DataTableComponent,
  PageComponent, PageHeaderComponent, SelectComponent, SelectOption,
  StatusBadgeComponent, TabItem, TabsComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto } from '../../affaires/affaire.model';
import { GroupCatalogueLineService } from '../group-catalogue-line.service';
import { GroupCatalogueLineDto } from '../pl-reporting.model';
import { PlCatalogueAdminService } from '../pl-catalogue-admin.service';
import {
  PL_CATALOGUE_SOURCE_TYPES, PlCatalogueSourceType, PlCatalogueStatusConfigDto,
  PlCategoryLineMappingDto, PlCategoryMappingRole,
} from '../pl-catalogue.model';

/** Sentinel for the "Global Default" pays option — `paysId=null` server-side, never a real id. */
const GLOBAL_DEFAULT = 0;

type CatalogueTab = 'status' | 'mapping';

interface MappingEdit {
  catalogueLineId: number | null;
  mappingRole: PlCategoryMappingRole | null;
}

/**
 * P&L source catalogue admin (docs/PL_CATALOGUE_PLAN.md §6 in daf360-facturation-service,
 * F.08 follow-on). Two sub-screens sharing one pays selector:
 *  - Status config: which statuses count as "active" per source type (COST_BOOKED etc.).
 *  - Category → line mapping: which of the 13 group_catalogue_lines a line re-attributes to,
 *    and under what role (COST/EXTERNAL_COGS/MANUAL/EXCLUDED) — see coverage check below.
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
  ],
  host: { class: 'block' },
  templateUrl: './pl-catalogue-admin.component.html',
})
export class PlCatalogueAdminComponent implements OnInit {
  private readonly svc        = inject(PlCatalogueAdminService);
  private readonly clientSvc  = inject(ClientService);
  private readonly lineSvc    = inject(GroupCatalogueLineService);
  private readonly translate  = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

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
    this.loadMapping();
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  activeTab = signal<CatalogueTab>('status');

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'status',  label: this.translate.instant('REPORTING.PL_CATALOGUE.TAB_STATUS') },
      { id: 'mapping', label: this.translate.instant('REPORTING.PL_CATALOGUE.TAB_MAPPING') },
    ];
  });

  onTabChange(id: string): void {
    this.activeTab.set(id as CatalogueTab);
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
        this.loadMapping();
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
          this.statusError.set(err.error?.message ?? this.translate.instant('REPORTING.PL_CATALOGUE.LOAD_ERROR'));
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
        this.statusError.set(err.error?.message ?? this.translate.instant('REPORTING.PL_CATALOGUE.SAVE_ERROR'));
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
          this.statusError.set(err.error?.message ?? this.translate.instant('REPORTING.PL_CATALOGUE.ACTIVATE_ERROR'));
          this.statusActivating.set(false);
        },
      });
  }

  badgeVariant(status: string): 'success' | 'neutral' | 'warning' {
    if (status === 'ACTIVE') return 'success';
    if (status === 'DRAFT') return 'warning';
    return 'neutral';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Category → line mapping
  // ════════════════════════════════════════════════════════════════════════════

  lines = signal<GroupCatalogueLineDto[]>([]);

  readonly lineOptions = computed<SelectOption[]>(() =>
    this.lines().map(l => ({ value: String(l.id), label: `${l.labelFr} (${l.code})` })));

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
          this.mappingError.set(err.error?.message ?? this.translate.instant('REPORTING.PL_CATALOGUE.LOAD_ERROR'));
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
    return this.lines().map(line => {
      const edit = this.editedMapping.get(line.code);
      return {
        id: line.code,
        categoryCode: line.code,
        categoryLabel: `${line.labelFr} (${line.code})`,
        targetLineId: edit?.catalogueLineId != null ? String(edit.catalogueLineId) : '',
        mappingRole: edit?.mappingRole ?? '',
        mapped: edit != null && edit.catalogueLineId != null && edit.mappingRole != null,
      };
    });
  });

  readonly mappingTableConfig = computed<TableConfig>(() => ({
    showHeader: true,
    loading: this.mappingLoading(),
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
    const unmapped = this.lines()
      .filter(l => {
        const e = this.editedMapping.get(l.code);
        return !e || e.catalogueLineId == null || e.mappingRole == null;
      })
      .map(l => l.code);
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
          this.mappingError.set(err.error?.message ?? this.translate.instant('REPORTING.PL_CATALOGUE.SAVE_ERROR'));
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
          this.mappingError.set(err.error?.message ?? this.translate.instant('REPORTING.PL_CATALOGUE.ACTIVATE_ERROR'));
          this.mappingActivating.set(false);
        },
      });
  }
}
