import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  ButtonComponent, DafCellDirective, DataTableComponent,
  MetricCardComponent, PageComponent, PageHeaderComponent, SectionCardComponent,
  TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, MetricCardOptions, MetricDelta, PageHeaderBadge,
  TabItem, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { CostService } from '../cost.service';
import { AffaireService } from '../../affaires/affaire.service';
import type { UserRefDto } from '../../affaires/affaire.model';
import { CostCategoryDto, CostLineDto, SupplierLedgerDto } from '../cost.model';
import {
  APPROVAL_BADGE_VARIANT, STATUS_BADGE_VARIANT, approvalLevelKey, canEdit,
  decisionKey, formatDate, statusKey,
} from '../cost-display';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { PermissionDirective } from '../../../shared/permission.directive';

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/**
 * Fiche en lecture seule d'une ligne de coût — `/finance/cost/:id`.
 *
 * Distincte de `/finance/cost/:id/edit` (le formulaire) et de la modale de décision
 * de la file d'approbation (approve/return/reject, qui reste inchangée) : cette page
 * est un arrêt optionnel supplémentaire avant la décision, pas un remplacement.
 *
 * Deux onglets :
 *   - « Détails »   : les champs propres de la ligne + son historique d'approbation
 *                      complet (déjà renvoyé par l'API aujourd'hui, affiché nulle part).
 *   - « Règlement » : le relevé de compte du FOURNISSEUR de cette ligne — pas
 *                      seulement cette ligne, tout l'historique validé/comptabilisé
 *                      de ce fournisseur, construit uniquement à partir des
 *                      `cost_lines` existantes (aucune nouvelle table).
 *
 * Squelette identique à `recouvrement-detail.component.ts` (UI-PLAYBOOK) : deux
 * colonnes en **flex inline**, jamais `grid` ni classes de point de rupture.
 */
@Component({
  selector: 'app-cost-line-detail',
  imports: [
    TranslatePipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent,
    MetricCardComponent, ButtonComponent,
    DataTableComponent, DafCellDirective,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './cost-line-detail.component.html',
})
export class CostLineDetailComponent implements OnInit {
  private readonly svc        = inject(CostService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);
  private readonly currency   = inject(DisplayCurrencyPipe);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);

  /** Lu sur `paramMap` plutôt que par `input()` lié à la route — voir recouvrement-detail
   *  pour la raison : ce remote est monté par le routeur du shell. */
  private readonly costLineId = Number(this.route.snapshot.paramMap.get('id'));

  costLine  = signal<CostLineDto | null>(null);
  ledger    = signal<SupplierLedgerDto | null>(null);
  allUsers  = signal<UserRefDto[]>([]);
  categories = signal<CostCategoryDto[]>([]);

  loading = signal(true);
  error   = signal<string | null>(null);

  /** Adossé au paramètre d'URL — survit au rechargement et au bouton précédent. */
  activeTab = tabParam(computed(() => this.tabs().map(t => t.id)), 'info');

  // ═══ Résolution catégorie / approbateur ═══════════════════════════════════

  /** Même mécanisme que cost-lines.component.ts — ne pas en inventer un second. */
  readonly categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c.labelFr])));

  categoryFor(id: number | null): string {
    if (id == null) return '—';
    return this.categoryMap().get(id) ?? this.translate.instant('COST.LINES.CAT_FALLBACK', { id });
  }

  /** Même mécanisme que affaire-ressources-tab.component.ts — ne pas en inventer un second. */
  approverName(id: number | null): string {
    if (id == null) return '—';
    return this.allUsers().find(u => u.id === id)?.fullName ?? '—';
  }

  readonly hasSupplier   = computed(() => this.costLine()?.supplierId != null);
  readonly supplierName  = computed(() =>
    this.ledger()?.supplier?.name ?? this.costLine()?.supplierNameFree ?? null);
  readonly canEditLine   = computed(() => {
    const cl = this.costLine();
    return cl ? canEdit(cl) : false;
  });

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly headerSubtitle = computed(() => {
    const cl = this.costLine();
    return cl ? (this.supplierName() ?? cl.label ?? '') : '';
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
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
    const cl = this.costLine();
    return [
      { label: this.translate.instant('COST.DETAIL.BACK'), link: ['..'] },
      { label: cl?.reference ?? `COUT-${this.costLineId}` },
    ];
  });

  // ═══ Colonne identité ═════════════════════════════════════════════════════

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
    const cl = this.costLine();
    if (!cl) return [];
    this.translate.currentLang();
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
    return [
      { id: 'info',      label: this.translate.instant('COST.DETAIL.TABS.INFO'),   count: this.costLine()?.approvals.length || null },
      { id: 'reglement', label: this.translate.instant('COST.DETAIL.TABS.LEDGER'), count: this.ledger()?.rows.length || null },
    ];
  });

  // ── Tab 1: historique d'approbation ───────────────────────────────────────

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
      _decision:      a.decision,
      _decisionLabel: t(decisionKey(a.decision)),
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

  // ── Tab 2: relevé fournisseur ──────────────────────────────────────────────

  readonly ledgerColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'date',           label: t('COST.DETAIL.LEDGER.COL_DATE'),            type: 'text' },
      { key: 'label',          label: t('COST.DETAIL.LEDGER.COL_LABEL'),           type: 'text' },
      { key: 'debit',          label: t('COST.DETAIL.LEDGER.COL_DEBIT'),           type: 'text', align: 'right' },
      { key: 'credit',         label: t('COST.DETAIL.LEDGER.COL_CREDIT'),          type: 'text', align: 'right' },
      { key: 'soldeDebiteur',  label: t('COST.DETAIL.LEDGER.COL_SOLDE_DEBITEUR'),  type: 'text', align: 'right' },
      { key: 'soldeCrediteur', label: t('COST.DETAIL.LEDGER.COL_SOLDE_CREDITEUR'), type: 'text', align: 'right' },
    ];
  });

  readonly ledgerRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return (this.ledger()?.rows ?? []).map((r, i) => ({
      id:             i,
      date:           formatDate(r.date),
      label:          r.label ?? '—',
      debit:          this.fmtAmount(r.debit),
      credit:         this.fmtAmount(r.credit),
      soldeDebiteur:  this.fmtAmount(r.soldeDebiteur),
      soldeCrediteur: this.fmtAmount(r.soldeCrediteur),
    }));
  });

  /**
   * SupplierLedgerRowDto carries no currency (see the plan's "Decisions needing
   * confirmation" #2 — the ledger sums grossAmountLocal across all qualifying lines
   * regardless of each line's own currency). Plain numeric formatting, deliberately
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

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    if (!this.costLineId) {
      this.loading.set(false);
      this.error.set(this.translate.instant('COST.DETAIL.LOAD_ERROR'));
      return;
    }
    this.load();
  }

  load(): void {
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

  // ═══ Actions ══════════════════════════════════════════════════════════════

  goToEdit(): void {
    this.router.navigate(['edit'], { relativeTo: this.route });
  }
}
