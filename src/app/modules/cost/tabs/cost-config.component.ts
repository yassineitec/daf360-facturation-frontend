import {
  Component, effect, inject, input, signal, computed, ViewChild, TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { CostService } from '../cost.service';
import { FactListService } from '../../../core/fact-list.service';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { CostImportPanelComponent } from '../import/cost-import-panel.component';
import {
  CostApprovalThresholdDto, ListValueDto, ListTypeDto, CreateCostApprovalThresholdRequest,
} from '../cost.model';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
  SelectComponent, SelectOption, TabsComponent, TabItem, ButtonComponent,
  FormFieldComponent, CheckboxComponent, StatusBadgeComponent, SectionTitleComponent,
  SectionCardComponent, ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';

type ListTab = 'CURRENCY' | 'COST_TYPE' | 'PAYMENT_METHOD' | 'RECURRENCE_FREQUENCY';
type ConfigSection = 'thresholds' | 'lists';

@Component({
  selector: 'app-cost-config',
  standalone: true,
  imports: [CommonModule, FormsModule, DataTableComponent, DafCellDirective, TranslatePipe,
            SelectComponent, TabsComponent, ButtonComponent, FormFieldComponent,
            CheckboxComponent, StatusBadgeComponent, SectionTitleComponent, SectionCardComponent,
            DisplayCurrencyPipe, CostImportPanelComponent],
  templateUrl: './cost-config.component.html',
  styleUrl: './cost-config.component.scss',
})
export class CostConfigComponent {
  private readonly svc         = inject(CostService);
  private readonly factListSvc = inject(FactListService);
  private readonly translate   = inject(TranslateService);
  private readonly modal       = inject(ModalService);

  @ViewChild('importTpl') importTpl!: TemplateRef<unknown>;
  private importModalRef: ModalRef | null = null;

  openImportModal(): void {
    this.importModalRef = this.modal.open({
      body: this.importTpl,
      size: 'lg',
      buttons: [
        { label: this.translate.instant('ADMIN.COMMON.CLOSE'), variant: 'secondary', action: r => r.close() },
      ],
    });
  }

  /**
   * Owned by the parent page (`admin-list.component`'s own pays picker) — this
   * component used to fetch and pick its own country, back when it was the standalone
   * `/finance/cost?tab=config` page. Now that it is embedded as one tab of a page that
   * already has a single pays picker at the top, a second independent one here would
   * desync from it (pick Egypt up top, land back on Tunisia's thresholds). One picker,
   * one source of truth.
   */
  paysId = input.required<number>();

  constructor() {
    effect(() => {
      const pid = this.paysId();
      if (!pid) return;
      this.editThreshold.set({});
      this.showAddThreshold.set(false);
      this.showAddValue.set(false);
      this.loadAll();
    });
  }

  // ── Thresholds ────────────────────────────────────────────────────────────
  thresholds           = signal<CostApprovalThresholdDto[]>([]);
  editThreshold        = signal<{ [id: number]: Partial<CostApprovalThresholdDto> }>({});
  thresholdSaving      = signal<number | null>(null);
  thresholdError       = signal<string | null>(null);
  showAddThreshold     = signal(false);
  isCreatingThreshold  = signal(false);
  createThresholdError = signal<string | null>(null);
  newThreshold = { level: 'L2', minAmountEur: null as number | null, maxAmountEur: null as number | null, approverRoleCode: '' };

  /** Fixed 4-level scale — plain strings, not a fetched list, so a static array beats
   * a computed() here (no i18n, no reactivity to track). */
  readonly levelOptions: SelectOption[] = [
    { value: 'L1', label: 'L1' },
    { value: 'L2', label: 'L2' },
    { value: 'L3', label: 'L3' },
    { value: 'L4', label: 'L4' },
  ];

  // Categories are not managed here any more: V84 made the COST_CATEGORY /
  // COST_SUB_CATEGORY lists (Admin → Listes) the single source, and retired the legacy
  // cost_categories table this section used to edit.

  // ── List management ───────────────────────────────────────────────────────
  activeListTab = signal<ListTab>('CURRENCY');
  listValues    = signal<ListValueDto[]>([]);
  listTypes     = signal<ListTypeDto[]>([]);
  listLoading   = signal(false);
  listError     = signal<string | null>(null);

  newValue      = { code: '', labelFr: '', labelEn: '', isDefault: false };
  showAddValue  = signal(false);
  isCreating  = signal(false);
  createError = signal<string | null>(null);

  readonly LIST_TABS: ListTab[] = ['CURRENCY', 'COST_TYPE', 'PAYMENT_METHOD', 'RECURRENCE_FREQUENCY'];

  listTabLabel(tab: ListTab): string {
    return this.translate.instant('COST.CONFIG.LIST_TAB.' + tab);
  }

  /** `.list-tab` hand-rolled pill row, replaced by `daf-tabs`. */
  readonly listTypeTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return this.LIST_TABS.map(tab => ({ id: tab, label: this.listTabLabel(tab) }));
  });

  onListTypeTabChange(id: string): void {
    this.selectListTab(id as ListTab);
  }

  isLoading   = signal(false);
  serverError = signal<string | null>(null);

  // ── Section strip (daf-tabs) ─────────────────────────────────────────────────
  // Seuils / Listes vivaient empilés en <section> l'un sous l'autre ; `daf-tabs` les
  // bascule en panneaux, un seul visible à la fois.
  activeConfigSection = signal<ConfigSection>('thresholds');

  readonly configSectionTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'thresholds', label: t('COST.CONFIG.THRESHOLDS_TITLE'),   icon: 'price_check' },
      { id: 'lists',      label: t('COST.CONFIG.LIST_VALUES_TITLE'),  icon: 'checklist'   },
    ];
  });

  // ── Tables (daf-data-table) ─────────────────────────────────────────────────

  readonly thresholdColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'level',            label: this.translate.instant('COST.CONFIG.TH_LEVEL'),   type: 'custom' },
      { key: 'approverRoleCode', label: this.translate.instant('COST.CONFIG.TH_ROLE'),    type: 'custom' },
      { key: 'minAmountEur',     label: this.translate.instant('COST.CONFIG.TH_MIN_EUR'), type: 'custom', align: 'right' },
      { key: 'maxAmountEur',     label: this.translate.instant('COST.CONFIG.TH_MAX_EUR'), type: 'custom', align: 'right' },
    ];
  });

  /** Row actions via `TableConfig.actions`, not a hand-rolled `dafCell="_actions"`
   * column — same convention as admin-list's `listTableConfig`. Four actions cover
   * the two row states (new-row draft vs. an existing row being edited in place);
   * `hidden` picks the right pair per row instead of branching inside a template. */
  readonly thresholdTableConfig = computed<TableConfig>(() => {
    const t = (key: string) => this.translate.instant(key);
    return {
      hoverable: true,
      emptyMessage: t('COST.CONFIG.THRESHOLD_EMPTY'),
      actions: [
        {
          id: 'save-new', icon: 'add', tooltip: t('COST.CONFIG.ADD'),
          hidden: row => !row['_isNew'],
          disabled: () => this.isCreatingThreshold(),
          onClick: () => this.saveNewThreshold(),
        },
        {
          id: 'cancel-new', icon: 'close', tooltip: t('COST.CONFIG.CANCEL'),
          hidden: row => !row['_isNew'],
          onClick: () => this.showAddThreshold.set(false),
        },
        {
          id: 'save-edit', icon: 'check', tooltip: t('COST.CONFIG.SAVE'),
          hidden: row => row['_isNew'] || !this.isThresholdEditing(row['id']),
          disabled: row => this.thresholdSaving() === row['id'],
          onClick: row => this.saveThreshold(row['_raw']),
        },
        {
          id: 'cancel-edit', icon: 'close', tooltip: t('COST.CONFIG.CANCEL'),
          hidden: row => row['_isNew'] || !this.isThresholdEditing(row['id']),
          onClick: row => this.cancelEdit(row['id']),
        },
        {
          id: 'edit', icon: 'edit', tooltip: t('COST.CONFIG.EDIT'),
          hidden: row => row['_isNew'] || this.isThresholdEditing(row['id']),
          onClick: row => this.startEdit(row['_raw']),
        },
        {
          id: 'delete', icon: 'delete', tooltip: t('COST.CONFIG.DEACTIVATE'), variant: 'danger',
          hidden: row => row['_isNew'] || this.isThresholdEditing(row['id']),
          onClick: row => this.deleteThreshold(row['id']),
        },
      ],
    };
  });

  readonly thresholdRows = computed(() => {
    const rows = this.thresholds().map(t => ({
      id:               t.id,
      level:            t.level,
      approverRoleCode: t.approverRoleCode,
      minAmountEur:     t.minAmountEur,
      maxAmountEur:     t.maxAmountEur,
      _isNew:           false,
      _raw:             t,
    }));
    if (this.showAddThreshold()) {
      rows.push({
        id: '__new-threshold__' as unknown as number, level: '', approverRoleCode: '',
        minAmountEur: null as unknown as number, maxAmountEur: null as unknown as number,
        _isNew: true, _raw: null as unknown as CostApprovalThresholdDto,
      });
    }
    return rows;
  });

  isThresholdEditing(id: number): boolean {
    const e = this.getEdit(id);
    return e.minAmountEur !== undefined || e.approverRoleCode !== undefined;
  }

  readonly listValueColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'code',         label: this.translate.instant('COST.CONFIG.LV_CODE'),     type: 'custom' },
      { key: 'labelFr',      label: this.translate.instant('COST.CONFIG.LV_LABEL_FR'), type: 'custom' },
      { key: 'labelEn',      label: this.translate.instant('COST.CONFIG.LV_LABEL_EN'), type: 'custom' },
      { key: 'isDefault',    label: this.translate.instant('COST.CONFIG.LV_DEFAULT'),  type: 'custom', align: 'center' },
      { key: 'displayOrder', label: this.translate.instant('COST.CONFIG.LV_ORDER'),    type: 'custom', align: 'center' },
    ];
  });

  readonly listValueTableConfig = computed<TableConfig>(() => {
    const t = (key: string) => this.translate.instant(key);
    return {
      hoverable: true,
      emptyMessage: t('COST.CONFIG.LIST_VALUE_EMPTY'),
      actions: [
        {
          id: 'save-new', icon: 'add', tooltip: t('COST.CONFIG.ADD'),
          hidden: row => !row['_isNew'],
          disabled: () => this.isCreating() || !this.newValue.code || !this.newValue.labelFr,
          onClick: () => this.createValue(),
        },
        {
          id: 'cancel-new', icon: 'close', tooltip: t('COST.CONFIG.CANCEL'),
          hidden: row => !row['_isNew'],
          onClick: () => this.showAddValue.set(false),
        },
        {
          id: 'delete', icon: 'close', tooltip: t('COST.CONFIG.DEACTIVATE'), variant: 'danger',
          hidden: row => !!row['_isNew'],
          onClick: row => this.deactivate(row['id']),
        },
      ],
    };
  });

  readonly listValueRows = computed(() => {
    const rows = this.listValues().map(v => ({
      id:            v.id,
      code:          v.code,
      labelFr:       v.labelFr,
      labelEn:       v.labelEn,
      isDefault:     v.isDefault,
      displayOrder:  v.displayOrder,
      _isNew:        false,
      _raw:          v,
    }));
    if (this.showAddValue()) {
      rows.push({
        id: '__new-value__' as unknown as number, code: '', labelFr: '', labelEn: null,
        isDefault: false, displayOrder: null as unknown as number, _isNew: true,
        _raw: null as unknown as ListValueDto,
      });
    }
    return rows;
  });

  private loadAll(): void {
    const pid = this.paysId();
    if (!pid) return;
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.getThresholds(pid).subscribe({
      next: thresholds => {
        this.thresholds.set(thresholds);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
    this.loadListTab(this.activeListTab());
  }

  // ── Threshold CRUD ────────────────────────────────────────────────────────

  getEdit(id: number): Partial<CostApprovalThresholdDto> {
    return this.editThreshold()[id] ?? {};
  }

  patchThreshold(id: number, field: string, value: string | number): void {
    this.editThreshold.update(m => ({ ...m, [id]: { ...m[id], [field]: value } }));
  }

  startEdit(t: CostApprovalThresholdDto): void {
    this.showAddThreshold.set(false);
    this.editThreshold.update(m => ({
      ...m,
      [t.id]: { minAmountEur: t.minAmountEur, maxAmountEur: t.maxAmountEur, approverRoleCode: t.approverRoleCode },
    }));
  }

  saveThreshold(t: CostApprovalThresholdDto): void {
    const patch = this.getEdit(t.id);
    if (!patch) return;
    this.thresholdSaving.set(t.id);
    this.thresholdError.set(null);
    this.svc.updateThreshold(t.id, patch as any).subscribe({
      next: updated => {
        this.thresholds.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.editThreshold.update(m => { const c = { ...m }; delete c[t.id]; return c; });
        this.thresholdSaving.set(null);
      },
      error: err => {
        this.thresholdError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.SAVE_ERROR'));
        this.thresholdSaving.set(null);
      },
    });
  }

  cancelEdit(id: number): void {
    this.editThreshold.update(m => { const c = { ...m }; delete c[id]; return c; });
  }

  saveNewThreshold(): void {
    if (!this.newThreshold.level || this.newThreshold.minAmountEur === null) {
      this.createThresholdError.set(this.translate.instant('COST.CONFIG.THRESHOLD_MIN_MAX_REQUIRED'));
      return;
    }
    const dto: CreateCostApprovalThresholdRequest = {
      paysId:           this.paysId(),
      level:            this.newThreshold.level,
      minAmountEur:     Number(this.newThreshold.minAmountEur),
      maxAmountEur:     this.newThreshold.maxAmountEur != null ? Number(this.newThreshold.maxAmountEur) : null,
      approverRoleCode: this.newThreshold.approverRoleCode || null,
    };
    this.isCreatingThreshold.set(true);
    this.createThresholdError.set(null);
    this.svc.createThreshold(dto).subscribe({
      next: created => {
        this.thresholds.update(list =>
          [...list, created].sort((a, b) => (a.minAmountEur as number) - (b.minAmountEur as number)),
        );
        this.newThreshold = { level: 'L2', minAmountEur: null, maxAmountEur: null, approverRoleCode: '' };
        this.showAddThreshold.set(false);
        this.isCreatingThreshold.set(false);
      },
      error: err => {
        this.createThresholdError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.CREATE_ERROR'));
        this.isCreatingThreshold.set(false);
      },
    });
  }

  deleteThreshold(id: number): void {
    if (!confirm(this.translate.instant('COST.CONFIG.CONFIRM_DEACTIVATE_THRESHOLD'))) return;
    this.svc.deactivateThreshold(id).subscribe({
      next: () => this.thresholds.update(list => list.filter(t => t.id !== id)),
      error: err => this.thresholdError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.DEACTIVATE_ERROR')),
    });
  }

  // ── List values ───────────────────────────────────────────────────────────

  selectListTab(tab: ListTab): void {
    this.activeListTab.set(tab);
    this.showAddValue.set(false);
    this.loadListTab(tab);
  }

  loadListTab(tab: ListTab): void {
    const pid = this.paysId();
    if (!pid) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.factListSvc.refreshListValues(tab, pid).subscribe({
      next: values => {
        this.listValues.set(values);
        this.listLoading.set(false);
      },
      error: err => {
        this.listError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.LOAD_ERROR'));
        this.listLoading.set(false);
      },
    });
  }

  createValue(): void {
    const pid = this.paysId();
    if (!this.newValue.code || !this.newValue.labelFr || !pid) return;
    this.isCreating.set(true);
    this.createError.set(null);
    this.factListSvc.createListValue(this.activeListTab(), {
      typeCode:  this.activeListTab(),
      paysId:    pid,
      code:      this.newValue.code,
      labelFr:   this.newValue.labelFr,
      labelEn:   this.newValue.labelEn || undefined,
      isDefault: this.newValue.isDefault,
    }).subscribe({
      next: created => {
        this.factListSvc.invalidateCache();
        this.listValues.update(list => [...list, created]);
        this.newValue = { code: '', labelFr: '', labelEn: '', isDefault: false };
        this.showAddValue.set(false);
        this.isCreating.set(false);
      },
      error: err => {
        this.createError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.CREATE_ERROR'));
        this.isCreating.set(false);
      },
    });
  }

  /**
   * Scoped to the country picked at the top of the admin page, exactly like Admin →
   * Listes: a global value is switched off for this country only (the backend writes an
   * inactive country row). Without `paysId` it used to be switched off for EVERY country.
   */
  deactivate(id: number): void {
    if (!confirm(this.translate.instant('COST.CONFIG.CONFIRM_DEACTIVATE_VALUE'))) return;
    this.factListSvc.deactivateListValue(id, this.paysId()).subscribe({
      next: () => {
        this.factListSvc.invalidateCache();
        this.listValues.update(list => list.filter(v => v.id !== id));
      },
      error: err => this.listError.set(err.error?.message ?? this.translate.instant('COST.CONFIG.GENERIC_ERROR')),
    });
  }
}
