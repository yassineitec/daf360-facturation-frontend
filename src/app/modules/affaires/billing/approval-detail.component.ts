import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FinancePaths } from '../../../core/finance-paths';
import { CurrencyContextService } from '../../../core/currency-context.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow,
  PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent, MetricCardComponent,
  BreadcrumbItem, ButtonComponent, StatusBadgeComponent, BadgeVariant, FormFieldComponent,
  ModalService, ModalRef, SearchToolbarComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import type { MetricCardOptions, MetricDelta, PageHeaderBadge, TabItem } from '@khalilrebhiitec/daf360';
import {
  BillingService, JalonDetailDto, LineDetailDto, EntityAuditLogDto,
} from './billing.service';
import { AffaireService } from '../affaire.service';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { searchTableRows, tableTools } from '../../../shared/table-tools';
import { LivrableBatchDto } from '../livrable.model';
type DetailType = 'jalon' | 'line' | 'livrable';

interface HistoryRow {
  id: number;
  period: string;
  /** Clé de tri de `period` (date ISO ou AAAA-MM) : la période affichée est jj/mm ou MM/AAAA. */
  _periodKey: string;
  label: string;
  value: number;
  statut: string;
  isCurrent: boolean;
}

/** Une paire libellé/valeur en lecture seule. `label` est toujours une clé i18n. */
interface DetailField { label: string; value: string; }

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/** Clé i18n du libellé d'un statut, par type d'élément (repli sur le code brut). */
const STATUT_ENUM: Record<DetailType, string> = {
  jalon:    'ENUMS.JALON_STATUT',
  line:     'ENUMS.BILLING_LINE_STATUT',
  livrable: 'ENUMS.BILLING_LOT_STATUT',
};

/**
 * Fiche d'approbation (jalon, ligne de facturation, batch livrables) — même squelette
 * que la fiche facture :
 *   GAUCHE (30 %, sticky)  en-tête, carte d'identité, actions en pied de carte.
 *   DROITE (70 %)          indicateurs, puis onglets (historique / entrées, journal).
 */
import { PageGuideComponent } from '../../../shared/guide/page-guide.component';
import type { GuideStep } from '../../../shared/guide/page-guide.types';

/** Guide du détail — `target` = un `data-guide` du gabarit, `tab` = l'onglet à ouvrir. */
const step = (key: string, icon: string, target?: string, tab?: string): GuideStep => ({
  icon, titleKey: `GUIDE.APPROVAL_DETAIL.${key}_TITLE`, textKey: `GUIDE.APPROVAL_DETAIL.${key}_TEXT`, target, tab,
});
const GUIDE_STEPS: GuideStep[] = [
  step('INTRO', 'fact_check'),
  step('HEADER', 'label', 'approval-detail-header'),
  step('IDENTITY', 'badge', 'approval-detail-identity'),
  step('ACTIONS', 'bolt', 'approval-detail-actions'),
  step('KPIS', 'monitoring', 'approval-detail-kpis'),
  step('TABS', 'tab', 'approval-detail-tabs'),
  step('ITEMS', 'list', 'approval-detail-panel', 'items'),
  step('AUDIT', 'history', 'approval-detail-panel', 'audit'),
  step('END', 'help'),
];

