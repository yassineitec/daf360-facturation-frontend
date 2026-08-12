import {
  Component, OnInit, inject, signal, computed, ViewChild, TemplateRef,
} from '@angular/core';
import { FormsModule }  from '@angular/forms';
import { forkJoin }     from 'rxjs';
import { PermissionDirective } from '../../../shared/permission.directive';
import { FactRolesAdminComponent } from '../roles/fact-roles-admin.component';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow,
  PaginationComponent, PaginationConfig, ButtonComponent, ModalService, ModalRef,
  SectionCardComponent, SectionTitleComponent, CardComponent,
  RadioGroupComponent, RadioGroupConfig, RadioOption,
  ToggleComponent, ToggleOptions,
  FormFieldComponent, StatusBadgeComponent,
} from '@khalilrebhiitec/daf360';
import { FactListService }    from '../../../core/fact-list.service';
import { ClientService }      from '../../clients/client.service';
import { ParameterSetService, ParameterSetDto } from '../../../core/parameter-set.service';
import { ForexApiConfigService, ForexApiStatusDto } from '../../../core/forex-api-config.service';
import { ListValueDto, ListTypeDto } from '../../cost/cost.model';
import { PaysRefDto }         from '../../affaires/affaire.model';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';

type AdminTab = 'lists' | 'forex' | 'forex-api' | 'permissions';

const PAGE_SIZE = 10;

interface ForexRow {
  code: string;
  eurParam: ParameterSetDto | null;
  chfParam: ParameterSetDto | null;
}

@Component({
  selector: 'app-admin-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    DataTableComponent, DafCellDirective, PaginationComponent, ButtonComponent, CardComponent,
    SectionCardComponent, SectionTitleComponent, RadioGroupComponent, ToggleComponent,
    FormFieldComponent, StatusBadgeComponent, TranslatePipe,
    PermissionDirective, FactRolesAdminComponent,
  ],
  templateUrl: './admin-list.component.html',
  styleUrl: './admin-list.component.scss',
})
export class AdminListComponent implements OnInit {
  private readonly factListSvc  = inject(FactListService);
  private readonly clientSvc    = inject(ClientService);
  private readonly paramSvc     = inject(ParameterSetService);
  private readonly forexApiSvc  = inject(ForexApiConfigService);
  private readonly modal        = inject(ModalService);
  private readonly translate    = inject(TranslateService);

  @ViewChild('valueFormTpl') valueFormTpl!: TemplateRef<unknown>;
  @ViewChild('forexFormTpl') forexFormTpl!: TemplateRef<unknown>;

  // ── Table / pagination (daf360 lib) ─────────────────────────────────────────
  readonly paginationConfig: PaginationConfig = {
    showFirstLast: true,
    showPrevNext:  true,
    maxVisible:    5,
    size:          'sm',
  };

  /**
   * Le type de liste dont les valeurs portent une règle de justificatif. La colonne et le
   * champ correspondants n'apparaissent que pour lui : ailleurs, `requiresReceipt` est
   * `null` et une colonne toujours vide n'apprendrait rien.
   */
  private static readonly RECEIPT_RULE_TYPE = 'EXPENSE_CATEGORY';

  readonly showsReceiptRule = computed(() =>
    this.activeListType() === AdminListComponent.RECEIPT_RULE_TYPE);

