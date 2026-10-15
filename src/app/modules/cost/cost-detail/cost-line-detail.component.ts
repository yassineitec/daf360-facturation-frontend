import { Component, DestroyRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  ButtonComponent, DafCellDirective, DataTableComponent, FilterComponent,
  MetricCardComponent, ModalService, PageComponent, PageHeaderComponent, SectionCardComponent,
  SearchToolbarComponent, StatusBadgeComponent, TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, FilterField, FilterResult, MetricCardOptions, MetricDelta, PageHeaderBadge,
  TabItem, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { CostService } from '../cost.service';
import { AffaireService } from '../../affaires/affaire.service';
import { ClientService } from '../../clients/client.service';
import { SupplierService } from '../../suppliers/supplier.service';
import type { UserRefDto } from '../../affaires/affaire.model';
import type { SupplierDto } from '../../suppliers/supplier.model';
import {
  CostInvoiceAttachmentDto, CostInvoiceDto, SupplierCostSummaryDto,
  SupplierLedgerDto, SupplierLedgerRowDto, costCategoryDisplay,
  CostInvoiceChangeDto, CostInvoiceChangeEntry, FACT_EDIT_VALIDATED_COST, VALIDATED_EDITABLE_STATUSES,
} from '../cost.model';
import {
  APPROVAL_BADGE_VARIANT, DECISION_BADGE_VARIANT, DECISION_ICON, STATUS_BADGE_VARIANT,
  approvalLevelKey, decisionKey, formatDate, statusKey,
} from '../cost-display';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { PermissionDirective } from '../../../shared/permission.directive';
import { TableActionComponent } from '../../../shared/table-action.component';
import { searchTableRows, tableTools } from '../../../shared/table-tools';
import { ReglementModalComponent } from '../modals/reglement-modal.component';
import { CostLinesTableSectionComponent } from '../tabs/cost-lines-table-section.component';
import { canEditInvoice, canReglementInvoice, invoicePayableAmount } from '../tabs/cost-invoice-display';
import { UserStore } from '../../../core/user.store';

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/** Une ligne du bloc des totaux de la facture (libellé déjà traduit). */
interface TotalRow { label: string; value: string; strong?: boolean; }

/**
 * Les trois modes de cette page, portés par `route.data.mode` (pas par un test sur la
 * forme du paramètre) — voir cost.routes.ts pour la répartition des trois routes.
 */
type DetailMode = 'line' | 'supplier' | 'unassigned';

/**
 * Supplier/unassigned modes load the supplier's invoices in one generous page instead of
 * a second pagination control — the volume per supplier stays small for now (same scaling
 * caveat as the by-supplier aggregation endpoint, which has no pagination either).
 */
const SUPPLIER_MODE_PAGE_SIZE = 200;

/**
 * Fiche en lecture seule d'une FACTURE DE COÛT (V93 — une facture fournisseur portant une
 * ou plusieurs lignes de coût), ou d'un fournisseur, ou du panier "Sans fournisseur".
 * Trois modes, un seul composant :
 *
 *   - `'line'`       : `/finance/cost/:id` — `:id` est l'id de la FACTURE. Onglets :
 *                        lignes + totaux, historique d'approbation, pièces jointes,
 *                        relevé du fournisseur (règlement).
 *   - `'supplier'`   : `/finance/cost/supplier/:supplierId` — Tab 1 : toutes les factures
 *                        de ce fournisseur, tout statut confondu ; Tab 2 : son relevé.
 *   - `'unassigned'` : `/finance/cost/supplier/none` — Tab 1 : les factures sans
 *                        fournisseur ; Tab 2 : l'état vide « aucun fournisseur ».
 *
 * La facture est l'unité d'approbation, de règlement et de pièces jointes : tout ce qui
 * était adressé par ligne l'est désormais par facture.
 *
 * Squelette identique à `recouvrement-detail.component.ts` (UI-PLAYBOOK) : deux
 * colonnes en **flex inline**, jamais `grid` ni classes de point de rupture.
 */
@Component({
  selector: 'app-cost-line-detail',
  imports: [
    TranslatePipe, PermissionDirective, NgTemplateOutlet, DecimalPipe,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent,
    MetricCardComponent, ButtonComponent, StatusBadgeComponent, FilterComponent,
    DataTableComponent, DafCellDirective, TableActionComponent, SearchToolbarComponent,
    CostLinesTableSectionComponent, ReglementModalComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './cost-line-detail.component.html',
})
export class CostLineDetailComponent implements OnInit {
  private readonly svc         = inject(CostService);
  private readonly affaireSvc  = inject(AffaireService);
  private readonly clientSvc   = inject(ClientService);
  private readonly supplierSvc = inject(SupplierService);
  private readonly translate   = inject(TranslateService);
  private readonly currency    = inject(DisplayCurrencyPipe);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly userStore   = inject(UserStore);
  private readonly modal       = inject(ModalService);
  private readonly destroyRef  = inject(DestroyRef);

  @ViewChild('reglementModal') private reglementModal!: ReglementModalComponent;

  /** Set once by `cost.routes.ts`'s `data.mode` on each of the three route entries. */
  readonly mode: DetailMode = (this.route.snapshot.data['mode'] as DetailMode) ?? 'line';

  /** 'line' mode: the cost INVOICE id. A signal fed by `paramMap` — drilling a ledger row
   *  to another invoice reuses this component instance (same route config). */
  private readonly invoiceId = signal<number>(NaN);
  /** Only meaningful in 'supplier' mode; NaN in the other two (no such param there). */
  private readonly supplierIdParam = Number(this.route.snapshot.paramMap.get('supplierId'));

  invoice     = signal<CostInvoiceDto | null>(null);
  attachments = signal<CostInvoiceAttachmentDto[]>([]);
  /** affaireId → « référence — intitulé », résolu pour les lignes de la facture. */
  affaireLabels = signal<Map<number, string>>(new Map());
  ledger      = signal<SupplierLedgerDto | null>(null);
  allUsers    = signal<UserRefDto[]>([]);

  /**
   * Tab 2's ledger table has 12 columns, cramped into the 70%-wide right column — this
   * lets the user break it out to the page's full width. Local to this view.
   */
  ledgerZoomed = signal(false);

  toggleLedgerZoom(): void {
    this.ledgerZoomed.update(z => !z);
  }

  /** '' (no filter), or one of the `ledgerFilterFields()` option values below. */
  ledgerType = signal('');
  /** Picked period on the row's date (one day or [from, to]); null = no filter. */
  ledgerPeriod = signal<Date[] | null>(null);
  /** Originating cost invoice id as a string ('' = every invoice of the supplier). */
  ledgerInvoice = signal('');
  /** Minimum Montant TTC (grossAmountLocal), as typed; '' = no minimum. */
  ledgerAmountMin = signal('');

  /** 'supplier'/'unassigned' modes only: the supplier's invoices, and the matching row
   *  of the by-supplier aggregation (authoritative count/total). */
  supplierInvoices = signal<CostInvoiceDto[]>([]);
  supplierSummary  = signal<SupplierCostSummaryDto | null>(null);

  /** 'supplier' mode only: the full supplier record (type, matricule fiscale, pays). */
  supplierDetail = signal<SupplierDto | null>(null);

  /** 'supplier'/'unassigned' modes only: resolved via ClientService.getMyPays(). */
  paysId = signal<number>(0);

  loading = signal(true);
  error   = signal<string | null>(null);

  /** Adossé au paramètre d'URL — survit au rechargement et au bouton précédent. */
  activeTab = tabParam(computed(() => this.tabs().map(t => t.id)), 'info');

  // ═══ Résolution approbateur / permissions ═════════════════════════════════

  /** Même mécanisme que affaire-ressources-tab.component.ts — ne pas en inventer un second. */
  approverName(id: number | null): string {
    if (id == null) return '—';
    return this.allUsers().find(u => u.id === id)?.fullName ?? '—';
  }

  readonly canManage = computed(() => this.userStore.hasPermission('FACT_MANAGE_COST'));
  readonly canManageReglements = this.canManage;

  readonly hasSupplier = computed(() => {
    if (this.mode === 'unassigned') return false;
    if (this.mode === 'supplier')   return true;
    return this.invoice()?.supplierId != null;
  });

  readonly supplierName = computed(() =>
    this.ledger()?.supplier?.name ?? this.invoice()?.supplierName ?? this.invoice()?.supplierNameFree ?? null);

  readonly canEditInvoice = computed(() => {
    const inv = this.invoice();
    return inv ? canEditInvoice(inv) : false;
  });

  /** DAF edit after validation (V94): APPROVED / POSTED invoice + FACT_EDIT_VALIDATED_COST. */
  readonly canEditValidated = computed(() => {
    const inv = this.invoice();
    return !!inv && VALIDATED_EDITABLE_STATUSES.includes(inv.status)
      && this.userStore.hasPermission(FACT_EDIT_VALIDATED_COST);
  });

  /** Edits made after validation, newest first (tab « Historique des modifications »). */
  readonly changes = signal<CostInvoiceChangeDto[]>([]);
  /** Template helpers for that tab. */
  readonly formatDate = formatDate;
  readonly statusKey  = statusKey;

  /** Label of a recorded change: "Ligne EXP-…-01 · Montant HT", "Fournisseur", "Total TTC"… */
  changeFieldLabel(e: CostInvoiceChangeEntry): string {
    const field = this.translate.instant('COST.CHANGES.FIELD.' + e.field);
    return e.scope === 'LINE' && e.lineReference
      ? this.translate.instant('COST.CHANGES.LINE_PREFIX', { ref: e.lineReference }) + ' · ' + field
      : field;
  }

  /** Pièces jointes supprimables : brouillon uniquement, et droit de gestion. */
  readonly canDeleteAttachments = computed(() =>
    this.invoice()?.status === 'DRAFT' && this.canManage());

  /** 'line' mode: the invoice can receive its (single) règlement. */
  readonly invoicePayable = computed(() => {
    const inv = this.invoice();
    return !!inv && canReglementInvoice(inv);
  });

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerTitle = computed(() => {
    this.translate.currentLang();
    if (this.mode === 'unassigned') return this.translate.instant('COST.DETAIL.UNASSIGNED_TITLE');
    if (this.mode === 'supplier')   return this.supplierName() ?? this.translate.instant('COST.DETAIL.UNNAMED');
    return this.invoice()?.reference ?? this.translate.instant('COST.DETAIL.UNNAMED');
  });

  readonly headerSubtitle = computed(() => {
    if (this.mode !== 'line') {
      this.translate.currentLang();
      const count = this.supplierSummary()?.invoiceCount ?? this.supplierInvoices().length;
      return this.translate.instant('COST.DETAIL.SUPPLIER.SUBTITLE', { count });
    }
    const inv = this.invoice();
    if (!inv) return '';
    return this.supplierName() ?? this.translate.instant('COST.DETAIL.INFO.NO_SUPPLIER');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    if (this.mode !== 'line') return [];
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();
    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(statusKey(inv.status)),
      variant: STATUS_BADGE_VARIANT[inv.status] ?? 'neutral',
      dot:     true,
    }];
    if (inv.approvalLevelRequired) {
      badges.push({
        label:   this.translate.instant(approvalLevelKey(inv.approvalLevelRequired)!),
        variant: APPROVAL_BADGE_VARIANT[inv.approvalLevelRequired] ?? 'neutral',
      });
    }
    return badges;
  });

  /**
   * Ouverte depuis la file d'approbation (`?from=approval`) : le retour y ramène, là où
   * l'utilisateur a laissé ses filtres, plutôt qu'à la liste des lignes de coût.
   */
  private readonly fromApproval = this.route.snapshot.queryParamMap.get('from') === 'approval';

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      // Absolute: 'supplier'/'unassigned' modes are TWO segments deep.
      this.fromApproval
        ? { label: this.translate.instant('COST.APPROVAL_QUEUE.TITLE'), link: ['/finance/cost/approval'] }
        : { label: this.translate.instant('COST.DETAIL.BACK'), link: ['/finance/cost'] },
      { label: this.headerTitle() },
    ];
  });

  // ═══ Colonne identité (mode 'line' uniquement) ═══════════════════════════

  readonly identityLeadFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();
    return [
      { label: 'COST.DETAIL.INFO.REFERENCE', value: inv.reference || ('#' + inv.id) },
      {
        label: 'COST.DETAIL.INFO.SUPPLIER',
        value: this.supplierName() ?? this.translate.instant('COST.DETAIL.INFO.NO_SUPPLIER'),
      },
    ];
  });

  readonly identityGridFields = computed<DetailField[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();
    return [
      { label: 'COST.FORM.INVOICE_NUMBER_LABEL', value: inv.supplierInvoiceNumber || '—' },
      { label: 'COST.FORM.INVOICE_DATE_LABEL',   value: formatDate(inv.invoiceDate) },
      { label: 'COST.FORM.DUE_DATE_LABEL',       value: formatDate(inv.paymentDueDate) },
      { label: 'COST.DETAIL.INFO.CURRENCY',      value: inv.currency ?? '—' },
      {
        label: 'COST.DETAIL.INFO.STATUS',
        value: this.translate.instant(statusKey(inv.status)),
      },
      {
        label: 'COST.DETAIL.INFO.APPROVAL_LEVEL',
        value: inv.approvalLevelRequired
          ? this.translate.instant(approvalLevelKey(inv.approvalLevelRequired)!)
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
          label: 'COST.DETAIL.KPI.INVOICE_COUNT', value: String(s?.invoiceCount ?? 0),
          delta: null, options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
        },
        {
          // TTC, like the list page's supplier card it mirrors.
          label: 'COST.DETAIL.KPI.EUR_TTC', value: this.currency.transform(s?.totalGrossEur ?? 0, 'EUR'),
          delta: null, options: { icon: 'euro', iconColor: 'text-on-surface-variant', iconBg: 'bg-surface-container' },
        },
      ];
    }
    const inv = this.invoice();
    if (!inv) return [];
    const cur = inv.currency ?? 'EUR';
    const tiles: KpiTile[] = [
      {
        label: 'COST.DETAIL.KPI.NET', value: this.currency.transform(inv.netAmountLocal, cur),
        delta: null, options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        label: 'COST.DETAIL.KPI.VAT', value: this.currency.transform(inv.vatAmountLocal, cur),
        delta: null, options: { icon: 'percent', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
      {
        label: 'COST.DETAIL.KPI.GROSS', value: this.currency.transform(inv.grossAmountLocal, cur),
        delta: null, options: { icon: 'payments', iconColor: 'text-teal', iconBg: 'bg-teal/10' },
      },
      {
        label: 'COST.DETAIL.KPI.EUR', value: this.currency.transform(inv.netAmountEur, 'EUR'),
        delta: null, options: { icon: 'euro', iconColor: 'text-on-surface-variant', iconBg: 'bg-surface-container' },
      },
      {
        label: 'COST.DETAIL.KPI.EUR_TTC', value: this.currency.transform(inv.grossAmountEur, 'EUR'),
        delta: null, options: { icon: 'euro', iconColor: 'text-on-surface-variant', iconBg: 'bg-surface-container' },
      },
    ];
    if (inv.rsAmount) {
      tiles.push({
        label: 'COST.FORM.NET_TO_PAY', value: this.currency.transform(invoicePayableAmount(inv), cur),
        delta: null, options: { icon: 'account_balance_wallet', iconColor: 'text-tertiary', iconBg: 'bg-tertiary/10' },
      });
    }
    return tiles;
  });

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const ledgerTab: TabItem = {
      id: 'reglement', label: t('COST.DETAIL.TABS.LEDGER'), count: this.ledger()?.rows.length || null,
    };
    if (this.mode !== 'line') {
      return [
        { id: 'info', label: t('COST.DETAIL.TABS.INVOICES'), count: this.supplierSummary()?.invoiceCount || null },
        ledgerTab,
      ];
    }
    const inv = this.invoice();
    return [
      { id: 'info',        label: t('COST.DETAIL.TABS.INFO'),        count: inv?.lines.length || null },
      { id: 'approvals',   label: t('COST.DETAIL.TABS.APPROVALS'),   count: inv?.approvals.length || null },
      { id: 'attachments', label: t('COST.DETAIL.TABS.ATTACHMENTS'), count: this.attachments().length || null },
      { id: 'changes',     label: t('COST.DETAIL.TABS.CHANGES'),     count: this.changes().length || null },
      ledgerTab,
    ];
  });

  // ── Tab 1, mode 'line' : lignes de la facture ──────────────────────────────

  private fmtCur(v: number | null | undefined): string {
    return this.currency.transform(v ?? null, this.invoice()?.currency ?? 'EUR');
  }

  private fmtPct(fraction: number | null | undefined): string {
    if (fraction == null) return '—';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(fraction * 100) + ' %';
  }

  readonly lineColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const raw = (field: string) => (row: TableRow) => row['_' + field] as number | null;
    // V102 — the "hors champ" column only when a line of this invoice has such a part.
    const nonTaxable: TableColumn[] = this.invoice()?.nonTaxableAmountLocal
      ? [{ key: 'nonTaxable', label: t('COST.DETAIL.LINES.COL_NON_TAXABLE'), type: 'text', align: 'right', sortable: true, sortAccessor: raw('nonTaxable') }]
      : [];
    return [
      { key: 'category',    label: t('COST.DETAIL.LINES.COL_CATEGORY'),    type: 'text', sortable: true },
      { key: 'description', label: t('COST.DETAIL.LINES.COL_DESCRIPTION'), type: 'text', sortable: true },
      { key: 'affaire',     label: t('COST.DETAIL.LINES.COL_AFFAIRE'),     type: 'text', sortable: true },
      { key: 'net',   label: t('COST.DETAIL.LINES.COL_NET'),      type: 'text', align: 'right', sortable: true, sortAccessor: raw('net') },
      ...nonTaxable,
      { key: 'fodec', label: t('COST.DETAIL.LINES.COL_FODEC'),    type: 'text', align: 'right', sortable: true, sortAccessor: raw('fodec') },
      { key: 'tvaRate', label: t('COST.DETAIL.LINES.COL_VAT_RATE'), type: 'text', align: 'right', sortable: true, sortAccessor: raw('tvaRate') },
      { key: 'vat',   label: t('COST.DETAIL.LINES.COL_VAT'),      type: 'text', align: 'right', sortable: true, sortAccessor: raw('vat') },
      { key: 'gross', label: t('COST.DETAIL.LINES.COL_GROSS'),    type: 'text', align: 'right', sortable: true, sortAccessor: raw('gross') },
    ];
  });

  readonly lineRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const labels = this.affaireLabels();
    return (this.invoice()?.lines ?? []).map(l => ({
      id:          l.id,
      category:    costCategoryDisplay(l),
      description: l.label || '—',
      affaire:     l.affaireId != null ? (labels.get(l.affaireId) ?? ('#' + l.affaireId)) : '—',
      net:         this.fmtCur(l.netAmountLocal),
      nonTaxable:  l.nonTaxableAmountLocal ? this.fmtCur(l.nonTaxableAmountLocal) : '—',
      _nonTaxable: l.nonTaxableAmountLocal ?? 0,
      fodec:       l.fodecAmount ? this.fmtCur(l.fodecAmount) : '—',
      tvaRate:     this.fmtPct(l.tvaRate),
      vat:         this.fmtCur(l.vatAmountLocal),
      gross:       this.fmtCur(l.grossAmountLocal),
      _net:        l.netAmountLocal,
      _fodec:      l.fodecAmount,
      _tvaRate:    l.tvaRate,
      _vat:        l.vatAmountLocal,
      _gross:      l.grossAmountLocal,
    }));
  });

  readonly lineConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.translate.instant('COST.DETAIL.LINES.EMPTY'),
      ...tableTools(this.translate),
    };
  });

  /** Bloc des totaux : HT, FODEC, chaque taux de TVA avec sa base, timbre, TTC, RS, net. */
  readonly totalRows = computed<TotalRow[]>(() => {
    const inv = this.invoice();
    if (!inv) return [];
    this.translate.currentLang();
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    const rows: TotalRow[] = [{ label: t('COST.FORM.TOTAL_HT'), value: this.fmtCur(inv.netAmountLocal) }];
    if (inv.nonTaxableAmountLocal) {
      rows.push({ label: t('COST.FORM.TOTAL_NON_TAXABLE'), value: this.fmtCur(inv.nonTaxableAmountLocal) });
    }
    if (inv.fodecAmount) rows.push({ label: t('COST.FORM.TOTAL_FODEC'), value: this.fmtCur(inv.fodecAmount) });
    for (const v of inv.vatBreakdown ?? []) {
      rows.push({
        label: v.tvaRate != null
          ? t('COST.FORM.TOTAL_VAT_RATE', {
              rate: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(v.tvaRate * 100),
              base: this.fmtCur(v.baseAmount),
            })
          : t('COST.FORM.TOTAL_VAT_MANUAL'),
        value: this.fmtCur(v.vatAmount),
      });
    }
    if (inv.timbreAmount) rows.push({ label: t('COST.FORM.TOTAL_TIMBRE'), value: this.fmtCur(inv.timbreAmount) });
    // Autres taxes (V95): one row each, all included in the TTC.
    const en = this.translate.currentLang() === 'en';
    for (const o of inv.otherTaxes ?? []) {
      const type = en ? (o.taxTypeLabelEn || o.taxTypeLabel) : o.taxTypeLabel;
      const name = type && o.label ? type + ' (' + o.label + ')' : (type || o.label || t('COST.FORM.OTHER_TAX.TITLE'));
      rows.push({ label: t('COST.FORM.TOTAL_OTHER_TAX', { name }), value: this.fmtCur(o.amountLocal) });
    }
    rows.push({ label: t('COST.FORM.TOTAL_TTC'), value: this.fmtCur(inv.grossAmountLocal), strong: true });
    if (inv.rsAmount) {
      const baseLabel = inv.rsBase ? t('COST.FORM.TAX.RS_BASE_' + inv.rsBase) : '';
      const base = [this.fmtPct(inv.rsRate), baseLabel].filter(s => s && s !== '—').join(' ');
      rows.push({ label: t('COST.FORM.TOTAL_RS', { base }), value: '− ' + this.fmtCur(inv.rsAmount) });
      rows.push({ label: t('COST.FORM.NET_TO_PAY'), value: this.fmtCur(invoicePayableAmount(inv)), strong: true });
    }
    return rows;
  });

  // ── Tab 'approvals', mode 'line' : historique d'approbation ────────────────

  readonly approvalColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'level',    label: t('COST.DETAIL.APPROVALS.COL_LEVEL'),    type: 'text',   sortable: true },
      { key: 'decision', label: t('COST.DETAIL.APPROVALS.COL_DECISION'), type: 'custom', sortable: true,
        sortAccessor: row => row['_decisionLabel'] as string },
      { key: 'approver', label: t('COST.DETAIL.APPROVALS.COL_APPROVER'), type: 'text',   sortable: true },
      { key: 'date',     label: t('COST.DETAIL.APPROVALS.COL_DATE'),     type: 'text',   sortable: true,
        sortAccessor: row => row['_decisionDate'] as string | null },
      { key: 'comment',  label: t('COST.DETAIL.APPROVALS.COL_COMMENT'),  type: 'text',   sortable: true },
    ];
  });

  readonly approvalRows = computed<TableRow[]>(() => {
    const t = (k: string) => this.translate.instant(k);
    return (this.invoice()?.approvals ?? []).map((a, i) => ({
      id:       a.id ?? i,
      _decisionDate: a.decisionDate,
      level:    a.level,
      approver: this.approverName(a.approverId),
      date:     formatDate(a.decisionDate),
      comment:  a.comment || '—',
      _decisionLabel:   t(decisionKey(a.decision)),
      _decisionVariant: DECISION_BADGE_VARIANT[a.decision] ?? 'neutral',
      _decisionIcon:    DECISION_ICON[a.decision],
    }));
  });

  readonly approvalSearch = signal('');
  readonly filteredApprovalRows = computed(() => {
    const columns = this.approvalColumns().map((c): TableColumn =>
      c.key === 'date' ? { ...c, sortAccessor: undefined } : c);
    return searchTableRows(this.approvalRows(), columns, this.approvalSearch());
  });

  readonly approvalConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   true,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.translate.instant('COST.DETAIL.APPROVALS.EMPTY'),
      ...tableTools(this.translate),
    };
  });

  // ── Tab 'attachments', mode 'line' ─────────────────────────────────────────

  readonly attachmentColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'name',     label: t('COST.DETAIL.ATTACHMENTS.COL_NAME'), type: 'text', sortable: true },
      { key: 'size',     label: t('COST.DETAIL.ATTACHMENTS.COL_SIZE'), type: 'text', align: 'right', sortable: true,
        sortAccessor: row => row['_size'] as number | null },
      { key: 'date',     label: t('COST.DETAIL.ATTACHMENTS.COL_DATE'), type: 'text', sortable: true,
        sortAccessor: row => row['_date'] as string | null },
      { key: '_actions', label: '', type: 'custom' },
    ];
  });

  readonly attachmentRows = computed<TableRow[]>(() =>
    this.attachments().map(a => ({
      id:    a.id,
      name:  a.fileName,
      size:  formatFileSize(a.fileSizeBytes),
      date:  formatDate(a.uploadedAt),
      _size: a.fileSizeBytes ?? null,
      _date: a.uploadedAt,
      _raw:  a,
    })));

  readonly attachmentConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    false,
      loading:      false,
      emptyMessage: this.translate.instant('COST.DETAIL.ATTACHMENTS.EMPTY'),
      ...tableTools(this.translate),
    };
  });

  downloadAttachment(a: CostInvoiceAttachmentDto): void {
    this.svc.downloadAttachment(a.costInvoiceId, a.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.fileName || ('attachment-' + a.id);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => this.error.set(this.translate.instant('COST.DETAIL.ATTACHMENTS.DOWNLOAD_ERROR')),
    });
  }

  confirmDeleteAttachment(a: CostInvoiceAttachmentDto): void {
    if (!this.canDeleteAttachments()) return;
    const t = (key: string, p?: object) => this.translate.instant(key, p);
    this.modal.open({
      title: t('COST.DETAIL.ATTACHMENTS.DELETE'),
      body:  t('COST.DETAIL.ATTACHMENTS.CONFIRM_DELETE', { name: a.fileName }),
      size:  'sm',
      buttons: [
        { label: t('COST.REGLEMENT.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: t('COST.DETAIL.ATTACHMENTS.DELETE'), variant: 'primary',
          action: r => {
            r.close();
            this.svc.removeAttachment(a.costInvoiceId, a.id).subscribe({
              next: () => this.attachments.update(list => list.filter(x => x.id !== a.id)),
              error: err => this.error.set(err.error?.message ?? t('COST.DETAIL.ATTACHMENTS.DELETE_ERROR')),
            });
          },
        },
      ],
    });
  }

  // ── Tab 1, modes 'supplier'/'unassigned' : liste des factures ─────────────
  // Rendue par la section partagée de la page liste (CostLinesTableSectionComponent) :
  // mêmes colonnes, mêmes règles d'action (tabs/cost-invoice-display.ts).

  readonly supplierInvoicesEmptyMessage = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('COST.DETAIL.SUPPLIER.LINES_EMPTY');
  });

  // ── Tab 2 : relevé fournisseur ──────────────────────────────────────────────

  readonly ledgerColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const raw = (field: keyof SupplierLedgerRowDto) =>
      (row: TableRow) => (row['_source'] as SupplierLedgerRowDto)[field] as string | number | null;
    const cols: TableColumn[] = [
      { key: 'date',            label: t('COST.DETAIL.LEDGER.COL_DATE'),            type: 'text', sortable: true, sortAccessor: raw('date') },
      { key: 'label',           label: t('COST.DETAIL.LEDGER.COL_LABEL'),           type: 'text', sortable: true },
      { key: 'netAmount',       label: t('COST.DETAIL.LEDGER.COL_NET_AMOUNT'),      type: 'text', align: 'right', sortable: true, sortAccessor: raw('netAmountLocal') },
      { key: 'fodec',           label: t('COST.DETAIL.LEDGER.COL_FODEC'),           type: 'text', align: 'right', sortable: true, sortAccessor: raw('fodecAmount') },
      { key: 'tva',             label: t('COST.DETAIL.LEDGER.COL_TVA'),             type: 'text', align: 'right', sortable: true, sortAccessor: raw('vatAmountLocal') },
      { key: 'timbre',          label: t('COST.DETAIL.LEDGER.COL_TIMBRE'),          type: 'text', align: 'right', sortable: true, sortAccessor: raw('timbreAmount') },
      { key: 'autresTaxes',     label: t('COST.DETAIL.LEDGER.COL_AUTRES_TAXES'),    type: 'text', align: 'right', sortable: true, sortAccessor: raw('otherTaxesAmount') },
      { key: 'grossAmount',     label: t('COST.DETAIL.LEDGER.COL_GROSS_AMOUNT'),    type: 'text', align: 'right', sortable: true, sortAccessor: raw('grossAmountLocal') },
      { key: 'rs',              label: t('COST.DETAIL.LEDGER.COL_RS'),              type: 'text', align: 'right', sortable: true, sortAccessor: raw('rsAmount') },
      { key: 'netToPay',        label: t('COST.DETAIL.LEDGER.COL_NET_TO_PAY'),      type: 'text', align: 'right', sortable: true, sortAccessor: raw('netToPay') },
      { key: 'paid',            label: t('COST.DETAIL.LEDGER.COL_PAID'),            type: 'text', align: 'right', sortable: true, sortAccessor: raw('montantPaye') },
      { key: 'debit',          label: t('COST.DETAIL.LEDGER.COL_DEBIT'),           type: 'text', align: 'right', sortable: true, sortAccessor: raw('debit') },
      { key: 'credit',          label: t('COST.DETAIL.LEDGER.COL_CREDIT'),          type: 'text', align: 'right', sortable: true, sortAccessor: raw('credit') },
      { key: 'soldeDebiteur',   label: t('COST.DETAIL.LEDGER.COL_SOLDE_DEBITEUR'),  type: 'text', align: 'right', sortable: true, sortAccessor: raw('soldeDebiteur') },
      { key: 'soldeCrediteur',  label: t('COST.DETAIL.LEDGER.COL_SOLDE_CREDITEUR'), type: 'text', align: 'right', sortable: true, sortAccessor: raw('soldeCrediteur') },
    ];
    if (this.canManageReglements()) {
      cols.push({ key: 'actions', label: '', type: 'custom' });
    }
    return cols;
  });

  readonly ledgerFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        name:    'type',
        label:   t('COST.DETAIL.LEDGER.FILTER_TYPE'),
        type:    'select',
        options: [
          { value: 'CREDIT',  label: t('COST.DETAIL.LEDGER.TYPE_CREDIT') },
          { value: 'DEBIT',   label: t('COST.DETAIL.LEDGER.TYPE_DEBIT') },
          { value: 'SETTLED', label: t('COST.DETAIL.LEDGER.TYPE_SETTLED') },
        ],
      },
      {
        name:  'period',
        label: t('COST.DETAIL.LEDGER.FILTER_PERIOD'),
        type:  'daterange',
      },
      {
        name:       'costInvoice',
        label:      t('COST.DETAIL.LEDGER.FILTER_INVOICE'),
        type:       'select',
        searchable: true,
        options:    this.ledgerInvoiceOptions(),
      },
      {
        name:        'amountMin',
        label:       t('COST.LINES.AMOUNT_MIN_FILTER_LABEL'),
        type:        'text',
        placeholder: t('COST.LINES.AMOUNT_MIN_FILTER_PLACEHOLDER'),
      },
    ];
  });

  /** The cost invoices present in the loaded ledger — every option matches a row. */
  private readonly ledgerInvoiceOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const r of this.ledger()?.rows ?? []) {
      if (!seen.has(r.costInvoiceId)) seen.set(r.costInvoiceId, r.label || ('#' + r.costInvoiceId));
    }
    return [...seen].map(([value, label]) => ({ value: String(value), label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  onLedgerFilter(result: FilterResult): void {
    const one = (v: unknown): string => Array.isArray(v) ? (v[0] as string) ?? '' : (v as string) ?? '';
    const period = result['period'];
    this.ledgerType.set(one(result['type']));
    this.ledgerPeriod.set(Array.isArray(period) && period.length ? period as Date[] : null);
    this.ledgerInvoice.set(one(result['costInvoice']));
    this.ledgerAmountMin.set(one(result['amountMin']).trim());
  }

  /** Client-side: the whole ledger arrives in one call (no pagination on this endpoint). */
  readonly filteredLedgerRawRows = computed<SupplierLedgerRowDto[]>(() => {
    const type = this.ledgerType();
    const period = this.ledgerPeriod();
    const from = period?.length ? toIsoDay(period[0]) : null;
    const to   = period?.length ? toIsoDay(period[period.length - 1]) : null;
    const invoiceFilter = this.ledgerInvoice();
    const min = this.ledgerAmountMin() ? Number(this.ledgerAmountMin().replace(',', '.')) : null;
    return (this.ledger()?.rows ?? []).filter(r => {
      if (from && to) {
        const day = (r.date ?? '').slice(0, 10);
        if (!day || day < from || day > to) return false;
      }
      if (invoiceFilter && String(r.costInvoiceId) !== invoiceFilter) return false;
      if (min != null && !isNaN(min) && (r.grossAmountLocal == null || r.grossAmountLocal < min)) return false;
      if (!type) return true;
      if (type === 'CREDIT')  return r.credit != null;
      if (type === 'DEBIT')   return r.debit  != null;
      return r.credit == null && r.debit == null; // 'SETTLED'
    });
  });

  readonly ledgerRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return this.filteredLedgerRawRows().map(r => ({
      id:             r.reglementId,
      _source:        r,
      date:           formatDate(r.date),
      label:          r.label ?? '—',
      netAmount:      this.fmtAmount(r.netAmountLocal),
      fodec:          this.fmtAmount(r.fodecAmount),
      tva:            this.fmtAmount(r.vatAmountLocal),
      timbre:         this.fmtAmount(r.timbreAmount),
      autresTaxes:    this.fmtAmount(r.otherTaxesAmount),
      grossAmount:    this.fmtAmount(r.grossAmountLocal),
      rs:             this.fmtAmount(r.rsAmount),
      netToPay:       this.fmtAmount(r.netToPay ?? null),
      paid:           this.fmtAmount(r.montantPaye ?? null),
      debit:          this.fmtAmount(r.debit),
      credit:         this.fmtAmount(r.credit),
      soldeDebiteur:  this.fmtAmount(r.soldeDebiteur),
      soldeCrediteur: this.fmtAmount(r.soldeCrediteur),
      _reglementId:   r.reglementId,
      _costInvoiceId: r.costInvoiceId,
    }));
  });

  readonly ledgerSearch = signal('');
  readonly filteredLedgerRows = computed(() => {
    const columns = this.ledgerColumns().map((c): TableColumn => ({ ...c, sortAccessor: undefined }));
    return searchTableRows(this.ledgerRows(), columns, this.ledgerSearch());
  });

  /** SupplierLedgerRowDto carries no currency: plain numeric formatting. */
  private fmtAmount(v: number | null): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v);
  }

  readonly ledgerConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      false,
      emptyMessage: this.hasSupplier()
        ? this.translate.instant('COST.DETAIL.LEDGER.EMPTY')
        : this.translate.instant('COST.DETAIL.LEDGER.NO_SUPPLIER'),
      ...tableTools(this.translate),
    };
  });

  /** Drill from a ledger row to the invoice it comes from. */
  onLedgerRowClick(row: TableRow): void {
    const id = row['_costInvoiceId'] as number | undefined;
    if (id == null) return;
    if (this.mode === 'line' && id === this.invoiceId()) return;
    this.router.navigate(['/finance/cost', id]);
  }

  /**
   * Excel export of the ledger (xlsx, same scheme as the affaire page exports). Raw
   * numbers, follows the active filter + search.
   */
  exportLedgerExcel(): void {
    const t = (k: string) => this.translate.instant(k);
    const visible = this.filteredLedgerRows().map(row => row['_source'] as SupplierLedgerRowDto);
    const rows = visible.map(r => ({
      [t('COST.DETAIL.LEDGER.COL_DATE')]:            formatDate(r.date),
      [t('COST.DETAIL.LEDGER.COL_LABEL')]:            r.label ?? '',
      [t('COST.DETAIL.LEDGER.COL_NET_AMOUNT')]:       r.netAmountLocal ?? '',
      [t('COST.DETAIL.LEDGER.COL_FODEC')]:            r.fodecAmount ?? '',
      [t('COST.DETAIL.LEDGER.COL_TVA')]:              r.vatAmountLocal ?? '',
      [t('COST.DETAIL.LEDGER.COL_TIMBRE')]:           r.timbreAmount ?? '',
      [t('COST.DETAIL.LEDGER.COL_AUTRES_TAXES')]:     r.otherTaxesAmount ?? '',
      [t('COST.DETAIL.LEDGER.COL_GROSS_AMOUNT')]:     r.grossAmountLocal ?? '',
      [t('COST.DETAIL.LEDGER.COL_RS')]:               r.rsAmount ?? '',
      [t('COST.DETAIL.LEDGER.COL_NET_TO_PAY')]:       r.netToPay ?? '',
      [t('COST.DETAIL.LEDGER.COL_PAID')]:             r.montantPaye ?? '',
      [t('COST.DETAIL.LEDGER.COL_DEBIT')]:           r.debit ?? '',
      [t('COST.DETAIL.LEDGER.COL_CREDIT')]:           r.credit ?? '',
      [t('COST.DETAIL.LEDGER.COL_SOLDE_DEBITEUR')]:   r.soldeDebiteur ?? '',
      [t('COST.DETAIL.LEDGER.COL_SOLDE_CREDITEUR')]:  r.soldeCrediteur ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t('COST.DETAIL.TABS.LEDGER'));
    const supplierPart = (this.supplierName() ?? 'RELEVE').replace(/[^a-z0-9]+/gi, '_');
    XLSX.writeFile(wb, supplierPart + '_releve.xlsx');
  }

  /** Unified across all three modes: the pays this page is currently scoped to. */
  readonly effectivePaysId = computed(() =>
    this.mode === 'line' ? (this.invoice()?.paysId ?? null) : this.paysId());

  /** The supplier whose ledger Tab 2 is showing; null in 'unassigned' mode. */
  readonly currentSupplierId = computed(() =>
    this.ledger()?.supplier?.id ?? (this.mode === 'line' ? this.invoice()?.supplierId ?? null : null));

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    if (this.mode === 'line') {
      this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
        const id = Number(params.get('id'));
        this.invoiceId.set(id);
        if (!id) {
          this.loading.set(false);
          this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
          return;
        }
        this.loadInvoice();
      });
      return;
    }
    if (this.mode === 'supplier' && !this.supplierIdParam) {
      this.loading.set(false);
      this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
      return;
    }
    // 'supplier' | 'unassigned' -- resolve the user's pays first.
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

  loadInvoice(): void {
    const id = this.invoiceId();
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      invoice:     this.svc.getCostInvoice(id),
      ledger:      this.svc.getSupplierLedger(id),
      attachments: this.svc.listAttachments(id),
      changes:     this.svc.getCostInvoiceChanges(id),
      users:       this.affaireSvc.getUsers(),
    }).subscribe({
      next: ({ invoice, ledger, attachments, changes, users }) => {
        this.invoice.set(invoice);
        this.ledger.set(ledger);
        this.attachments.set(attachments);
        this.changes.set(changes);
        this.allUsers.set(users);
        this.loading.set(false);
        this.resolveAffaireLabels(invoice);
      },
      error: () => {
        this.invoice.set(null);
        this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  /** CostLineDto only carries `affaireId` — resolve « référence — intitulé » per distinct id. */
  private resolveAffaireLabels(invoice: CostInvoiceDto): void {
    const ids = [...new Set((invoice.lines ?? []).map(l => l.affaireId).filter((x): x is number => x != null))];
    if (!ids.length) { this.affaireLabels.set(new Map()); return; }
    const calls: Observable<[number, string | null]>[] = ids.map(id =>
      this.affaireSvc.getAffaire(id).pipe(
        map((a): [number, string | null] => [id, [a.reference, a.intitule].filter(Boolean).join(' — ') || null]),
        catchError(() => of<[number, string | null]>([id, null])),
      ));
    forkJoin(calls).subscribe(pairs => {
      const m = new Map<number, string>();
      for (const [id, label] of pairs) if (label) m.set(id, label);
      this.affaireLabels.set(m);
    });
  }

  loadSupplierMode(): void {
    this.loading.set(true);
    this.error.set(null);
    const paysId = this.paysId();
    const isUnassigned = this.mode === 'unassigned';

    forkJoin({
      invoices: this.svc.getCostInvoices({
        paysId,
        supplierId: isUnassigned ? null : this.supplierIdParam,
        noSupplier: isUnassigned,
        size: SUPPLIER_MODE_PAGE_SIZE,
      }),
      // 'unassigned' mode never calls the ledger endpoint -- Tab 2 shows its "no
      // supplier" empty state.
      ledger: isUnassigned
        ? of<SupplierLedgerDto>({ supplier: null, rows: [] })
        : this.svc.getLedgerForSupplier(this.supplierIdParam),
      users:          this.affaireSvc.getUsers(),
      summaries:      this.svc.getCostInvoicesBySupplier(paysId),
      supplierDetail: isUnassigned
        ? of<SupplierDto | null>(null)
        : this.supplierSvc.getSupplier(this.supplierIdParam),
    }).subscribe({
      next: ({ invoices, ledger, users, summaries, supplierDetail }) => {
        this.supplierInvoices.set(invoices.content);
        this.ledger.set(ledger);
        this.allUsers.set(users);
        this.supplierDetail.set(supplierDetail);
        this.supplierSummary.set(
          summaries.find(s => isUnassigned ? s.supplierId == null : s.supplierId === this.supplierIdParam)
          ?? null,
        );
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  goToEdit(): void {
    if (!this.canEditInvoice()) return;
    this.router.navigate(['/finance/cost', this.invoiceId(), 'edit']);
  }

  /** DAF: same form, which switches to « modification après validation » on its own. */
  goToValidatedEdit(): void {
    if (!this.canEditValidated()) return;
    this.router.navigate(['/finance/cost', this.invoiceId(), 'edit']);
  }

  /** Supplier/unassigned list: open the invoice detail. */
  openInvoiceDto(inv: CostInvoiceDto): void {
    this.router.navigate(['/finance/cost', inv.id]);
  }

  goToInvoiceEdit(inv: CostInvoiceDto): void {
    this.router.navigate(['/finance/cost', inv.id, 'edit']);
  }

  /** 'supplier' mode only: creation form pre-filled with this supplier and pays. */
  goToNewLineForSupplier(): void {
    this.router.navigate(['/finance/cost/new'], {
      queryParams: { paysId: this.effectivePaysId(), supplierId: this.supplierIdParam },
    });
  }

  submitting = signal(false);

  /** 'line' mode: submit the invoice for approval. */
  submitInvoice(): void {
    const inv = this.invoice();
    if (!inv || !this.canEditInvoice()) return;
    this.submitting.set(true);
    this.svc.submitCostInvoice(inv.id).subscribe({
      next: () => { this.submitting.set(false); this.loadInvoice(); },
      error: err => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? this.translate.instant('COST.LINES.SUBMIT_ERROR'));
      },
    });
  }

  /** Supplier/unassigned list: submit one invoice. */
  submitInvoiceFromList(inv: CostInvoiceDto): void {
    this.svc.submitCostInvoice(inv.id).subscribe({
      next:  () => this.loadSupplierMode(),
      error: err => this.error.set(err.error?.message ?? this.translate.instant('COST.LINES.SUBMIT_ERROR')),
    });
  }

  // ── Règlement (payment), one per invoice ───────────────────────────────────

  private reloadCurrentMode(): void {
    if (this.mode === 'line') this.loadInvoice();
    else this.loadSupplierMode();
  }

  /** 'line' mode: pays THIS invoice. 'supplier' mode: pick among its payable invoices. */
  openNewReglement(): void {
    if (this.mode === 'line') {
      const inv = this.invoice();
      if (!inv || !this.invoicePayable()) return;
      this.openReglementForInvoice(inv);
      return;
    }
    const paysId = this.effectivePaysId();
    const supplierId = this.currentSupplierId();
    if (!paysId || !supplierId) return;
    this.svc.getCostInvoices({ paysId, status: 'APPROVED', supplierId, size: SUPPLIER_MODE_PAGE_SIZE }).subscribe({
      next: page => this.reglementModal.open(
        { editing: null, payableInvoices: page.content.filter(i => !i.reglement), paysId }, () => this.reloadCurrentMode()),
      error: () => this.reglementModal.open(
        { editing: null, payableInvoices: [], paysId }, () => this.reloadCurrentMode()),
    });
  }

  /** List shortcut: the caller already has the exact invoice. */
  openReglementForInvoice(inv: CostInvoiceDto): void {
    this.reglementModal.open({
      editing:               null,
      costInvoiceId:         inv.id,
      expectedAmount:        invoicePayableAmount(inv),
      invoiceReference:      inv.reference,
      supplierInvoiceNumber: inv.supplierInvoiceNumber,
      currency:              inv.currency,
      paysId:                inv.paysId,
    }, () => this.reloadCurrentMode());
  }

  openEditReglement(reglementId: number | null): void {
    if (reglementId == null) return;
    this.svc.getReglement(reglementId).subscribe({
      next: reglement => {
        const inv = [this.invoice(), ...this.supplierInvoices()]
          .find((i): i is CostInvoiceDto => !!i && i.id === reglement.costInvoiceId);
        this.reglementModal.open({
          editing:               reglement,
          costInvoiceId:         reglement.costInvoiceId,
          expectedAmount:        inv ? invoicePayableAmount(inv) : null,
          invoiceReference:      inv?.reference ?? null,
          supplierInvoiceNumber: inv?.supplierInvoiceNumber ?? null,
          currency:              inv?.currency ?? null,
          paysId:                inv?.paysId ?? null,
        }, () => this.reloadCurrentMode());
      },
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

/** Local calendar day as YYYY-MM-DD — never toISOString(), which shifts to UTC. */
function toIsoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}