@Component({
  selector: 'app-approval-detail',
  standalone: true,
  imports: [
    TranslatePipe, DataTableComponent, DafCellDirective, DisplayCurrencyPipe,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent, MetricCardComponent,
    ButtonComponent, StatusBadgeComponent, FormFieldComponent, SearchToolbarComponent,
    PageGuideComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './approval-detail.component.html',
  styleUrl: './approval-detail.component.scss',
})
export class ApprovalDetailComponent implements OnInit {
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly paths      = inject(FinancePaths);
  private readonly svc        = inject(BillingService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);
  private readonly modal      = inject(ModalService);
  private readonly currency   = inject(DisplayCurrencyPipe);
  private readonly currencyContext = inject(CurrencyContextService);

  @ViewChild('refuseTpl') private refuseTpl!: TemplateRef<unknown>;
  @ViewChild('returnTpl') private returnTpl!: TemplateRef<unknown>;

  type = signal<DetailType>('jalon');
  id   = signal(0);

  loading  = signal(true);
  errorMsg = signal<string | null>(null);

  jalon = signal<JalonDetailDto | null>(null);
  line  = signal<LineDetailDto | null>(null);
  livrableBatch = signal<LivrableBatchDto | null>(null);

  affaire       = signal<AffaireDetail | null>(null);
  siblingJalons = signal<JalonDetailDto[]>([]);
  siblingLines  = signal<LineDetailDto[]>([]);
  auditTrail    = signal<EntityAuditLogDto[]>([]);

  actioning   = signal(false);
  actionError = signal<string | null>(null);

  refuseMotif = signal('');
  refuseError = signal<string | null>(null);
  private refuseRef?: ModalRef;

  returnMotif = signal('');
  returnError = signal<string | null>(null);
  private returnRef?: ModalRef;

  /** Translated label for the item type — used both as the breadcrumb's current
   * (non-link) crumb and in the page title. */
  readonly detailTypeLabel = computed(() => {
    this.translate.currentLang();
    const key: Record<DetailType, string> = {
      jalon:    'AFFAIRES.billing.approval.detail.title_jalon',
      line:     'AFFAIRES.billing.approval.detail.title_line',
      livrable: 'AFFAIRES.billing.approval.detail.title_livrable',
    };
    return this.translate.instant(key[this.type()]);
  });

  /** Approbations > {référence affaire} > {type d'élément}. The middle crumb is the
   * only real navigation target here — back to the affaire itself. */
  readonly breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    const a = this.affaire();
    if (!a) return [];
    return [
      { label: this.translate.instant('AFFAIRES.billing.approval.title'), link: this.paths.approvalQueue() },
      { label: a.reference, link: this.paths.affaire(a.id) },
      { label: this.detailTypeLabel() },
    ];
  });

  readonly canAct = computed(() => this.statut() === (this.type() === 'jalon' ? 'EN_ATTENTE_VALIDATION' : 'EN_ATTENTE_DF'));

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  /** L'élément affiché, quel que soit son type — chargé ou pas encore. */
  readonly loaded = computed(() => !!(this.jalon() ?? this.line() ?? this.livrableBatch()));

  readonly statut = computed(() =>
    this.jalon()?.statut ?? this.line()?.statut ?? this.livrableBatch()?.statut ?? '');

  readonly devise = computed(() => this.line()?.devise ?? this.affaire()?.devise
    ?? this.currencyContext.defaultCurrency() ?? 'EUR');

  /** Le titre nomme l'élément lui-même ; l'affaire passe en sous-titre (lien). Pour une
   * ligne, le type est déjà le dernier élément du fil d'Ariane : le titre ne garde que
   * la période, sous sa forme courte (la plage exacte reste dans le champ « Période »). */
  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    const j = this.jalon();
    if (j) return j.label;
    const l = this.line();
    if (l) return this.lineTitle(l);
    return this.detailTypeLabel();
  });

  readonly headerSubtitle = computed(() => {
    const a = this.affaire();
    return a ? [a.clientName, a.reference].filter(Boolean).join(' · ') : '';
  });

  readonly affaireLink = computed<unknown[] | undefined>(() => {
    const a = this.affaire();
    return a ? this.paths.affaire(a.id) : undefined;
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    this.translate.currentLang();
    const statut = this.statut();
    if (!statut) return [];
    const badges: PageHeaderBadge[] = [
      { label: this.statusLabel(statut), variant: this.statusBadgeVariant(statut), dot: true },
    ];
    const mode = this.line()?.billingMode;
    if (mode) badges.push({ label: this.modeLabel(mode), variant: 'neutral' });
    return badges;
  });

  // ═══ Colonne identité ═════════════════════════════════════════════════════

  readonly identityLeadFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    return [
      { label: 'AFFAIRES.billing.approval.detail.affaire', value: [a.reference, a.intitule].filter(Boolean).join(' — ') },
      { label: 'AFFAIRES.billing.approval.detail.client',  value: a.clientName ?? '—' },
    ];
  });

  readonly identityGridFields = computed<DetailField[]>(() => {
    this.translate.currentLang();
    const a = this.affaire();
    const fields: DetailField[] = [];
    const j = this.jalon();
    const l = this.line();
    const b = this.livrableBatch();
    if (j) {
      fields.push(
        { label: 'AFFAIRES.billing.approval.detail.ordre', value: String(j.ordre) },
        { label: 'AFFAIRES.billing.approval.col_echeance', value: this.fmtDate(j.datePrevisionnelle) },
      );
    }
    if (l) {
      fields.push(
        { label: 'AFFAIRES.billing.approval.col_periode',         value: this.linePeriod(l) },
        { label: 'AFFAIRES.billing.approval.detail.billing_date', value: this.fmtDate(l.billingDate) },
      );
    }
    if (b) {
      fields.push({ label: 'AFFAIRES.billing.approval.detail.billing_date', value: this.fmtDate(b.billingDate) });
    }
    if (a) {
      fields.push(
        { label: 'AFFAIRES.billing.approval.detail.billing_mode',   value: this.modeLabel(a.billingMode) },
        { label: 'AFFAIRES.billing.approval.detail.affaire_statut', value: this.enumLabel('ENUMS.AFFAIRE_STATUT', a.statut) },
        { label: 'AFFAIRES.billing.approval.detail.budget',
          value: this.currency.transform(a.contractAmount ?? a.budgetPrevisionnel ?? null, this.devise()) },
        { label: 'AFFAIRES.billing.approval.detail.responsable',    value: a.responsableFullName ?? '—' },
      );
    }
    return fields;
  });

  /** Motif du dernier retour DF — mis en avant : c'est ce qu'on vient lire sur une ligne revenue. */
  readonly returnMotifShown = computed(() => this.line()?.dfMotif ?? null);

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  /** Cumul des éléments non annulés de l'affaire, rapporté au budget (null sans budget). */
  private readonly cumul = computed(() => {
    const rows = this.historyRows().filter(r => r.statut !== 'ANNULE');
    const total = rows.reduce((s, r) => s + r.value, 0);
    const a = this.affaire();
    const budget = a?.contractAmount ?? a?.budgetPrevisionnel ?? null;
    return { total, pct: budget ? Math.round((total / budget) * 100) : null };
  });

  readonly kpiTiles = computed<KpiTile[]>(() => {
    this.translate.currentLang();
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    const money = (v: number | null | undefined) => this.currency.transform(v ?? null, this.devise());
    const tiles: KpiTile[] = [];

    const j = this.jalon();
    const l = this.line();
    const b = this.livrableBatch();
    if (j) {
      tiles.push({
        label: 'AFFAIRES.billing.approval.col_montant', value: money(j.montant),
        delta: { value: `${t('AFFAIRES.billing.approval.col_echeance')} ${this.fmtDate(j.datePrevisionnelle)}`, direction: 'neutral' },
        options: { icon: 'flag', iconColor: 'text-primary', iconBg: 'bg-primary/10', valueColor: 'text-primary' },
      });
    }
    if (l) {
      tiles.push(
        {
          label: 'AFFAIRES.billing.approval.col_montant_ht', value: money(l.montantHt),
          delta: { value: t('AFFAIRES.billing.approval.detail.kpi_tva', { rate: l.tvaRate, amount: money(l.montantTva) }), direction: 'neutral' },
          options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
        },
        {
          label: 'AFFAIRES.billing.approval.detail.montant_ttc', value: money(l.montantTtc), delta: null,
          options: { icon: 'account_balance_wallet', iconColor: 'text-secondary', iconBg: 'bg-secondary/10', valueColor: 'text-primary' },
        },
      );
      if (l.wipAmount !== null) {
        tiles.push({
          label: 'AFFAIRES.billing.approval.detail.wip_amount', value: money(l.wipAmount), delta: null,
          options: { icon: 'schedule', iconColor: 'text-teal', iconBg: 'bg-teal/10' },
        });
      }
    }
    if (b) {
      tiles.push({
        label: 'AFFAIRES.billing.approval.col_montant_ht', value: money(b.combinedMontant),
        delta: { value: t('AFFAIRES.billing.approval.detail.kpi_entries', { count: b.entries.length }), direction: 'neutral' },
        options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10', valueColor: 'text-primary' },
      });
      if (b.clientApprovedAmount !== null) {
        tiles.push({
          label: 'AFFAIRES.WIP.CLIENT_AMOUNT_LABEL', value: money(b.clientApprovedAmount), delta: null,
          options: { icon: 'verified', iconColor: 'text-teal', iconBg: 'bg-teal/10' },
        });
      }
      if (b.wipCarriedForward !== null) {
        tiles.push({
          label: 'AFFAIRES.billing.approval.detail.carried_forward', value: money(b.wipCarriedForward), delta: null,
          options: { icon: 'redo', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
        });
      }
    }
    // Pas d'historique côté livrable : le cumul n'aurait rien à additionner.
    if (j || l) {
      const c = this.cumul();
      tiles.push({
        label: 'AFFAIRES.billing.approval.detail.kpi_cumul', value: money(c.total),
        delta: c.pct !== null
          ? { value: t('AFFAIRES.billing.approval.detail.kpi_budget_pct', { pct: c.pct }), direction: c.pct > 100 ? 'down' : 'neutral' }
          : null,
        options: { icon: 'trending_up', iconColor: 'text-teal', iconBg: 'bg-teal/10' },
      });
    }
    return tiles;
  });

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Même id pour les trois types : le premier onglet liste les entrées du batch
    // (livrable) ou l'historique de l'affaire (jalon, ligne).
    const first: TabItem = this.type() === 'livrable'
      ? { id: 'items', label: t('AFFAIRES.billing.approval.detail.tab_entries'), count: this.livrableEntryRows().length }
      : { id: 'items', label: t('AFFAIRES.billing.approval.detail.history'),     count: this.historyRows().length };
    return [
      first,
      { id: 'audit', label: t('AFFAIRES.billing.approval.detail.audit_trail'), count: this.auditTrail().length },
    ];
  });

  /** Adossé au paramètre d'URL — voir tabParam : survit au rechargement et au précédent. */
  activeTab = tabParam(computed(() => this.tabs().map(t => t.id)), 'items');

  readonly guideSteps = GUIDE_STEPS;

  /** L'onglet de l'utilisateur, rendu à la fermeture du guide (qui ouvre ceux qu'il explique). */
  private tabBeforeGuide: string | null = null;

  onGuideTab(tab: string): void {
    this.tabBeforeGuide ??= this.activeTab();
    this.activeTab.set(tab);
  }

  onGuideClosed(): void {
    if (this.tabBeforeGuide) this.activeTab.set(this.tabBeforeGuide);
    this.tabBeforeGuide = null;
  }

  /** Journal du plus récent au plus ancien. */
  readonly auditEntries = computed(() =>
    [...this.auditTrail()].sort((x, y) => y.timestampUtc.localeCompare(x.timestampUtc)));

  /** Unifies jalon/line history into one shape so a single table can render whichever applies. */
  readonly historyRows = computed<HistoryRow[]>(() => {
    const currentId = this.id();
    switch (this.type()) {
      case 'jalon':
        return this.siblingJalons().map(j => ({
          id: j.id,
          period: this.fmtDate(j.datePrevisionnelle),
          _periodKey: j.datePrevisionnelle ?? '',
          label: j.label,
          value: j.montant,
          statut: j.statut,
          isCurrent: j.id === currentId,
        }));
      case 'line':
        return this.siblingLines().map(l => ({
          id: l.id,
          period: `${String(l.periodMonth).padStart(2, '0')}/${l.periodYear}`,
          _periodKey: `${l.periodYear}-${String(l.periodMonth).padStart(2, '0')}`,
          label: this.modeLabel(l.billingMode),
          value: l.montantHt,
          statut: l.statut,
          isCurrent: l.id === currentId,
        }));
      case 'livrable':
        return [];
    }
  });

  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    // Tri local sur les deux tableaux de la fiche : tout arrive en un appel, sans
    // pagination. Les cellules projetées portent des valeurs brutes (montant, taux,
    // statut), la lib les trie donc directement ; la période passe par sa clé.
    return [
      { key: 'period',  label: this.translate.instant('AFFAIRES.billing.approval.col_periode'), type: 'text', sortable: true,
        sortAccessor: row => row['_periodKey'] as string },
      { key: 'label',   label: this.translate.instant('AFFAIRES.billing.approval.detail.item'), type: 'custom', sortable: true },
      { key: 'value',   label: this.translate.instant('AFFAIRES.billing.approval.col_montant'), type: 'custom', align: 'right', sortable: true },
      { key: 'statut',  label: this.translate.instant('AFFAIRES.billing.approval.col_statut'),  type: 'custom', sortable: true },
    ];
  });

  readonly auditColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'timestampUtc', label: this.translate.instant('AFFAIRES.billing.approval.col_date'),    type: 'custom', sortable: true },
      { key: 'action',       label: this.translate.instant('AFFAIRES.billing.approval.col_action'),  type: 'text',   sortable: true },
      // La transition se trie sur le statut d'arrivée.
      { key: 'transition',   label: this.translate.instant('AFFAIRES.billing.approval.col_statut'),  type: 'custom', sortable: true,
        sortAccessor: row => row['statutApres'] as string | null },
      { key: 'actorRole',    label: this.translate.instant('AFFAIRES.billing.approval.col_user'),    type: 'text',   sortable: true },
      { key: 'commentaire',  label: this.translate.instant('AFFAIRES.billing.approval.col_comment'), type: 'text',   sortable: true },
    ];
  });

  // ── daf-data-table: livrable batch entries ───────────────────────────────────
  readonly livrableEntryColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'document',     label: this.translate.instant('AFFAIRES.WIP.COL_DOCUMENT'), type: 'text', sortable: true },
      { key: 'pctPrecedent', label: this.translate.instant('AFFAIRES.billing.approval.detail.taux_precedent'), type: 'custom', align: 'right', sortable: true },
      { key: 'pctSaisi',     label: this.translate.instant('AFFAIRES.billing.approval.col_taux'), type: 'custom', align: 'right', sortable: true },
      { key: 'montant',      label: this.translate.instant('AFFAIRES.billing.approval.col_montant'), type: 'custom', align: 'right', sortable: true },
    ];
  });

  readonly livrableEntryRows = computed(() =>
    (this.livrableBatch()?.entries ?? []).map(e => ({
      id:           e.billingLineId,
      document:     e.documentNom ?? '—',
      pctPrecedent: e.pctPrecedent,
      pctSaisi:     e.pctSaisi,
      montant:      e.montantHt,
    }))
  );

  // ── Recherche locale des trois tableaux (tout est chargé d'un coup, sans pagination) ──
  readonly livrableEntrySearch = signal('');
  readonly historySearch       = signal('');
  readonly auditSearch         = signal('');

  readonly filteredLivrableEntryRows = computed(() =>
    searchTableRows(this.livrableEntryRows(), this.livrableEntryColumns(), this.livrableEntrySearch()));
  // Le statut affiché est traduit : la recherche porte sur le libellé, pas sur le code.
  readonly filteredHistoryRows = computed(() =>
    searchTableRows(this.historyRows(), this.historyColumns().map(c =>
      c.key === 'statut' ? { ...c, sortAccessor: (row: TableRow) => this.statusLabel(row['statut'] as string) } : c),
      this.historySearch()));
  // L'horodatage brut (ISO) et les codes de statut ne correspondent pas à ce qui est
  // affiché : on cherche sur la date formatée et sur les libellés traduits.
  readonly filteredAuditTrail = computed(() => {
    const cols = this.auditColumns().map(c =>
      c.key === 'timestampUtc' ? { ...c, sortAccessor: (row: TableRow) => this.fmtDateTime(row['timestampUtc'] as string | null) }
      : c.key === 'transition' ? { ...c, sortAccessor: (row: TableRow) =>
          `${this.statusLabel(row['statutAvant'] as string | null)} ${this.statusLabel(row['statutApres'] as string | null)}` }
      : c);
    return searchTableRows(this.auditEntries(), cols, this.auditSearch());
  });

  /** Outils de tableau communs (`tableTools`), comme sur `/finance/affaires`. Sans
   * en-tête de carte : l'onglet nomme déjà le tableau, l'en-tête restait une bande vide. */
  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: false, showHeader: false, ...tableTools(this.translate) }));

  ngOnInit(): void {
    const type = this.route.snapshot.paramMap.get('type') as DetailType;
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.type.set(type);
    this.id.set(id);
    this.loadItem();
  }

  private loadItem(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    const id = this.id();

    switch (this.type()) {
      case 'jalon':
        this.svc.getJalonDetail(id).subscribe({
          next: j => { this.jalon.set(j); this.loading.set(false); this.loadContext(j.affaireId, 'JALON'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
      case 'line':
        this.svc.getLineDetail(id).subscribe({
          next: l => { this.line.set(l); this.loading.set(false); this.loadContext(l.affaireId, 'BILLING_LINE'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
      case 'livrable':
        this.svc.getLivrableBatchDetail(id).subscribe({
          next: b => { this.livrableBatch.set(b); this.loading.set(false); this.loadContext(b.affaireId, 'BILLING_LINE'); },
          error: () => { this.loading.set(false); this.errorMsg.set(this.translate.instant('AFFAIRES.billing.approval.detail.load_error')); },
        });
        break;
    }
  }

  private loadContext(affaireId: number, entityType: string): void {
    this.affaireSvc.getAffaire(affaireId).subscribe({ next: a => this.affaire.set(a) });
    this.svc.getAuditByEntity(entityType, this.id()).subscribe({ next: a => this.auditTrail.set(a) });
    if (this.type() === 'jalon') this.svc.getJalonsDetailed(affaireId).subscribe({ next: h => this.siblingJalons.set(h) });
    if (this.type() === 'line')  this.svc.getBillingLinesDetailed(affaireId).subscribe({ next: h => this.siblingLines.set(h) });
  }

  fmtDate(d: string | null | undefined): string {
    if (!d) return '—';
    // Date-only strings (e.g. "2026-08-01", as sent for periodDateFrom/periodDateTo) are
    // parsed by `new Date(...)` as UTC midnight — in a negative-UTC-offset browser that
    // shifts the displayed day back by one. Parsed as local calendar components instead,
    // same as full timestamps (which already carry an offset/zone and aren't affected).
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d);
    const date = dateOnly
      ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
      : new Date(d);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  fmtDateTime(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  /** Libellé traduit d'un code d'énumération, ou le code brut s'il n'a pas de traduction. */
  private enumLabel(group: string, code: string | null | undefined): string {
    if (!code) return '—';
    const key = `${group}.${code}`;
    const label = this.translate.instant(key);
    return label === key ? code : label;
  }

  statusLabel(statut: string | null | undefined): string {
    return this.enumLabel(STATUT_ENUM[this.type()], statut);
  }

  modeLabel(mode: string | null | undefined): string {
    return this.enumLabel('ENUMS.BILLING_MODE', mode);
  }

  /** Plage réelle (WIP T&M, AV) quand elle existe, sinon le mois MM/AAAA. */
  private linePeriod(l: LineDetailDto): string {
    if (l.periodDateFrom && l.periodDateTo) return `${this.fmtDate(l.periodDateFrom)} → ${this.fmtDate(l.periodDateTo)}`;
    return `${String(l.periodMonth).padStart(2, '0')}/${l.periodYear}`;
  }

  /**
   * Période courte du titre :
   *   - mois civil entier (ou pas de plage)  → « Décembre 2026 »
   *   - plage partielle                       → « 01/12 → 15/12/2026 » (année une fois si commune)
   */
  private lineTitle(l: LineDetailDto): string {
    const from = l.periodDateFrom ? this.parseDateOnly(l.periodDateFrom) : null;
    const to   = l.periodDateTo   ? this.parseDateOnly(l.periodDateTo)   : null;

    if (from && to) {
      const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
      const fullMonth = from.getDate() === 1
        && to.getFullYear() === from.getFullYear() && to.getMonth() === from.getMonth()
        && to.getDate() === lastDay;
      if (!fullMonth) {
        const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        return from.getFullYear() === to.getFullYear()
          ? `${dm(from)} → ${dm(to)}/${to.getFullYear()}`
          : `${this.fmtDate(l.periodDateFrom)} → ${this.fmtDate(l.periodDateTo)}`;
      }
      return this.monthLabel(from);
    }
    return this.monthLabel(new Date(l.periodYear, l.periodMonth - 1, 1));
  }

  /** « Décembre 2026 », dans la langue de l'interface. */
  private monthLabel(d: Date): string {
    const lang = this.translate.currentLang();
    const locale = lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar' : 'fr-FR';
    const label = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /** `yyyy-MM-dd` en date locale — même raison que dans `fmtDate`. */
  private parseDateOnly(d: string): Date {
    return new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  }

  /** Coarse status → badge color, from the shared prefix/value conventions across
   * jalon/line/livrable statuses (EN_ATTENTE*, VALIDE*, FACTURE, RETOURNE, REFUSE/ANNULE). */
  statusBadgeVariant(statut: string | null | undefined): BadgeVariant {
    if (!statut) return 'neutral';
    if (statut.startsWith('EN_ATTENTE')) return 'warning';
    if (statut.startsWith('VALIDE'))     return 'info';
    if (statut === 'FACTURE')            return 'success';
    if (statut === 'RETOURNE')           return 'secondary';
    if (statut === 'REFUSE' || statut === 'ANNULE') return 'danger';
    return 'neutral';
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** L'action principale du pied de carte, selon le type d'élément. */
  validate(): void {
    switch (this.type()) {
      case 'jalon':    return this.validateJalon();
      case 'line':     return this.validateLine();
      case 'livrable': return this.validateLivrableBatch();
    }
  }

  goToAffaire(): void {
    const link = this.affaireLink();
    if (link) this.router.navigate(link);
  }

  openRefuseModal(): void {
    this.refuseMotif.set('');
    this.refuseError.set(null);
    this.refuseRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_refuse_title'),
      body: this.refuseTpl,
      size: 'sm',
      closeOnBackdrop: false,
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),     variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_refuse_btn'), variant: 'primary',   action: () => this.confirmRefuse() },
      ],
    });
  }

  confirmRefuse(): void {
    const motif = this.refuseMotif().trim();
    if (!motif) {
      this.refuseError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    this.refuseRef?.close();
    if (this.type() === 'jalon') this.runAction(this.svc.refuseJalon(this.id(), motif));
  }

  validateJalon(): void {
    this.runAction(this.svc.validateJalon(this.id()));
  }

  validateLine(): void {
    this.actioning.set(true);
    this.actionError.set(null);
    this.svc.validateDF(this.id()).subscribe({
      next: line => {
        // DF validation creates the draft invoice server-side (DFValidationService) —
        // jump straight into its edit stepper instead of leaving the user on this page,
        // since there's nothing left for them to check here once the invoice exists.
        if (line.invoiceId) {
          // fromApproval: the stepper's "Annuler" then reverts this validation instead of
          // leaving the draft invoice behind (InvoiceNewComponent.cancel()).
          this.router.navigate(this.paths.invoiceEdit(line.invoiceId),
            { queryParams: { fromApproval: 1 } });
        } else {
          this.actioning.set(false);
          this.loadItem();
        }
      },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }

  validateLivrableBatch(): void {
    // Same as validateLine() above — the batch's shared invoice is created as a DRAFT
    // (LivrableBillingService → DFValidationService.generateFromBillingLines), so the
    // edit stepper is where DF reviews it, not the read-only detail page.
    this.actioning.set(true);
    this.actionError.set(null);
    this.svc.validateLivrableBatch(this.id()).subscribe({
      next: batch => {
        if (batch.invoiceId) {
          this.router.navigate(this.paths.invoiceEdit(batch.invoiceId),
            { queryParams: { fromApproval: 1 } });
        } else {
          this.actioning.set(false);
          this.loadItem();
        }
      },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }

  openReturnModal(): void {
    this.returnMotif.set('');
    this.returnError.set(null);
    this.returnRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_return_title'),
      body: this.returnTpl,
      size: 'sm',
      closeOnBackdrop: false,
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),  variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_confirm'), variant: 'primary',   action: () => this.confirmReturn() },
      ],
    });
  }

  confirmReturn(): void {
    const motif = this.returnMotif().trim();
    if (!motif) {
      this.returnError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    this.returnRef?.close();
    const request$ = this.type() === 'livrable'
      ? this.svc.returnLivrableBatch(this.id(), motif)
      : this.svc.returnDF(this.id(), motif);
    this.runAction(request$);
  }

  private runAction(obs: { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => void }): void {
    this.actioning.set(true);
    this.actionError.set(null);
    obs.subscribe({
      next: () => { this.actioning.set(false); this.loadItem(); },
      error: (err: any) => {
        this.actioning.set(false);
        this.actionError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.billing.approval.detail.action_error'));
      },
    });
  }
}