  readonly listColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const cols: TableColumn[] = [
      { key: 'code',      label: this.translate.instant('ADMIN.LISTS.COL_CODE'),      width: '120px' },
      { key: 'labelFr',   label: this.translate.instant('ADMIN.LISTS.COL_LABEL_FR') },
      { key: 'labelEn',   label: this.translate.instant('ADMIN.LISTS.COL_LABEL_EN') },
    ];
    if (this.showsReceiptRule()) {
      cols.push({ key: 'requiresReceipt', label: this.translate.instant('ADMIN.LISTS.COL_RECEIPT'),
                  align: 'center', width: '130px' });
    }
    cols.push(
      { key: 'isDefault', label: this.translate.instant('ADMIN.LISTS.COL_DEFAULT'),   align: 'center', width: '90px' },
      { key: 'isActive',  label: this.translate.instant('ADMIN.LISTS.COL_STATUS'),    align: 'center', width: '90px' },
      { key: '_actions',  label: this.translate.instant('ADMIN.COMMON.ACTIONS'),      align: 'right',  width: '150px' },
    );
    return cols;
  });

  readonly forexColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'code',     label: this.translate.instant('ADMIN.FOREX.COL_CODE'),  width: '100px' },
      { key: 'eur',      label: this.translate.instant('ADMIN.FOREX.COL_EUR'),   align: 'right', width: '180px' },
      { key: 'chf',      label: this.translate.instant('ADMIN.FOREX.COL_CHF'),   align: 'right', width: '200px' },
      { key: '_actions', label: this.translate.instant('ADMIN.COMMON.ACTIONS'),  align: 'right', width: '150px' },
    ];
  });

  readonly listTableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.listLoading(),
    emptyMessage: this.translate.instant('ADMIN.LISTS.EMPTY'),
  }));

  readonly forexTableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.forexLoading(),
    emptyMessage: this.translate.instant('ADMIN.FOREX.EMPTY'),
  }));

  listCurrentPage  = signal(0);
  forexCurrentPage = signal(0);

  readonly listTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.listValues().length / PAGE_SIZE)));

  readonly forexTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.forexRows().length / PAGE_SIZE)));

  onListPageChange(page: number): void  { this.listCurrentPage.set(page); }
  onForexPageChange(page: number): void { this.forexCurrentPage.set(page); }

  private readonly pagedListValues = computed(() => {
    const start = this.listCurrentPage() * PAGE_SIZE;
    return this.listValues().slice(start, start + PAGE_SIZE);
  });

  private readonly pagedForexRows = computed(() => {
    const start = this.forexCurrentPage() * PAGE_SIZE;
    return this.forexRows().slice(start, start + PAGE_SIZE);
  });

  readonly listRows = computed<TableRow[]>(() =>
    this.pagedListValues().map(v => ({
      id: v.id, code: v.code, labelFr: v.labelFr, labelEn: v.labelEn,
      isDefault: v.isDefault, isActive: v.isActive,
      requiresReceipt: v.requiresReceipt === true,
      _source: v,
    })),
  );

  readonly forexTableRows = computed<TableRow[]>(() =>
    this.pagedForexRows().map(r => ({
      code: r.code,
      eur:  r.eurParam?.paramValue ?? '—',
      chf:  r.chfParam ? r.chfParam.paramValue : `auto ${this.chfFallback(r)}`,
      chfAuto: !r.chfParam,
      _source: r,
    })),
  );

  readonly activeListTypeLabel = computed(() =>
    this.listTypes().find(t => t.code === this.activeListType())?.labelFr
      ?? this.translate.instant('ADMIN.LISTS.DEFAULT_LABEL'));

  // ── Common ────────────────────────────────────────────────────────────────
  activeTab = signal<AdminTab>('lists');
  paysList  = signal<PaysRefDto[]>([]);
  paysId    = signal<number>(0);
  isLoading = signal(false);
  pageError = signal<string | null>(null);

  // ── Pays / Entité dropdown ───────────────────────────────────────────────
  paysDropdownOpen = signal(false);
  paysSearch       = signal('');

  readonly selectedPays = computed(() =>
    this.paysList().find(p => p.id === this.paysId()) ?? null);

  readonly filteredPaysList = computed(() => {
    const q = this.paysSearch().trim().toLowerCase();
    if (!q) return this.paysList();
    return this.paysList().filter(p =>
      p.frenchLabel.toLowerCase().includes(q) || p.isoCode.toLowerCase().includes(q));
  });

  togglePaysDropdown(): void {
    this.paysDropdownOpen.update(v => !v);
    if (this.paysDropdownOpen()) this.paysSearch.set('');
  }

  closePaysDropdown(): void {
    this.paysDropdownOpen.set(false);
  }

  selectPaysFromDropdown(id: number): void {
    this.selectPays(id);
    this.closePaysDropdown();
  }

  flagUrl(isoCode: string): string {
    return `https://flagcdn.com/24x18/${isoCode.toLowerCase()}.png`;
  }

  // ── Lists tab ─────────────────────────────────────────────────────────────
  listTypes      = signal<ListTypeDto[]>([]);
  activeListType = signal<string>('CURRENCY');
  listValues     = signal<ListValueDto[]>([]);
  listLoading    = signal(false);
  listError      = signal<string | null>(null);

  // Add/edit modal state
  valueModalMode  = signal<'create' | 'edit'>('create');
  valueModalSaving = signal(false);
  valueModalError  = signal<string | null>(null);
  private valueModalRef: ModalRef | null = null;
  private editingValue: ListValueDto | null = null;
  valueForm: { code: string; labelFr: string; labelEn: string; isDefault: boolean; requiresReceipt: boolean } =
    { code: '', labelFr: '', labelEn: '', isDefault: false, requiresReceipt: false };

  // ── Forex tab ─────────────────────────────────────────────────────────────
  allParams    = signal<ParameterSetDto[]>([]);
  forexLoading = signal(false);
  forexError   = signal<string | null>(null);

  // Add/edit modal state
  forexModalMode   = signal<'create' | 'edit'>('create');
  forexModalSaving = signal(false);
  forexModalError  = signal<string | null>(null);
  private forexModalRef: ModalRef | null = null;
  private editingForexRow: ForexRow | null = null;
  forexForm: { code: string; eur: string; chf: string } = { code: '', eur: '', chf: '' };

  forexRows = computed<ForexRow[]>(() => {
    const params = this.allParams();
    const eurMap = new Map(
      params.filter(p => p.paramKey.startsWith('RATE_EUR_'))
            .map(p => [p.paramKey.replace('RATE_EUR_', ''), p]),
    );
    const chfMap = new Map(
      params.filter(p => p.paramKey.startsWith('RATE_CHF_'))
            .map(p => [p.paramKey.replace('RATE_CHF_', ''), p]),
    );
    const codes = new Set([...eurMap.keys(), ...chfMap.keys()]);
    return [...codes].sort().map(code => ({
      code,
      eurParam: eurMap.get(code) ?? null,
      chfParam: chfMap.get(code) ?? null,
    }));
  });

  ngOnInit(): void {
    this.isLoading.set(true);
    forkJoin({
      myPays:  this.clientSvc.getMyPays(),
      allPays: this.clientSvc.getPays(),
    }).subscribe({
      next: ({ myPays, allPays }) => {
        this.paysList.set(allPays);
        const resolved = myPays ?? (allPays.length > 0 ? allPays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.loadListTypes();
          this.loadListValues();
          this.loadForex();
        } else {
          this.pageError.set(this.translate.instant('ADMIN.PAGE.ERR_NO_PAYS'));
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.pageError.set(this.translate.instant('ADMIN.PAGE.ERR_LOAD_CONFIG'));
        this.isLoading.set(false);
      },
    });
  }

  selectPays(id: number): void {
    if (id === this.paysId()) return;
    this.paysId.set(id);
    this.listCurrentPage.set(0);
    this.loadListValues();
  }

  // ── Lists ──────────────────────────────────────────────────────────────────

  loadListTypes(): void {
    this.factListSvc.getAllListTypes().subscribe(types => this.listTypes.set(types));
  }

  selectListType(code: string): void {
    if (code === this.activeListType()) return;
    this.activeListType.set(code);
    this.listCurrentPage.set(0);
    this.loadListValues();
  }

  loadListValues(): void {
    const typeCode = this.activeListType();
    const paysId   = this.paysId();
    if (!typeCode || !paysId) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.factListSvc.getAdminListValues(typeCode, paysId).subscribe({
      next: values => {
        this.listValues.set(values);
        this.listLoading.set(false);
      },
      error: err => {
        this.listError.set(err.error?.message ?? this.translate.instant('ADMIN.LISTS.ERR_LOAD'));
        this.listLoading.set(false);
      },
    });
  }

  openCreateValueModal(): void {
    this.valueModalMode.set('create');
    this.editingValue = null;
    this.valueForm = { code: '', labelFr: '', labelEn: '', isDefault: false, requiresReceipt: false };
    this.valueModalError.set(null);
    this.openValueModal(this.translate.instant('ADMIN.LISTS.MODAL_ADD'));
  }

  openEditValueModal(v: ListValueDto): void {
    this.valueModalMode.set('edit');
    this.editingValue = v;
    this.valueForm = { code: v.code, labelFr: v.labelFr, labelEn: v.labelEn ?? '', isDefault: v.isDefault, requiresReceipt: v.requiresReceipt === true };
    this.valueModalError.set(null);
    this.openValueModal(this.translate.instant('ADMIN.LISTS.MODAL_EDIT', { code: v.code }));
  }

  private openValueModal(title: string): void {
    this.valueModalRef = this.modal.open({
      title,
      body: this.valueFormTpl,
      size: 'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('ADMIN.COMMON.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label:  this.valueModalMode() === 'create' ? this.translate.instant('ADMIN.COMMON.CREATE') : this.translate.instant('ADMIN.COMMON.SAVE'),
          variant: 'primary',
          action: () => this.submitValueModal(),
        },
      ],
    });
  }

  submitValueModal(): void {
    if (this.valueModalSaving()) return;
    const paysId   = this.paysId();
    const labelFr  = this.valueForm.labelFr.trim();
    const labelEn  = this.valueForm.labelEn.trim();

    if (this.valueModalMode() === 'create') {
      const code = this.valueForm.code.trim().toUpperCase();
      if (!code || !labelFr || !paysId) {
        this.valueModalError.set(this.translate.instant('ADMIN.LISTS.ERR_CODE_LABEL_REQUIRED'));
        return;
      }
      this.valueModalSaving.set(true);
      this.valueModalError.set(null);
      const typeCode = this.activeListType();
      this.factListSvc.createListValue(typeCode, {
        typeCode, paysId, code, labelFr,
        labelEn: labelEn || undefined,
        isDefault: this.valueForm.isDefault,
        // Non envoye pour les autres types : la colonne reste NULL (= non applicable).
        ...(this.showsReceiptRule() ? { requiresReceipt: this.valueForm.requiresReceipt } : {}),
      }).subscribe({
        next: created => {
          this.listValues.update(list => [...list, created]);
          this.valueModalSaving.set(false);
          this.valueModalRef?.close();
        },
        error: err => {
          this.valueModalError.set(err.error?.message ?? this.translate.instant('ADMIN.LISTS.ERR_CREATE'));
          this.valueModalSaving.set(false);
        },
      });
    } else {
      const v = this.editingValue;
      if (!v || !labelFr) {
        this.valueModalError.set(this.translate.instant('ADMIN.LISTS.ERR_LABEL_FR_REQUIRED'));
        return;
      }
      this.valueModalSaving.set(true);
      this.valueModalError.set(null);
      this.factListSvc.updateListValue(v.id, paysId, {
        labelFr, labelEn,
        ...(this.showsReceiptRule() ? { requiresReceipt: this.valueForm.requiresReceipt } : {}),
      }).subscribe({
        next: updated => {
          // v.id and updated.id may differ when a global value was overridden with a country copy
          this.listValues.update(list => [...list.filter(x => x.id !== v.id), updated]);
          this.valueModalSaving.set(false);
          this.valueModalRef?.close();
        },
        error: err => {
          this.valueModalError.set(err.error?.message ?? this.translate.instant('ADMIN.LISTS.ERR_SAVE'));
          this.valueModalSaving.set(false);
        },
      });
    }
  }

  deactivateValue(v: ListValueDto): void {
    this.modal.open({
      title: this.translate.instant('ADMIN.LISTS.DEACTIVATE_TITLE'),
      body:  this.translate.instant('ADMIN.LISTS.DEACTIVATE_CONFIRM', { code: v.code }),
      size:  'sm',
      buttons: [
        { label: this.translate.instant('ADMIN.COMMON.CANCEL'),    variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('ADMIN.LISTS.DEACTIVATE'), variant: 'primary',   action: r => { this.doDeactivateValue(v); r.close(); } },
      ],
    });
  }

  private doDeactivateValue(v: ListValueDto): void {
    this.factListSvc.deactivateListValue(v.id).subscribe({
      next: () => this.listValues.update(list =>
        list.map(x => x.id === v.id ? { ...x, isActive: false } : x),
      ),
      error: err => this.listError.set(err.error?.message ?? this.translate.instant('ADMIN.LISTS.ERR_GENERIC')),
    });
  }

  reactivateValue(v: ListValueDto): void {
    this.factListSvc.updateListValue(v.id, this.paysId(), { isActive: true }).subscribe({
      next: updated => this.listValues.update(list => [
        ...list.filter(x => x.id !== v.id),
        updated,
      ]),
      error: err => this.listError.set(err.error?.message ?? this.translate.instant('ADMIN.LISTS.ERR_GENERIC')),
    });
  }

  // ── Forex ──────────────────────────────────────────────────────────────────

  loadForex(): void {
    this.forexLoading.set(true);
    this.forexError.set(null);
    this.paramSvc.getAll().subscribe({
      next: params => {
        this.allParams.set(params);
        this.forexLoading.set(false);
      },
      error: err => {
        this.forexError.set(err.error?.message ?? this.translate.instant('ADMIN.FOREX.ERR_LOAD'));
        this.forexLoading.set(false);
      },
    });
  }

  openCreateForexModal(): void {
    this.forexModalMode.set('create');
    this.editingForexRow = null;
    this.forexForm = { code: '', eur: '', chf: '' };
    this.forexModalError.set(null);
    this.openForexModal(this.translate.instant('ADMIN.FOREX.MODAL_ADD'));
  }

  openEditForexModal(row: ForexRow): void {
    this.forexModalMode.set('edit');
    this.editingForexRow = row;
    this.forexForm = { code: row.code, eur: row.eurParam?.paramValue ?? '', chf: row.chfParam?.paramValue ?? '' };
    this.forexModalError.set(null);
    this.openForexModal(this.translate.instant('ADMIN.FOREX.MODAL_EDIT', { code: row.code }));
  }

  private openForexModal(title: string): void {
    this.forexModalRef = this.modal.open({
      title,
      body: this.forexFormTpl,
      size: 'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('ADMIN.COMMON.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label:  this.forexModalMode() === 'create' ? this.translate.instant('ADMIN.COMMON.CREATE') : this.translate.instant('ADMIN.COMMON.SAVE'),
          variant: 'primary',
          action: () => this.submitForexModal(),
        },
      ],
    });
  }

  submitForexModal(): void {
    if (this.forexModalSaving()) return;
    const mode    = this.forexModalMode();
    const code    = this.forexForm.code.trim().toUpperCase();
    const eurRate = this.forexForm.eur.trim();
    const chfRate = this.forexForm.chf.trim();

    if (!code || !eurRate) {
      this.forexModalError.set(this.translate.instant('ADMIN.FOREX.ERR_CODE_EUR_REQUIRED'));
      return;
    }
    if (isNaN(Number(eurRate)) || Number(eurRate) <= 0) {
      this.forexModalError.set(this.translate.instant('ADMIN.FOREX.ERR_EUR_INVALID'));
      return;
    }
    if (chfRate && (isNaN(Number(chfRate)) || Number(chfRate) <= 0)) {
      this.forexModalError.set(this.translate.instant('ADMIN.FOREX.ERR_CHF_INVALID'));
      return;
    }
    if (mode === 'create' && this.allParams().some(p => p.paramKey === `RATE_EUR_${code}`)) {
      this.forexModalError.set(this.translate.instant('ADMIN.FOREX.ERR_EUR_EXISTS', { code }));
      return;
    }

    const ops = [
      this.paramSvc.upsert({ paramKey: `RATE_EUR_${code}`, paramValue: eurRate, description: `1 ${code} en EUR` }),
    ];
    if (chfRate) {
      ops.push(this.paramSvc.upsert({ paramKey: `RATE_CHF_${code}`, paramValue: chfRate, description: `1 ${code} en CHF` }));
    }
    this.forexModalSaving.set(true);
    this.forexModalError.set(null);
    forkJoin(ops).subscribe({
      next: results => {
        results.forEach(updated => {
          this.allParams.update(list => {
            const idx = list.findIndex(p => p.paramKey === updated.paramKey);
            return idx >= 0
              ? list.map(p => p.paramKey === updated.paramKey ? updated : p)
              : [...list, updated];
          });
        });
        this.forexModalSaving.set(false);
        this.forexModalRef?.close();
      },
      error: err => {
        this.forexModalError.set(err.error?.message ?? this.translate.instant('ADMIN.FOREX.ERR_SAVE'));
        this.forexModalSaving.set(false);
      },
    });
  }

  deleteForexParam(param: ParameterSetDto): void {
    this.modal.open({
      title: this.translate.instant('ADMIN.FOREX.DELETE_TITLE'),
      body:  this.translate.instant('ADMIN.FOREX.DELETE_CONFIRM', { key: param.paramKey }),
      size:  'sm',
      buttons: [
        { label: this.translate.instant('ADMIN.COMMON.CANCEL'),           variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('ADMIN.FOREX.DELETE_CONFIRM_BTN'), variant: 'primary',   action: r => { this.doDeleteForexParam(param); r.close(); } },
      ],
    });
  }

  private doDeleteForexParam(param: ParameterSetDto): void {
    this.paramSvc.delete(param.id).subscribe({
      next: () => this.allParams.update(list => list.filter(p => p.id !== param.id)),
      error: err => this.forexError.set(err.error?.message ?? this.translate.instant('ADMIN.FOREX.ERR_DELETE')),
    });
  }

  // ── Forex API config tab ──────────────────────────────────────────────────

  forexApiProvider    = signal<string>('frankfurter');
  forexApiKey         = signal<string>('');
  forexApiCurrencies  = signal<string>('');
  forexApiAutoRefresh = signal<boolean>(false);
  forexApiSaving      = signal(false);
  forexRefreshing     = signal(false);
  forexApiError       = signal<string | null>(null);
  forexApiSuccess     = signal<string | null>(null);
  forexApiStatus      = signal<ForexApiStatusDto | null>(null);
  forexApiStatusLoading = signal(false);

  readonly forexProviderOptions = computed<RadioOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'frankfurter', label: 'Frankfurter', hint: this.translate.instant('ADMIN.FOREX_API.FRANKFURTER_HINT') },
      { value: 'fixer',       label: 'Fixer.io',     hint: this.translate.instant('ADMIN.FOREX_API.FIXER_HINT') },
    ];
  });
  readonly forexProviderConfig = computed<RadioGroupConfig>(() => {
    this.translate.currentLang();
    return { label: this.translate.instant('ADMIN.FOREX_API.PROVIDER_LABEL') };
  });
  readonly forexAutoRefreshOptions = computed<ToggleOptions>(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('ADMIN.FOREX_API.AUTO_REFRESH_LABEL'),
      hint:  this.translate.instant('ADMIN.FOREX_API.AUTO_REFRESH_HINT'),
    };
  });

  openForexApiTab(): void {
    this.activeTab.set('forex-api');
    this.forexApiError.set(null);
    this.forexApiSuccess.set(null);
    this.forexApiStatusLoading.set(true);
    this.forexApiSvc.getStatus().subscribe({
      next: s => {
        this.forexApiStatus.set(s);
        this.forexApiProvider.set(s.provider);
        this.forexApiAutoRefresh.set(s.autoRefresh);
        this.forexApiCurrencies.set(s.targetCurrencies);
        this.forexApiKey.set('');
        this.forexApiStatusLoading.set(false);
      },
      error: () => this.forexApiStatusLoading.set(false),
    });
  }

  saveForexApiConfig(): void {
    const toSave = [
      { paramKey: 'FOREX_API_PROVIDER',       paramValue: this.forexApiProvider(),                   description: 'Fournisseur API forex' },
      { paramKey: 'FOREX_AUTO_REFRESH',        paramValue: this.forexApiAutoRefresh() ? 'true' : 'false', description: 'Rafraîchissement automatique des taux' },
      { paramKey: 'FOREX_TARGET_CURRENCIES',   paramValue: this.forexApiCurrencies().trim(),           description: 'Devises cibles (séparées par virgule)' },
    ];
    const newKey = this.forexApiKey().trim();
    if (newKey) {
      toSave.push({ paramKey: 'FOREX_API_KEY', paramValue: newKey, description: 'Clé API forex' });
    }
    this.forexApiSaving.set(true);
    this.forexApiError.set(null);
    this.forexApiSuccess.set(null);
    forkJoin(toSave.map(dto => this.paramSvc.upsert(dto))).subscribe({
      next: results => {
        results.forEach(updated => {
          this.allParams.update(list => {
            const idx = list.findIndex(p => p.paramKey === updated.paramKey);
            return idx >= 0
              ? list.map(p => p.paramKey === updated.paramKey ? updated : p)
              : [...list, updated];
          });
        });
        this.forexApiStatus.update(s => s ? {
          ...s,
          provider:         this.forexApiProvider(),
          autoRefresh:      this.forexApiAutoRefresh(),
          targetCurrencies: this.forexApiCurrencies(),
          hasApiKey:        s.hasApiKey || !!newKey,
        } : s);
        this.forexApiKey.set('');
        this.forexApiSuccess.set(this.translate.instant('ADMIN.FOREX_API.SUCCESS_SAVED'));
        this.forexApiSaving.set(false);
      },
      error: err => {
        this.forexApiError.set(err.error?.message ?? this.translate.instant('ADMIN.FOREX_API.ERR_SAVE'));
        this.forexApiSaving.set(false);
      },
    });
  }

  triggerForexRefresh(): void {
    this.forexRefreshing.set(true);
    this.forexApiError.set(null);
    this.forexApiSuccess.set(null);
    this.forexApiSvc.refresh().subscribe({
      next: result => {
        if (result.success) {
          this.forexApiSuccess.set(result.message);
          this.loadForex();
        } else {
          this.forexApiError.set(result.message);
        }
        this.forexApiStatus.update(s => s ? {
          ...s,
          lastRefreshAt:     result.refreshedAt,
          lastRefreshStatus: result.success
            ? 'success:' + result.ratesUpdated + ' taux mis à jour'
            : 'error:' + result.message,
        } : s);
        this.forexRefreshing.set(false);
      },
      error: err => {
        this.forexApiError.set(err.error?.message ?? this.translate.instant('ADMIN.FOREX_API.ERR_REFRESH'));
        this.forexRefreshing.set(false);
      },
    });
  }

  chfFallback(row: ForexRow): string {
    if (!row.eurParam) return '—';
    const eur = parseFloat(row.eurParam.paramValue);
    return isNaN(eur) ? '—' : (eur * 0.965).toFixed(6);
  }
}
