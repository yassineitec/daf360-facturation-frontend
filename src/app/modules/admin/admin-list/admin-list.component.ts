import {
  Component, OnInit, inject, signal, computed, ViewChild, TemplateRef,
} from '@angular/core';
import { FormsModule }  from '@angular/forms';
import { forkJoin }     from 'rxjs';
import { FactRolesAdminComponent } from '../roles/fact-roles-admin.component';
import { ReminderRulesAdminComponent } from '../reminder-rules/reminder-rules-admin.component';
import { DocumentTemplatesAdminComponent } from '../document-templates/document-templates-admin.component';
import { CostConfigComponent } from '../../cost/tabs/cost-config.component';
import { PaysFlagSelectComponent, PaysFlagOption } from '../../../shared/pays-flag-select/pays-flag-select.component';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow,
  PaginationComponent, PaginationConfig, ButtonComponent, ModalService, ModalRef,
  SectionCardComponent, SectionTitleComponent, CardComponent,
  RadioGroupComponent, RadioGroupConfig, RadioOption,
  ToggleComponent, ToggleOptions,
  FormFieldComponent, StatusBadgeComponent,
  TabsComponent, TabItem, SearchToolbarComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { FactListService }    from '../../../core/fact-list.service';
import { ClientService }      from '../../clients/client.service';
import { ParameterSetService, ParameterSetDto } from '../../../core/parameter-set.service';
import { ForexApiConfigService, ForexApiStatusDto } from '../../../core/forex-api-config.service';
import { ListValueDto, ListTypeDto, TaxonomyFields } from '../../cost/cost.model';
import { PaysRefDto }         from '../../affaires/affaire.model';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserStore } from '../../../core/user.store';
type AdminTab = 'lists' | 'forex' | 'forex-api' | 'permissions' | 'document-templates' | 'cost-config' | 'reminders';

const PAGE_SIZE = 10;

const COST_CATEGORY_TYPE     = 'COST_CATEGORY';
const COST_SUB_CATEGORY_TYPE = 'COST_SUB_CATEGORY';

interface ValueForm {
  code: string;
  labelFr: string;
  labelEn: string;
  isDefault: boolean;
  requiresReceipt: boolean;
  // COST_SUB_CATEGORY — the parent is picked by CODE (see ListValueDto.parentValueCode)
  parentCode: string;
  // COST_CATEGORY
  sourceType: 'MANUAL' | 'AUTO_PUSH';
  autoPushModule: string;
  isStrictScrutiny: boolean;
  isDirect: boolean;
  isOverhead: boolean;
  isCapex: boolean;
  // COST_CATEGORY + COST_SUB_CATEGORY
  descriptionFr: string;
  descriptionEn: string;
}

