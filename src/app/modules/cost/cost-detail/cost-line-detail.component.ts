import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import {
  ButtonComponent, DafCellDirective, DataTableComponent,
  MetricCardComponent, ModalService, PageComponent, PageHeaderComponent, SectionCardComponent,
  StatusBadgeComponent, TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, MetricCardOptions, MetricDelta, PageHeaderBadge,
  TabItem, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { CostService } from '../cost.service';
import { AffaireService } from '../../affaires/affaire.service';
import { ClientService } from '../../clients/client.service';
import type { UserRefDto } from '../../affaires/affaire.model';
import { CostCategoryDto, CostLineDto, SupplierCostSummaryDto, SupplierLedgerDto } from '../cost.model';
import {
  APPROVAL_BADGE_VARIANT, DECISION_BADGE_VARIANT, DECISION_ICON, STATUS_BADGE_VARIANT,
  approvalLevelKey, canEdit, decisionKey, formatDate, statusKey,
} from '../cost-display';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { PermissionDirective } from '../../../shared/permission.directive';
import { TableActionComponent } from '../../../shared/table-action.component';
import { CostLinesTableSectionComponent } from '../tabs/cost-lines-table-section.component';
import { ReglementModalComponent } from '../modals/reglement-modal.component';
import { UserStore } from '../../../core/user.store';
/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/**
 * Les trois modes de cette page, portés par `route.data.mode` (pas par un test sur la
 * forme du paramètre) — voir cost.routes.ts pour la répartition des trois routes.
 */
type DetailMode = 'line' | 'supplier' | 'unassigned';

/**
 * Tab 1's supplier/unassigned line list uses a fixed, generous page size instead of a
 * second, independent pagination control — the live dev DB has 6 suppliers and 1 cost
 * line total as of this writing, so a real pagination UI here is premature. Flagged as
 * a scaling caveat, exactly like the by-supplier aggregation endpoint's own lack of
 * pagination (see docs/superpowers/plans/2026-09-09-cost-lines-by-supplier.md).
 */
const SUPPLIER_MODE_PAGE_SIZE = 200;

/**
 * Fiche en lecture seule d'une ligne de coût — OU, depuis le 2026-09-09, d'un
 * fournisseur (`/finance/cost/supplier/:supplierId`) ou du panier "Sans fournisseur"
 * (`/finance/cost/supplier/none`). Trois modes, un seul composant :
 *
 *   - `'line'`       : `/finance/cost/:id`               — comportement d'origine,
 *                        inchangé (Tab 1 : les champs de CETTE ligne + son historique
 *                        d'approbation ; Tab 2 : le relevé de compte de SON fournisseur).
 *   - `'supplier'`    : `/finance/cost/supplier/:supplierId` — Tab 1 : la liste de
 *                        TOUTES les lignes de ce fournisseur, tout statut confondu (vue
 *                        de consultation, pas la portée restreinte du relevé) ; Tab 2 :
 *                        le même relevé que ci-dessus, obtenu directement par
 *                        `supplierId` au lieu de passer par une ligne de coût.
 *   - `'unassigned'`  : `/finance/cost/supplier/none`     — Tab 1 : toutes les lignes à
 *                        `supplier_id IS NULL` ; Tab 2 : l'état vide existant de ce
 *                        composant pour « aucun fournisseur », sans aucun appel réseau
 *                        au relevé.
 *
 * Distincte de `/finance/cost/:id/edit` (le formulaire) et de la modale de décision de
 * la file d'approbation (approve/return/reject, qui reste inchangée) : cette page est un
 * arrêt optionnel supplémentaire avant la décision, pas un remplacement.
 *
 * Squelette identique à `recouvrement-detail.component.ts` (UI-PLAYBOOK) : deux
 * colonnes en **flex inline**, jamais `grid` ni classes de point de rupture.
 */
@Component({
  selector: 'app-cost-line-detail',
  imports: [
    TranslatePipe, PermissionDirective, NgTemplateOutlet,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent,
    MetricCardComponent, ButtonComponent, StatusBadgeComponent,
    DataTableComponent, DafCellDirective, TableActionComponent,
    CostLinesTableSectionComponent, ReglementModalComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './cost-line-detail.component.html',
})
export class CostLineDetailComponent implements OnInit {
  private readonly svc        = inject(CostService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly clientSvc  = inject(ClientService);
  private readonly translate  = inject(TranslateService);
  private readonly currency   = inject(DisplayCurrencyPipe);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly userStore  = inject(UserStore);
  private readonly modal      = inject(ModalService);

  @ViewChild('reglementModal') private reglementModal!: ReglementModalComponent;

  /** Set once by `cost.routes.ts`'s `data.mode` on each of the three route entries. */
  readonly mode: DetailMode = (this.route.snapshot.data['mode'] as DetailMode) ?? 'line';

  /** Lu sur `paramMap` plutôt que par `input()` lié à la route — voir recouvrement-detail
   *  pour la raison : ce remote est monté par le routeur du shell. Only meaningful in
   *  'line' mode; NaN in the other two (no 'id' param on those routes). */
  private readonly costLineId = Number(this.route.snapshot.paramMap.get('id'));
  /** Only meaningful in 'supplier' mode; NaN in the other two (no such param there). */
  private readonly supplierIdParam = Number(this.route.snapshot.paramMap.get('supplierId'));

  costLine   = signal<CostLineDto | null>(null);
  ledger     = signal<SupplierLedgerDto | null>(null);
  allUsers   = signal<UserRefDto[]>([]);
  categories = signal<CostCategoryDto[]>([]);

  /**
   * Tab 2's ledger table has 12 columns, cramped into the 70%-wide right column — this
   * lets the user break it out to the page's full width (rendered below the two-column
   * layout, see the template's `ledgerPanel` outlet) instead of scrolling it
   * horizontally. Local to this view: not persisted, resets on navigation.
   */
  ledgerZoomed = signal(false);

  toggleLedgerZoom(): void {
    this.ledgerZoomed.update(z => !z);
  }

  /** 'supplier'/'unassigned' modes only: the reused Tab-1 line list, and the matching
   *  row from the by-supplier aggregation (authoritative count/total for the header and
   *  the KPI tiles — the loaded line PAGE alone can't be trusted for that once a
   *  supplier has more than SUPPLIER_MODE_PAGE_SIZE lines). */
  supplierLines   = signal<CostLineDto[]>([]);
  supplierSummary = signal<SupplierCostSummaryDto | null>(null);

  /** 'supplier'/'unassigned' modes only: resolved via ClientService.getMyPays(), same
   *  mechanism cost-lines.component.ts uses — unlike 'line' mode, there's no cost line
   *  to read paysId off of before anything has loaded. */
  paysId = signal<number>(0);

  loading = signal(true);
  error   = signal<string | null>(null);

  /** Adossé au paramètre d'URL — survit au rechargement et au bouton précédent. */
  activeTab = tabParam(computed(() => this.tabs().map(t => t.id)), 'info');

  // ═══ Résolution catégorie / approbateur ═══════════════════════════════════

  /** Même mécanisme que cost-lines.component.ts — ne pas en inventer un second.
   *  Arrow-function property (not a method): 'supplier'/'unassigned' modes pass this
   *  as a bound [categoryFor] input to the reused CostLinesTableSectionComponent, and a
   *  plain method reference would lose its `this` binding when called from there. */
  readonly categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c.labelFr])));

  readonly categoryFor = (id: number | null): string => {
    if (id == null) return '—';
    return this.categoryMap().get(id) ?? this.translate.instant('COST.LINES.CAT_FALLBACK', { id });
  };

  /** Même mécanisme que affaire-ressources-tab.component.ts — ne pas en inventer un second. */
  approverName(id: number | null): string {
    if (id == null) return '—';
    return this.allUsers().find(u => u.id === id)?.fullName ?? '—';
  }

  readonly hasSupplier = computed(() => {
    if (this.mode === 'unassigned') return false;
    if (this.mode === 'supplier')   return true;
    return this.costLine()?.supplierId != null;
  });

  readonly supplierName = computed(() =>
    this.ledger()?.supplier?.name ?? this.costLine()?.supplierNameFree ?? null);

  readonly canEditLine = computed(() => {
    const cl = this.costLine();
    return cl ? canEdit(cl) : false;
  });

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerTitle = computed(() => {
    this.translate.currentLang();
    if (this.mode === 'unassigned') return this.translate.instant('COST.DETAIL.UNASSIGNED_TITLE');
    if (this.mode === 'supplier')   return this.supplierName() ?? this.translate.instant('COST.DETAIL.UNNAMED');
    return this.costLine()?.reference ?? this.translate.instant('COST.DETAIL.UNNAMED');
  });

  readonly headerSubtitle = computed(() => {
    if (this.mode !== 'line') {
      this.translate.currentLang();
      const count = this.supplierSummary()?.lineCount ?? this.supplierLines().length;
      return this.translate.instant('COST.DETAIL.SUPPLIER.SUBTITLE', { count });
    }
    const cl = this.costLine();
    return cl ? (this.supplierName() ?? cl.label ?? '') : '';
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    if (this.mode !== 'line') return [];
    const cl = this.costLine();
    if (!cl) return [];
    this.translate.currentLang();
    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(statusKey(cl.status)),
      variant: STATUS_BADGE_VARIANT[cl.status] ?? 'neutral',
      dot:     true,
    }];
    if (cl.approvalLevelRequired) {
      badges.push({
        label:   this.translate.instant(approvalLevelKey(cl.approvalLevelRequired)!),
        variant: APPROVAL_BADGE_VARIANT[cl.approvalLevelRequired] ?? 'neutral',
      });
    }
    return badges;
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      // Absolute, not relative ['..']: 'supplier'/'unassigned' modes are TWO segments
      // deep (cost/supplier/...), where ['..'] would resolve to the non-existent
      // cost/supplier route instead of the list page. Also correct, unchanged, for
      // 'line' mode (one segment deep) -- see this plan's "Decisions locked in" #8.
      { label: this.translate.instant('COST.DETAIL.BACK'), link: ['/finance/cost'] },
      { label: this.headerTitle() },
    ];
  });

  // ═══ Colonne identité (mode 'line' uniquement) ═══════════════════════════

  readonly identityLeadFields = computed<DetailField[]>(() => {
    const cl = this.costLine();
    if (!cl) return [];
    return [
      { label: 'COST.DETAIL.INFO.REFERENCE', value: cl.reference ?? `COUT-${cl.id}` },
      { label: 'COST.DETAIL.INFO.LABEL',     value: cl.label ?? '—' },
    ];
  });

  readonly identityGridFields = computed<DetailField[]>(() => {
    const cl = this.costLine();
    if (!cl) return [];
    this.translate.currentLang();
    return [
      { label: 'COST.DETAIL.INFO.TRANSACTION_DATE', value: formatDate(cl.transactionDate) },
      { label: 'COST.DETAIL.INFO.CURRENCY',         value: cl.currency ?? '—' },
      { label: 'COST.DETAIL.INFO.CATEGORY',         value: this.categoryFor(cl.categoryId) },
      {
        label: 'COST.DETAIL.INFO.SUPPLIER',
        value: this.supplierName() ?? this.translate.instant('COST.DETAIL.INFO.NO_SUPPLIER'),
      },
      {
        label: 'COST.DETAIL.INFO.APPROVAL_LEVEL',
        value: cl.approvalLevelRequired
          ? this.translate.instant(approvalLevelKey(cl.approvalLevelRequired)!)
          : '—',
      },
    ];
  });

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  readonly kpiTiles = computed<KpiTile[]>(() => {
    this.translate.currentLang();
    if (this.mode !== 'line') {
      const s = this.supplierSummary();
      return [
        {
          label: 'COST.DETAIL.KPI.LINE_COUNT', value: String(s?.lineCount ?? 0),
          delta: null, options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
        },
        {
          // TTC, like the list page's supplier card it mirrors — the two must not
          // disagree about the same supplier's total. Its own key, NOT the KPI.EUR
          // the single-line branch below uses: that one shows netAmountEur (HT), so
          // one shared label cannot honestly describe both.
          label: 'COST.DETAIL.KPI.EUR_TTC', value: this.currency.transform(s?.totalGrossEur ?? 0, 'EUR'),
          delta: null, options: { icon: 'euro', iconColor: 'text-on-surface-variant', iconBg: 'bg-surface-container' },
        },
      ];
    }
    const cl = this.costLine();
    if (!cl) return [];
    const cur = cl.currency ?? 'EUR';
    return [
      {
        label: 'COST.DETAIL.KPI.NET', value: this.currency.transform(cl.netAmountLocal, cur),
        delta: null, options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        label: 'COST.DETAIL.KPI.VAT', value: this.currency.transform(cl.vatAmountLocal, cur),
        delta: null, options: { icon: 'percent', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
      {
        label: 'COST.DETAIL.KPI.GROSS', value: this.currency.transform(cl.grossAmountLocal, cur),
        delta: null, options: { icon: 'payments', iconColor: 'text-teal', iconBg: 'bg-teal/10' },
      },
      {
        label: 'COST.DETAIL.KPI.EUR', value: this.currency.transform(cl.netAmountEur, 'EUR'),
        delta: null, options: { icon: 'euro', iconColor: 'text-on-surface-variant', iconBg: 'bg-surface-container' },
      },
    ];
  });

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const infoLabel = this.mode === 'line' ? 'COST.DETAIL.TABS.INFO' : 'COST.DETAIL.TABS.LINES';
    const infoCount = this.mode === 'line'
      ? (this.costLine()?.approvals.length || null)
      : (this.supplierSummary()?.lineCount || null);
    return [
      { id: 'info',      label: this.translate.instant(infoLabel), count: infoCount },
      { id: 'reglement', label: this.translate.instant('COST.DETAIL.TABS.LEDGER'), count: this.ledger()?.rows.length || null },
    ];
  });

  // ── Tab 1, mode 'line' : historique d'approbation ─────────────────────────

  readonly approvalColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'level',    label: t('COST.DETAIL.APPROVALS.COL_LEVEL'),    type: 'text'   },
      { key: 'decision', label: t('COST.DETAIL.APPROVALS.COL_DECISION'), type: 'custom' },
      { key: 'approver', label: t('COST.DETAIL.APPROVALS.COL_APPROVER'), type: 'text'   },
      { key: 'date',     label: t('COST.DETAIL.APPROVALS.COL_DATE'),     type: 'text'   },
      { key: 'comment',  label: t('COST.DETAIL.APPROVALS.COL_COMMENT'),  type: 'text'   },
    ];
  });

  readonly approvalRows = computed<TableRow[]>(() => {
    const t = (k: string) => this.translate.instant(k);
    return (this.costLine()?.approvals ?? []).map((a, i) => ({
      id:       a.id ?? i,
      level:    a.level,
      approver: this.approverName(a.approverId),
      date:     formatDate(a.decisionDate),
      comment:  a.comment || '—',
      _decisionLabel:   t(decisionKey(a.decision)),
      _decisionVariant: DECISION_BADGE_VARIANT[a.decision] ?? 'neutral',
      _decisionIcon:    DECISION_ICON[a.decision],
    }));
  });

  readonly approvalConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   true,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.translate.instant('COST.DETAIL.APPROVALS.EMPTY'),
    };
  });

  // ── Tab 2 : relevé fournisseur ──────────────────────────────────────────────

  readonly ledgerColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const cols: TableColumn[] = [
      { key: 'date',            label: t('COST.DETAIL.LEDGER.COL_DATE'),            type: 'text' },
      { key: 'label',           label: t('COST.DETAIL.LEDGER.COL_LABEL'),           type: 'text' },
      { key: 'netAmount',       label: t('COST.DETAIL.LEDGER.COL_NET_AMOUNT'),      type: 'text', align: 'right' },
      { key: 'fodec',           label: t('COST.DETAIL.LEDGER.COL_FODEC'),           type: 'text', align: 'right' },
      { key: 'tva',             label: t('COST.DETAIL.LEDGER.COL_TVA'),             type: 'text', align: 'right' },
      { key: 'timbre',          label: t('COST.DETAIL.LEDGER.COL_TIMBRE'),          type: 'text', align: 'right' },
      { key: 'autresTaxes',     label: t('COST.DETAIL.LEDGER.COL_AUTRES_TAXES'),    type: 'text', align: 'right' },
      { key: 'grossAmount',     label: t('COST.DETAIL.LEDGER.COL_GROSS_AMOUNT'),    type: 'text', align: 'right' },
      { key: 'debit',           label: t('COST.DETAIL.LEDGER.COL_DEBIT'),           type: 'text', align: 'right' },
      { key: 'credit',          label: t('COST.DETAIL.LEDGER.COL_CREDIT'),          type: 'text', align: 'right' },
      { key: 'soldeDebiteur',   label: t('COST.DETAIL.LEDGER.COL_SOLDE_DEBITEUR'),  type: 'text', align: 'right' },
      { key: 'soldeCrediteur',  label: t('COST.DETAIL.LEDGER.COL_SOLDE_CREDITEUR'), type: 'text', align: 'right' },
    ];
    if (this.canManageReglements()) {
      cols.push({ key: 'actions', label: '', type: 'custom' });
    }
    return cols;
  });

  readonly ledgerRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return (this.ledger()?.rows ?? []).map((r, i) => ({
      id:             i,
      date:           formatDate(r.date),
      label:          r.label ?? '—',
      netAmount:      this.fmtAmount(r.netAmountLocal),
      fodec:          this.fmtAmount(r.fodecAmount),
      tva:            this.fmtAmount(r.vatAmountLocal),
      timbre:         this.fmtAmount(r.timbreAmount),
      autresTaxes:    this.fmtAmount(r.autresTaxesAmount),
      grossAmount:    this.fmtAmount(r.grossAmountLocal),
      debit:          this.fmtAmount(r.debit),
      credit:         this.fmtAmount(r.credit),
      soldeDebiteur:  this.fmtAmount(r.soldeDebiteur),
      soldeCrediteur: this.fmtAmount(r.soldeCrediteur),
      _reglementId:   r.reglementId,
    }));
  });

  /**
   * SupplierLedgerRowDto carries no currency. Plain numeric formatting, deliberately
   * not routed through DisplayCurrencyPipe, which requires a currency code this DTO
   * does not have.
   */
  private fmtAmount(v: number | null): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
  }

  readonly ledgerConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   true,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.hasSupplier()
        ? this.translate.instant('COST.DETAIL.LEDGER.EMPTY')
        : this.translate.instant('COST.DETAIL.LEDGER.NO_SUPPLIER'),
    };
  });

  // ── Tab 1, modes 'supplier'/'unassigned' : liste des lignes ───────────────

  readonly supplierLinesEmptyMessage = computed(() =>
    this.translate.instant('COST.DETAIL.SUPPLIER.LINES_EMPTY'));

  // ── Manual règlement (payment) feature (2026-09-10 plan) ───────────────────────

  readonly canManageReglements = computed(() => this.userStore.hasPermission('FACT_MANAGE_COST'));

  /** Unified across all three modes: the pays this page is currently scoped to. */
  readonly effectivePaysId = computed(() =>
    this.mode === 'line' ? (this.costLine()?.paysId ?? null) : this.paysId());

  /** The supplier whose ledger Tab 2 is currently showing -- works in 'line' and
   *  'supplier' modes alike (both have hasSupplier() === true when this is non-null);
   *  always null in 'unassigned' mode, where the "Nouveau règlement" button never shows. */
  readonly currentSupplierId = computed(() => this.ledger()?.supplier?.id ?? null);

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    if (this.mode === 'line') {
      if (!this.costLineId) {
        this.loading.set(false);
        this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
        return;
      }
      this.loadLine();
      return;
    }
    if (this.mode === 'supplier' && !this.supplierIdParam) {
      this.loading.set(false);
      this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
      return;
    }
    // 'supplier' | 'unassigned' -- no single cost line to resolve paysId from, so this
    // mirrors cost-lines.component.ts's own ngOnInit: resolve the user's pays first.
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
          this.loadSupplierMode();
        } else {
          this.loading.set(false);
          this.error.set(this.translate.instant('COST.LINES.NO_PAYS'));
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.translate.instant('COST.LINES.NO_PAYS_DETERMINE'));
      },
    });
  }

  loadLine(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      costLine: this.svc.getCostLine(this.costLineId),
      ledger:   this.svc.getSupplierLedger(this.costLineId),
      users:    this.affaireSvc.getUsers(),
    }).subscribe({
      next: ({ costLine, ledger, users }) => {
        this.costLine.set(costLine);
        this.ledger.set(ledger);
        this.allUsers.set(users);
        this.loading.set(false);
        this.svc.getCategories(costLine.paysId).subscribe(cats => this.categories.set(cats));
      },
      error: () => {
        this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  loadSupplierMode(): void {
    this.loading.set(true);
    this.error.set(null);
    const paysId = this.paysId();
    const isUnassigned = this.mode === 'unassigned';

    forkJoin({
      lines: this.svc.getCostLines({
        paysId,
        supplierId: isUnassigned ? null : this.supplierIdParam,
        noSupplier: isUnassigned,
        size: SUPPLIER_MODE_PAGE_SIZE,
      }),
      // 'unassigned' mode never calls the ledger endpoint at all -- it goes straight to
      // Tab 2's existing "no supplier" empty state, exactly as single-line mode already
      // does for a supplier-less cost line (see ledgerConfig()).
      ledger: isUnassigned
        ? of<SupplierLedgerDto>({ supplier: null, rows: [] })
        : this.svc.getLedgerForSupplier(this.supplierIdParam),
      users:     this.affaireSvc.getUsers(),
      summaries: this.svc.getCostLinesBySupplier(paysId),
    }).subscribe({
      next: ({ lines, ledger, users, summaries }) => {
        this.supplierLines.set(lines.content);
        this.ledger.set(ledger);
        this.allUsers.set(users);
        this.supplierSummary.set(
          summaries.find(s => isUnassigned ? s.supplierId == null : s.supplierId === this.supplierIdParam)
          ?? null,
        );
        this.loading.set(false);
        this.svc.getCategories(paysId).subscribe(cats => this.categories.set(cats));
      },
      error: () => {
        this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  goToEdit(): void {
    this.router.navigate(['edit'], { relativeTo: this.route });
  }

  /** Tab 1, 'supplier'/'unassigned' modes: same click-to-edit-form behaviour the flat
   *  list page already has for every row, regardless of status -- an absolute path
   *  since this page can now be reached from routes of different depths. */
  goToLineEdit(line: CostLineDto): void {
    this.router.navigate(['/finance/cost', line.id, 'edit']);
  }

  /** 'supplier' mode only (see the template's `@if (mode === 'supplier')` gate): opens
   *  the creation form with this supplier and pays pre-filled via query params, so the
   *  user doesn't have to search for the same supplier again — see
   *  CostFormComponent.prefillFromQueryParams(). Absolute path, same reasoning as
   *  goToLineEdit() above. */
  goToNewLineForSupplier(): void {
    this.router.navigate(['/finance/cost/new'], {
      queryParams: { paysId: this.effectivePaysId(), supplierId: this.supplierIdParam },
    });
  }

  submitLineFromList(line: CostLineDto): void {
    this.svc.submitCostLine(line.id).subscribe({
      next:  () => this.loadSupplierMode(),
      error: err => this.error.set(err.error?.message ?? this.translate.instant('COST.LINES.SUBMIT_ERROR')),
    });
  }

  // ── Manual règlement (payment) feature (2026-09-10 plan) ───────────────────────

  private reloadCurrentMode(): void {
    if (this.mode === 'line') this.loadLine();
    else this.loadSupplierMode();
  }

  openNewReglement(): void {
    const paysId = this.effectivePaysId();
    const supplierId = this.currentSupplierId();
    if (!paysId || !supplierId) return;
    this.svc.getCostLines({ paysId, status: 'APPROVED', supplierId, size: 200 }).subscribe({
      next: page => this.reglementModal.open(
        { editing: null, payableLines: page.content }, () => this.reloadCurrentMode()),
      error: () => this.reglementModal.open(
        { editing: null, payableLines: [] }, () => this.reloadCurrentMode()),
    });
  }

  /** Tab 1's per-line "Créer un règlement" shortcut -- skips the network round-trip
   *  `openNewReglement()` needs (it doesn't know which lines are payable yet); here the
   *  caller already has the one exact line, so the modal's line picker gets a
   *  single-element array and auto-selects/auto-fills it (see reglement-modal.component.ts). */
  openReglementForLine(line: CostLineDto): void {
    this.reglementModal.open({ editing: null, payableLines: [line] }, () => this.reloadCurrentMode());
  }

  openEditReglement(reglementId: number | null): void {
    if (reglementId == null) return;
    this.svc.getReglement(reglementId).subscribe({
      next: reglement => this.reglementModal.open(
        { editing: reglement, payableLines: [] }, () => this.reloadCurrentMode()),
      error: () => this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR')),
    });
  }

  confirmDeleteReglement(reglementId: number | null): void {
    if (reglementId == null) return;
    const t = (key: string) => this.translate.instant(key);
    this.modal.open({
      title: t('COST.DETAIL.LEDGER.DELETE_REGLEMENT'),
      body:  t('COST.DETAIL.LEDGER.CONFIRM_DELETE'),
      size:  'sm',
      buttons: [
        { label: t('COST.REGLEMENT.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: t('COST.DETAIL.LEDGER.DELETE_REGLEMENT'), variant: 'primary',
          action: r => {
            r.close();
            this.svc.deleteReglement(reglementId).subscribe({
              next: () => this.reloadCurrentMode(),
              error: err => this.error.set(err.error?.message ?? t('COST.DETAIL.LEDGER.DELETE_ERROR')),
            });
          },
        },
      ],
    });
  }
}