function emptyValueForm(): ValueForm {
  return {
    code: '', labelFr: '', labelEn: '', isDefault: false, requiresReceipt: false,
    parentCode: '', sourceType: 'MANUAL', autoPushModule: '',
    isStrictScrutiny: false, isDirect: false, isOverhead: false, isCapex: false,
    descriptionFr: '', descriptionEn: '',
  };
}

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
    FormFieldComponent, StatusBadgeComponent, TranslatePipe, TabsComponent, SearchToolbarComponent,
    SelectComponent, PaysFlagSelectComponent,
    FactRolesAdminComponent, ReminderRulesAdminComponent, DocumentTemplatesAdminComponent,
    CostConfigComponent,
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
  private readonly userStore    = inject(UserStore);

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

  /** The two cost-taxonomy types carry extra fields (parent, source, strict scrutiny…). */
  readonly isCategoryType    = computed(() => this.activeListType() === COST_CATEGORY_TYPE);
  readonly isSubCategoryType = computed(() => this.activeListType() === COST_SUB_CATEGORY_TYPE);
  readonly isTaxonomyType    = computed(() => this.isCategoryType() || this.isSubCategoryType());

  readonly listColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const cols: TableColumn[] = [
      { key: 'code',      label: t('ADMIN.LISTS.COL_CODE'),      width: '120px' },
    ];
    if (this.isSubCategoryType()) {
      cols.push({ key: 'parent', label: t('ADMIN.LISTS.COL_PARENT') });
    }
    cols.push(
      { key: 'labelFr',   label: t('ADMIN.LISTS.COL_LABEL_FR') },
      { key: 'labelEn',   label: t('ADMIN.LISTS.COL_LABEL_EN') },
    );
    if (this.isCategoryType()) {
      cols.push(
        { key: 'sourceType',       label: t('ADMIN.LISTS.COL_SOURCE'), width: '170px' },
        { key: 'isStrictScrutiny', label: t('ADMIN.LISTS.COL_STRICT'), align: 'center', width: '130px' },
      );
    }
    if (this.isTaxonomyType()) {
      cols.push({ key: 'scope', label: t('ADMIN.LISTS.COL_SCOPE'), align: 'center', width: '110px' });
    }
    if (this.showsReceiptRule()) {
      cols.push({ key: 'requiresReceipt', label: t('ADMIN.LISTS.COL_RECEIPT'),
                  align: 'center', width: '130px' });
    }
    cols.push(
      { key: 'isDefault', label: this.translate.instant('ADMIN.LISTS.COL_DEFAULT'),   align: 'center', width: '90px' },
      { key: 'isActive',  label: this.translate.instant('ADMIN.LISTS.COL_STATUS'),    align: 'center', width: '90px' },
    );
    return cols;
  });

  readonly forexColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'code',     label: this.translate.instant('ADMIN.FOREX.COL_CODE'),  width: '100px' },
      { key: 'eur',      label: this.translate.instant('ADMIN.FOREX.COL_EUR'),   align: 'right', width: '180px' },
      { key: 'chf',      label: this.translate.instant('ADMIN.FOREX.COL_CHF'),   align: 'right', width: '200px' },
    ];
  });

  /** Native `TableConfig.actions`, not a hand-placed `_actions` column — same
   * convention as the Relances / Maquettes de documents tables on this page. */
  readonly listTableConfig = computed<TableConfig>(() => {
    const t = (key: string) => this.translate.instant(key);
    return {
      hoverable:    true,
      loading:      this.listLoading(),
      emptyMessage: t('ADMIN.LISTS.EMPTY'),
      actions: [
        {
          id: 'edit', icon: 'edit', tooltip: t('ADMIN.COMMON.EDIT'),
          onClick: row => this.openEditValueModal(row['_source'] as ListValueDto),
        },
        {
          id: 'deactivate', icon: 'toggle_on', tooltip: t('ADMIN.LISTS.DEACTIVATE'), variant: 'danger',
          hidden: row => !(row['_source'] as ListValueDto).isActive,
          onClick: row => this.deactivateValue(row['_source'] as ListValueDto),
        },
        {
          id: 'reactivate', icon: 'restart_alt', tooltip: t('ADMIN.LISTS.REACTIVATE'),
          hidden: row => (row['_source'] as ListValueDto).isActive,
          onClick: row => this.reactivateValue(row['_source'] as ListValueDto),
        },
      ],
    };
  });

  readonly forexTableConfig = computed<TableConfig>(() => {
    const t = (key: string) => this.translate.instant(key);
    return {
      hoverable:    true,
      loading:      this.forexLoading(),
      emptyMessage: t('ADMIN.FOREX.EMPTY'),
      actions: [
        {
          id: 'edit', icon: 'edit', tooltip: t('ADMIN.COMMON.EDIT'),
          onClick: row => this.openEditForexModal(row['_source'] as ForexRow),
        },
        {
          id: 'delete', icon: 'delete', tooltip: t('ADMIN.FOREX.DELETE_SHORT'), variant: 'danger',
          hidden: row => !(row['_source'] as ForexRow).eurParam,
          onClick: row => this.deleteForexParam((row['_source'] as ForexRow).eurParam!),
        },
      ],
    };
  });

  listCurrentPage  = signal(0);
  forexCurrentPage = signal(0);

  readonly listTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedListValues().length / PAGE_SIZE)));

  /** Sub-categories are grouped under their parent; every other list keeps backend order. */
  private readonly sortedListValues = computed(() => {
    const values = this.listValues();
    if (!this.isSubCategoryType()) return values;
    return [...values].sort((a, b) =>
      this.parentLabel(a.parentValueCode).localeCompare(this.parentLabel(b.parentValueCode))
      || (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  });

  readonly forexTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.forexRows().length / PAGE_SIZE)));

  onListPageChange(page: number): void  { this.listCurrentPage.set(page); }
  onForexPageChange(page: number): void { this.forexCurrentPage.set(page); }

  private readonly pagedListValues = computed(() => {
    const start = this.listCurrentPage() * PAGE_SIZE;
    return this.sortedListValues().slice(start, start + PAGE_SIZE);
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
      parent: this.parentLabel(v.parentValueCode),
      sourceType: v.sourceType ?? 'MANUAL',
      autoPushModule: v.autoPushModule,
      isStrictScrutiny: v.isStrictScrutiny === true,
      isGlobal: v.paysId === null,
      _source: v,
    })),
  );

  // ── Cost taxonomy (COST_CATEGORY / COST_SUB_CATEGORY) ─────────────────────
  /** The selected country's categories — parents offered to a sub-category. */
  parentCategories = signal<ListValueDto[]>([]);

  readonly parentOptions = computed<SelectOption[]>(() =>
    this.parentCategories()
      .filter(c => c.isActive)
      .map(c => ({ value: c.code, label: `${c.labelFr} (${c.code})` })));

  parentLabel(code: string | null | undefined): string {
    if (!code) return '—';
    return this.parentCategories().find(c => c.code === code)?.labelFr ?? code;
  }

  readonly sourceTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return [
      { value: 'MANUAL',    label: this.translate.instant('ADMIN.LISTS.SOURCE_MANUAL') },
      { value: 'AUTO_PUSH', label: this.translate.instant('ADMIN.LISTS.SOURCE_AUTO_PUSH') },
    ];
  });

  private loadParentCategories(): void {
    const paysId = this.paysId();
    if (!paysId || !this.isTaxonomyType()) { this.parentCategories.set([]); return; }
    this.factListSvc.getAdminListValues(COST_CATEGORY_TYPE, paysId)
      .subscribe(values => this.parentCategories.set(values));
  }

  /**
   * The taxonomy part of a create/update body, or an i18n error key. `undefined` fields
   * stay out of the JSON, which the backend reads as "unchanged".
   */
  private taxonomyBody(): TaxonomyFields | string {
    const f = this.valueForm;
    if (this.isSubCategoryType()) {
      const parent = this.parentCategories().find(c => c.code === f.parentCode && c.isActive);
      if (!parent) return 'ADMIN.LISTS.ERR_PARENT_REQUIRED';
      return {
        parentValueId: parent.id,
        descriptionFr: f.descriptionFr.trim(),
        descriptionEn: f.descriptionEn.trim(),
      };
    }
    if (this.isCategoryType()) {
      const autoPush = f.sourceType === 'AUTO_PUSH';
      if (autoPush && !f.autoPushModule.trim()) return 'ADMIN.LISTS.ERR_AUTO_PUSH_MODULE_REQUIRED';
      return {
        sourceType: f.sourceType,
        autoPushModule: autoPush ? f.autoPushModule.trim().toUpperCase() : undefined,
        isStrictScrutiny: f.isStrictScrutiny,
        isDirect: f.isDirect,
        isOverhead: f.isOverhead,
        isCapex: f.isCapex,
        descriptionFr: f.descriptionFr.trim(),
        descriptionEn: f.descriptionEn.trim(),
      };
    }
    return {};
  }

  readonly forexTableRows = computed<TableRow[]>(() =>
    this.pagedForexRows().map(r => ({
      code: r.code,
      eur:  r.eurParam?.paramValue ?? '—',
      chf:  r.chfParam ? r.chfParam.paramValue : `auto ${this.chfFallback(r)}`,
      chfAuto: !r.chfParam,
      _source: r,
    })),
  );

  readonly activeListTypeLabel = computed(() => {
    const t = this.listTypes().find(x => x.code === this.activeListType());
    return t ? this.listTypeLabel(t) : this.translate.instant('ADMIN.LISTS.DEFAULT_LABEL');
  });

  // ── Common ────────────────────────────────────────────────────────────────
  activeTab = signal<AdminTab>('lists');
  paysList  = signal<PaysRefDto[]>([]);
  paysId    = signal<number>(0);
  isLoading = signal(false);
  pageError = signal<string | null>(null);

  /** `daf-tabs`, not hand-rolled `.main-tab` buttons — permission-gated tabs are
   * filtered here (same checks `*appHasPermission` used to make) since the strip
   * takes a plain array, not a structural directive per item. */
  readonly mainTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const items: TabItem[] = [
      { id: 'lists',     label: t('ADMIN.TABS.LISTS'),     icon: 'checklist' },
      { id: 'forex',     label: t('ADMIN.TABS.FOREX'),     icon: 'currency_exchange' },
      { id: 'forex-api', label: t('ADMIN.TABS.FOREX_API'), icon: 'api' },
    ];
    if (this.userStore.hasPermission('FACT_VIEW_PAYMENT')) {
      items.push({ id: 'reminders', label: t('ADMIN.TABS.REMINDERS'), icon: 'notifications_active' });
    }
    if (this.userStore.hasPermission('FACT_SUPER_ADMIN')) {
      items.push({ id: 'permissions',         label: t('ADMIN.TABS.PERMISSIONS'),         icon: 'admin_panel_settings' });
      items.push({ id: 'document-templates',  label: t('ADMIN.TABS.DOCUMENT_TEMPLATES'),  icon: 'description' });
    }
    // Anciennement l'onglet « Config » de /finance/cost : déplacé ici, à côté des
    // Maquettes de documents. Ouvert aux mêmes profils que la route `cost` elle-même
    // (`FACT_ADMIN_COST`), en plus du super-admin — sinon un gestionnaire des coûts qui
    // pouvait configurer seuils/catégories perdrait l'accès en migrant vers /admin.
    if (this.userStore.hasPermission('FACT_SUPER_ADMIN') || this.userStore.hasPermission('FACT_ADMIN_COST')) {
      items.push({ id: 'cost-config', label: t('ADMIN.TABS.COST_CONFIG'), icon: 'tune' });
    }
    return items;
  });

  /** `forex-api` carries a side effect (loads status on entry) the plain tabs don't
   * have, so this can't be a bare `[(active)]` two-way binding — see openForexApiTab(). */
  onTabChange(id: string): void {
    if (id === 'forex-api') { this.openForexApiTab(); return; }
    this.activeTab.set(id as AdminTab);
  }

  // ── Pays / Entité dropdown ───────────────────────────────────────────────
  /**
   * Le code ISO reste dans le libellé en plus du drapeau : `app-pays-flag-select`
   * filtre sur le libellé, donc taper « TN » trouve toujours la Tunisie même pour un
   * pays sans drapeau connu (voir `country-flags.ts`).
   */
  readonly paysOptions = computed<PaysFlagOption[]>(() =>
    this.paysList().map(p => ({
      value: String(p.id),
      label: `${p.frenchLabel} (${p.isoCode})`,
      isoCode: p.isoCode,
    })));

  readonly paysSelectLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('ADMIN.PAYS.LABEL');
  });

  readonly paysSelectPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('ADMIN.PAYS.SEARCH');
  });

  onPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (Number.isFinite(id) && id > 0) this.selectPays(id);
  }

  /*
   * `flagUrl` vivait ici : elle construisait une URL vers flagcdn.com pour la vignette
   * de chaque pays de la liste déroulante maison. Elle disparaît avec elle — `daf-select`
   * affiche des libellés, pas des images, et plus rien dans l'application ne l'appelait.
   *
   * Accessoirement : c'était une requête vers un service externe par ligne de liste.
   * À onze pays, invisible ; à 194, un mur d'images tierces au premier clic.
   */

  // ── Lists tab ─────────────────────────────────────────────────────────────
  // `null` = the type-picker cards are showing; picking one opens that type's
  // values as its own page (back button to return to the cards).
  listTypes      = signal<ListTypeDto[]>([]);
  activeListType = signal<string | null>(null);
  listValues     = signal<ListValueDto[]>([]);
  listLoading    = signal(false);
  listError      = signal<string | null>(null);

  // Add/edit modal state
  valueModalMode  = signal<'create' | 'edit'>('create');
  valueModalSaving = signal(false);
  valueModalError  = signal<string | null>(null);
  private valueModalRef: ModalRef | null = null;
  private editingValue: ListValueDto | null = null;
  valueForm: ValueForm = emptyValueForm();

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
      myPays:     this.clientSvc.getMyPays(),
      allPays:    this.clientSvc.getPays(),
      paysInUse:  this.clientSvc.getPaysInUse(),
    }).subscribe({
      next: ({ myPays, allPays, paysInUse }) => {
        // TOUS les pays sont proposés, y compris ceux qui n'ont encore aucune donnée : c'est
        // précisément là qu'on vient créer une première valeur de liste, et un picker qui les
        // masque rend ce paramétrage impossible.
        //
        // Le picker les filtrait, d'abord par `/ref/users` puis par `/ref/pays/in-use`, et
        // c'était un cercle vicieux : un pays sans configuration n'apparaissait pas, donc on
        // ne pouvait pas le configurer, donc il n'apparaissait toujours pas.
        //
        // `/ref/pays/in-use` sert maintenant à l'ORDRE et non au filtre : les pays où DAF360
        // détient déjà quelque chose (compte, client, affaire, valeur de liste) sont remontés
        // en tête, les 194 autres suivent. La recherche du picker porte sur le libellé et le
        // code ISO, donc la queue de liste reste atteignable en deux frappes.
        const inUseIds = new Set(paysInUse.map(p => p.id));
        const pays = [
          ...allPays.filter(p => inUseIds.has(p.id)),
          ...allPays.filter(p => !inUseIds.has(p.id)),
        ];
        this.paysList.set(pays);
        const resolved = myPays ?? (pays.length > 0 ? pays[0].id : 0);
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
    this.loadParentCategories();
  }

  // ── Lists ──────────────────────────────────────────────────────────────────

  loadListTypes(): void {
    this.factListSvc.getAllListTypes().subscribe(types => this.listTypes.set(types));
  }

  /** One Material Symbol per known list type, by code — not translated (icons aren't
   * language-dependent). Falls back to the generic icon for any future type this
   * map hasn't been extended for yet. */
  private static readonly TYPE_ICONS: Record<string, string> = {
    RECURRENCE_FREQUENCY:     'repeat',
    COST_TYPE:                'category',
    PAYMENT_METHOD:           'credit_card',
    CURRENCY:                 'attach_money',
    SUPPLIER_TYPE:            'storefront',
    COST_LINE_ORIGIN:         'call_split',
    ACTIVITE:                 'work',
    COST_CATEGORY:            'sell',
    COST_SUB_CATEGORY:        'bookmark',
    SUPPLIER_CATEGORY:        'store',
    AFFAIRE_REPARTITION_TYPE: 'pie_chart',
    EXPENSE_CATEGORY:         'receipt_long',
    BILLING_PERIOD:           'calendar_month',
    BILLING_PERMISSION:       'admin_panel_settings',
    INVOICE_TYPE:             'description',
  };

  listTypeIcon(code: string): string {
    return AdminListComponent.TYPE_ICONS[code] ?? 'checklist';
  }

  /** Display-only correction over the backend's `labelFr` — the type PICKER card
   * title, nothing else reads through this. "Activité" only has one row's worth of
   * options showing here, but the card is a category label ("what this list is
   * about"), which reads better in the plural — same convention as the other 14
   * card titles ("Catégories de coût", "Modes de paiement"). Not a database fix:
   * `labelFr` itself is unchanged, so any other screen reading it is unaffected. */
  private static readonly TYPE_LABEL_OVERRIDE: Record<string, string> = {
    ACTIVITE: 'Activités',
  };

  listTypeLabel(t: ListTypeDto): string {
    return AdminListComponent.TYPE_LABEL_OVERRIDE[t.code] ?? t.labelFr;
  }

  /** Groups the 15 known list types into 4 categories, purely to give the type-picker
   * a `daf-tabs` filter above the card grid — codes not in this map fall under
   * 'general' rather than disappearing. */
  private static readonly TYPE_CATEGORY: Record<string, string> = {
    COST_TYPE:                'costs',
    COST_CATEGORY:            'costs',
    COST_SUB_CATEGORY:        'costs',
    COST_LINE_ORIGIN:         'costs',
    RECURRENCE_FREQUENCY:     'costs',
    BILLING_PERIOD:           'billing',
    INVOICE_TYPE:             'billing',
    AFFAIRE_REPARTITION_TYPE: 'billing',
    EXPENSE_CATEGORY:         'billing',
    BILLING_PERMISSION:       'billing',
    SUPPLIER_TYPE:            'suppliers',
    SUPPLIER_CATEGORY:        'suppliers',
    CURRENCY:                 'general',
    PAYMENT_METHOD:           'general',
    ACTIVITE:                 'general',
  };

  listCategoryFilter = signal<string>('all');
  listSearch = signal('');

  readonly listCategoryTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'all',       label: t('ADMIN.LISTS.CAT_ALL') },
      { id: 'costs',     label: t('ADMIN.LISTS.CAT_COSTS') },
      { id: 'billing',   label: t('ADMIN.LISTS.CAT_BILLING') },
      { id: 'suppliers', label: t('ADMIN.LISTS.CAT_SUPPLIERS') },
      { id: 'general',   label: t('ADMIN.LISTS.CAT_GENERAL') },
    ];
  });

  readonly filteredListTypes = computed<ListTypeDto[]>(() => {
    const cat = this.listCategoryFilter();
    const byCat = cat === 'all'
      ? this.listTypes()
      : this.listTypes().filter(t => (AdminListComponent.TYPE_CATEGORY[t.code] ?? 'general') === cat);
    const q = this.listSearch().trim().toLowerCase();
    if (!q) return byCat;
    return byCat.filter(t =>
      this.listTypeLabel(t).toLowerCase().includes(q)
      || this.listTypeDescription(t.code).toLowerCase().includes(q));
  });

  /** Short "what this list is for" line under the card title — falls back to the
   * bare code for any type not yet covered by ADMIN.LISTS.TYPE_DESC.*, rather than
   * showing ngx-translate's raw missing-key string. */
  listTypeDescription(code: string): string {
    const key = 'ADMIN.LISTS.TYPE_DESC.' + code;
    const translated = this.translate.instant(key);
    return translated === key ? code : translated;
  }

  selectListType(code: string): void {
    if (code === this.activeListType()) return;
    this.activeListType.set(code);
    this.listCurrentPage.set(0);
    this.loadListValues();
    this.loadParentCategories();
  }

  backToListTypes(): void {
    this.activeListType.set(null);
    this.listError.set(null);
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
    this.valueForm = emptyValueForm();
    this.valueModalError.set(null);
    this.openValueModal(this.translate.instant('ADMIN.LISTS.MODAL_ADD'));
  }

  openEditValueModal(v: ListValueDto): void {
    this.valueModalMode.set('edit');
    this.editingValue = v;
    this.valueForm = {
      code: v.code, labelFr: v.labelFr, labelEn: v.labelEn ?? '',
      isDefault: v.isDefault, requiresReceipt: v.requiresReceipt === true,
      parentCode: v.parentValueCode ?? '',
      sourceType: v.sourceType === 'AUTO_PUSH' ? 'AUTO_PUSH' : 'MANUAL',
      autoPushModule: v.autoPushModule ?? '',
      isStrictScrutiny: v.isStrictScrutiny === true,
      isDirect: v.isDirect === true,
      isOverhead: v.isOverhead === true,
      isCapex: v.isCapex === true,
      descriptionFr: v.descriptionFr ?? '',
      descriptionEn: v.descriptionEn ?? '',
    };
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
      const taxonomy = this.taxonomyBody();
      if (typeof taxonomy === 'string') {
        this.valueModalError.set(this.translate.instant(taxonomy));
        return;
      }
      this.valueModalSaving.set(true);
      this.valueModalError.set(null);
      // Non-null: this modal only opens from the detail view, reachable only once
      // a type card has been picked (see backToListTypes()/selectListType() above).
      const typeCode = this.activeListType()!;
      this.factListSvc.createListValue(typeCode, {
        typeCode, paysId, code, labelFr,
        labelEn: labelEn || undefined,
        isDefault: this.valueForm.isDefault,
        // Non envoye pour les autres types : la colonne reste NULL (= non applicable).
        ...(this.showsReceiptRule() ? { requiresReceipt: this.valueForm.requiresReceipt } : {}),
        ...taxonomy,
      }).subscribe({
        next: created => {
          this.listValues.update(list => [...list, created]);
          if (this.isCategoryType()) this.loadParentCategories();
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
      const taxonomy = this.taxonomyBody();
      if (typeof taxonomy === 'string') {
        this.valueModalError.set(this.translate.instant(taxonomy));
        return;
      }
      this.valueModalSaving.set(true);
      this.valueModalError.set(null);
      this.factListSvc.updateListValue(v.id, paysId, {
        // label_en is NOT NULL server-side: an emptied EN field falls back to the FR label.
        labelFr, labelEn: labelEn || labelFr,
        ...(this.showsReceiptRule() ? { requiresReceipt: this.valueForm.requiresReceipt } : {}),
        ...taxonomy,
      }).subscribe({
        next: updated => {
          // v.id and updated.id may differ when a global value was overridden with a country copy
          this.listValues.update(list => [...list.filter(x => x.id !== v.id), updated]);
          if (this.isCategoryType()) this.loadParentCategories();
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

  /**
   * Scoped to the selected country: a GLOBAL value is switched off for this country only
   * (the backend writes an inactive country row, with a new id), so the list is reloaded
   * rather than patched in place.
   */
  private doDeactivateValue(v: ListValueDto): void {
    this.factListSvc.deactivateListValue(v.id, this.paysId()).subscribe({
      next: () => {
        this.loadListValues();
        if (this.isCategoryType()) this.loadParentCategories();
      },
      error: err => this.listError.set(err.error?.message ?? this.translate.instant('ADMIN.LISTS.ERR_GENERIC')),
    });
  }

  reactivateValue(v: ListValueDto): void {
    this.factListSvc.updateListValue(v.id, this.paysId(), { isActive: true }).subscribe({
      next: () => {
        this.loadListValues();
        if (this.isCategoryType()) this.loadParentCategories();
      },
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
