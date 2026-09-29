import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService }    from '@ngx-translate/core';
import { forkJoin, Observable, switchMap }    from 'rxjs';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableAction, TableRow,
  PageComponent, PageHeaderComponent, MetricCardComponent, MetricCardOptions,
  TabsComponent, TabItem, PaginationComponent,
  StatusBadgeComponent, BadgeVariant,
  FormFieldComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, FilterField, FilterResult,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';
import {
  BillingService,
  PendingJalonDto, PendingBillingLineDto, PendingLivrableBatchDto,
  PendingCreditNoteDto, AuditLogEntryDto,
} from './billing.service';
// Not a BillingLine like the three sources above — a credit note already IS an Invoice
// (submitted directly at creation), so validating/returning one goes through the
// ordinary invoicing lifecycle endpoints instead of BillingService.
import { InvoiceService } from '../../invoicing/invoice.service';
import { CREDIT_NOTE_REASONS } from '../../invoicing/invoice.model';
type ActiveTab = 'df' | 'history';
// Three tabs grouped by billing mode (FORFAIT/REGIE/LIVRABLE) instead of by entity
// type — each tab stacks the sections relevant to its mode (see the .html), e.g.
// 'forfaitaire' shows both FORFAIT billing lines (AV taux included — see loadDF()) and
// FORFAIT credit notes.
type DfSubTab  = 'forfaitaire' | 'regie' | 'livrable';

const LINE_STATUT_VARIANT: Record<string, BadgeVariant> = {
  EN_ATTENTE_DF: 'warning',
  VALIDE_DF:     'info',
  FACTURE:       'success',
  RETOURNE:      'secondary',
  ANNULE:        'danger',
};

/** Filtres d'une section « lignes de facturation » (FORFAIT ou RÉGIE) — un signal par champ. */
class LineFilterState {
  /** Statut de la ligne, '' = tous. */
  readonly statut    = signal('');
  /** Affaire de la ligne (id en texte), '' = toutes. */
  readonly affaire   = signal('');
  /** Période de la ligne ('MM/YYYY'), '' = toutes. */
  readonly periode   = signal('');
  /** Montant HT minimum, saisi en texte ('1 500,50' accepté, '' = pas de borne). */
  readonly amountMin = signal('');
  /** Montant HT maximum, saisi en texte ('' = pas de borne). */
  readonly amountMax = signal('');

  /** Relit chaque champ du panneau (un select émet un scalaire, un text une chaîne). */
  apply(result: FilterResult): void {
    this.statut.set(selectValue(result, 'statut'));
    this.affaire.set(selectValue(result, 'affaire'));
    this.periode.set(selectValue(result, 'periode'));
    this.amountMin.set(textValue(result, 'amountMin'));
    this.amountMax.set(textValue(result, 'amountMax'));
  }
}

/** `select` : scalaire émis à l'apply (string[] en interne) — normalise les deux formes. */
function selectValue(result: FilterResult, key: string): string {
  const v = result[key];
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
  return typeof v === 'string' ? v : '';
}

function textValue(result: FilterResult, key: string): string {
  const v = result[key];
  return typeof v === 'string' ? v : '';
}

/** Jour calendaire local → 'yyyy-MM-dd' — jamais toISOString() (UTC, décale d'un jour). */
function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Jour ('yyyy-MM-dd' ou date-heure ISO) dans la plage `daterange` (1 date = un seul jour).
 *  Sans plage : tout passe ; plage mais pas de date : exclu. */
function inDayRange(value: string | null | undefined, range: Date[] | null): boolean {
  if (!range || !range.length) return true;
  if (!value) return false;
  const day  = value.length <= 10 ? value : toIsoDay(new Date(value));
  const from = toIsoDay(range[0]);
  const to   = toIsoDay(range[range.length - 1]);
  return day >= from && day <= to;
}

/** Borne de montant saisie en texte ('1 500,50' accepté) → nombre, ou null si vide/invalide. */
function parseAmount(raw: string): number | null {
  // `\s` couvre aussi les espaces insécables qu'insère le formatage fr-FR.
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Montant dans [min, max] ; borne nulle ignorée, montant absent exclu dès qu'une borne est posée. */
function inAmountRange(amount: number | null | undefined, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  if (amount == null) return false;
  return (min == null || amount >= min) && (max == null || amount <= max);
}

/** 'MM/YYYY' → 'YYYY-MM', pour trier les périodes chronologiquement. */
function periodeKey(p: string): string {
  const [m, y] = p.split('/');
  return `${y ?? ''}-${m ?? ''}`;
}

/** Affaires distinctes des lignes chargées (valeur = id), triées par référence. */
function affaireOptions(rows: { affaireId: number | null; affaireRef: string | null; affaireIntitule: string | null }[]) {
  const seen = new Map<number, string>();
  for (const r of rows) {
    if (r.affaireId != null && !seen.has(r.affaireId)) {
      const label = [r.affaireRef, r.affaireIntitule].filter(Boolean).join(' — ');
      seen.set(r.affaireId, label || `#${r.affaireId}`);
    }
  }
  return [...seen].map(([id, label]) => ({ value: String(id), label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    RouterLink, TranslatePipe, DataTableComponent, DafCellDirective,
    PageComponent, PageHeaderComponent, MetricCardComponent,
    TabsComponent, StatusBadgeComponent, FormFieldComponent, PaginationComponent,
    SearchToolbarComponent,
  ],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc        = inject(BillingService);
  private readonly invoiceSvc = inject(InvoiceService);
  private readonly translate  = inject(TranslateService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly modal      = inject(ModalService);

  @ViewChild('dfRetourTpl') private dfRetourTpl!: TemplateRef<unknown>;

  // Mirrors first-load skeleton pattern used elsewhere (see CostApprovalQueueComponent) —
  // only the very first fetch shows the daf-page skeleton, tab switches never do.
  firstLoad     = signal(true);
  activeTab     = signal<ActiveTab>('df');
  activeDfSubTab = signal<DfSubTab>('forfaitaire');
  dfLoading     = signal(false);
  histLoading   = signal(false);

  // ── Per-section search + filter state — every stacked table (lines × mode, livrable
  // batches, credit notes × mode) owns its own text/filter, kept independent of the
  // others (switching tabs, or scrolling past another section, must not bleed one
  // table's search into another's rows). A single shared daf-search-toolbar instance
  // isn't reused across sections (see the .html): daf-filter seeds its internal state
  // from `initialValues` only once per component instance, so swapping `filterFields`
  // under a live instance wouldn't reset stale field keys from the previous section. ──
  lineForfaitSearch     = signal('');
  readonly lineForfaitFilter = new LineFilterState();
  lineRegieSearch       = signal('');
  readonly lineRegieFilter   = new LineFilterState();
  livrableBatchSearch   = signal('');
  /** Jour ou plage [début, fin] de `billingDate` du batch, ou null. */
  livrableBatchDateRange   = signal<Date[] | null>(null);
  /** Affaire du batch (id en texte), '' = toutes. */
  livrableBatchAffaire     = signal('');
  /** Montant cumulé minimum, saisi en texte ('1 500,50' accepté, '' = pas de borne). */
  livrableBatchAmountMin   = signal('');
  /** Montant cumulé maximum, saisi en texte ('' = pas de borne). */
  livrableBatchAmountMax   = signal('');
  /** Ne garder que les batches regroupant plusieurs documents. */
  livrableBatchMultiDocOnly = signal(false);
  creditNoteForfaitSearch  = signal('');
  creditNoteForfaitFilter  = signal<FilterResult>({});
  creditNoteRegieSearch    = signal('');
  creditNoteRegieFilter    = signal<FilterResult>({});
  creditNoteLivrableSearch = signal('');
  creditNoteLivrableFilter = signal<FilterResult>({});

  pendingJalons = signal<PendingJalonDto[]>([]);
  pendingLines  = signal<PendingBillingLineDto[]>([]);
  pendingLivrableBatches = signal<PendingLivrableBatchDto[]>([]);
  pendingCreditNotes     = signal<PendingCreditNoteDto[]>([]);
  auditLog      = signal<AuditLogEntryDto[]>([]);

  dfRetourMotif = signal('');
  dfRetourError = signal<string | null>(null);
  private dfRetourRef?: ModalRef;
  private dfRetourEntityId = 0;
  private dfRetourType: 'line' | 'livrableBatch' | 'creditNote' = 'line';

  readonly kpiRfOptions: MetricCardOptions = { icon: 'pending_actions', iconBg: 'bg-warning/10', iconColor: 'text-warning' };
  readonly kpiDfOptions: MetricCardOptions = { icon: 'task_alt', iconBg: 'bg-tertiary/10', iconColor: 'text-tertiary' };
  readonly kpiHistoryOptions: MetricCardOptions = { icon: 'history', iconBg: 'bg-teal/10', iconColor: 'text-teal' };

  readonly dfCount = computed(() =>
    this.pendingLines().length + this.pendingLivrableBatches().length + this.pendingCreditNotes().length
  );

  readonly tabItems = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'df',      label: this.translate.instant('AFFAIRES.billing.approval.tab_df'),      icon: 'task_alt', count: this.dfCount() || null },
      { id: 'history', label: this.translate.instant('AFFAIRES.billing.approval.tab_history'), icon: 'history' },
    ];
  });

  // ── "df" sub-strip (daf-tabs, variant="pill") — now grouped by billing mode
  // (FORFAIT/REGIE/LIVRABLE) instead of by entity type: each tab stacks every section
  // that belongs to its mode (see the .html). ──
  readonly dfSubTabItems = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'forfaitaire', label: t('AFFAIRES.billing.approval.tab_forfaitaire'),      count: this.forfaitaireCount() || null },
      { id: 'regie',       label: t('AFFAIRES.billing.approval.tab_regie'),            count: this.regieCount() || null },
      { id: 'livrable',    label: t('AFFAIRES.billing.approval.tab_livrable_batches'), count: this.livrableCount() || null },
    ];
  });

  // ── Per-mode source lists — split from the flat pendingLines()/pendingCreditNotes()
  // fetched by loadDF(). Livrable batches are always mode LIVRABLE, so they don't need
  // splitting. ──
  readonly linesForfait        = computed(() => this.pendingLines().filter(l => l.mode === 'FORFAIT'));
  readonly linesRegie          = computed(() => this.pendingLines().filter(l => l.mode === 'REGIE'));
  readonly creditNotesForfait  = computed(() => this.pendingCreditNotes().filter(c => c.billingMode === 'FORFAIT'));
  readonly creditNotesRegie    = computed(() => this.pendingCreditNotes().filter(c => c.billingMode === 'REGIE'));
  readonly creditNotesLivrable = computed(() => this.pendingCreditNotes().filter(c => c.billingMode === 'LIVRABLE'));

  readonly forfaitaireCount = computed(() =>
    this.linesForfait().length + this.creditNotesForfait().length
  );
  readonly regieCount = computed(() => this.linesRegie().length + this.creditNotesRegie().length);
  readonly livrableCount = computed(() =>
    this.pendingLivrableBatches().length + this.creditNotesLivrable().length
  );

  // ── daf-data-table: Billing lines (DF) ───────────────────────────────────────
  readonly lineColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',   label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'),    type: 'custom', sortable: true,
        sortAccessor: row => row['affaireRef'] },
      { key: 'reference', label: this.translate.instant('AFFAIRES.billing.approval.col_reference'),  type: 'custom', sortable: true },
      { key: 'periode',   label: this.translate.instant('AFFAIRES.billing.approval.col_periode'),    type: 'custom', sortable: true },
      { key: 'montantHt', label: this.translate.instant('AFFAIRES.billing.approval.col_montant_ht'), type: 'custom', align: 'right', sortable: true,
        sortAccessor: row => row['_raw'].montantHt },
      { key: 'mode',      label: this.translate.instant('AFFAIRES.billing.approval.col_mode'),        type: 'custom', sortable: true },
      { key: 'statut',    label: this.translate.instant('AFFAIRES.billing.approval.col_statut'),      type: 'custom', sortable: true },
    ];
  });

  private mapLineRows(lines: PendingBillingLineDto[]) {
    return lines.map(line => ({
      id:              line.id,
      affaireId:       line.affaireId,
      affaireRef:      line.affaireRef,
      affaireIntitule: line.affaireIntitule,
      reference:       line.reference,
      periode:         line.periode,
      montantHt:       this.fmtAmt(line.montantHt),
      mode:            line.mode,
      statut:          line.statut,
      _raw:            line,
    }));
  }

  readonly lineRowsForfait = computed(() => this.mapLineRows(this.linesForfait()));
  readonly lineRowsRegie   = computed(() => this.mapLineRows(this.linesRegie()));

  // Options derived from the pending rows themselves rather than hardcoded — `statut`
  // is expected to sit at EN_ATTENTE_DF for everything in this list, so guessing a
  // fixed enum here would drift from reality. No `mode` filter here: each section is
  // already scoped to one mode.
  // Affaire / période options are likewise derived from the section's own rows, so every
  // option matches at least one line.
  private statutFilterFields(lines: PendingBillingLineDto[]): FilterField[] {
    const t = (key: string) => this.translate.instant(key);
    const statuts  = [...new Set(lines.map(l => l.statut).filter(Boolean))];
    // 'MM/YYYY' (DFValidationService.getPendingDFGlobal) — trié chronologiquement.
    const periodes = [...new Set(lines.map(l => l.periode).filter((p): p is string => !!p))]
      .sort((a, b) => periodeKey(a).localeCompare(periodeKey(b)));
    return [{
      name:    'statut',
      label:   t('AFFAIRES.billing.approval.filter_statut'),
      type:    'select',
      options: statuts.map(s => ({ value: s, label: this.lineStatusLabel(s) })),
    }, {
      name:       'affaire',
      label:      t('AFFAIRES.billing.approval.col_affaire'),
      type:       'select',
      searchable: true,
      options:    affaireOptions(lines),
    }, {
      name:    'periode',
      label:   t('AFFAIRES.billing.approval.col_periode'),
      type:    'select',
      options: periodes.map(p => ({ value: p, label: p })),
    }, {
      name:        'amountMin',
      label:       t('AFFAIRES.billing.approval.filter_amount_ht_min'),
      type:        'text',
      placeholder: t('AFFAIRES.billing.approval.filter_amount_ph'),
    }, {
      name:        'amountMax',
      label:       t('AFFAIRES.billing.approval.filter_amount_ht_max'),
      type:        'text',
      placeholder: t('AFFAIRES.billing.approval.filter_amount_ph'),
    }];
  }

  readonly lineFilterFieldsForfait = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return this.statutFilterFields(this.linesForfait());
  });
  readonly lineFilterFieldsRegie = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return this.statutFilterFields(this.linesRegie());
  });

  // Panel-internal shape: select → string[], text → string (see daf-filter).
  private lineFilterConfigFor(filter: LineFilterState): SearchToolbarFilterConfig {
    const t = (key: string) => this.translate.instant(key);
    return {
      title:         t('AFFAIRES.billing.approval.filter_title'),
      applyLabel:    t('AFFAIRES.billing.approval.filter_apply'),
      cancelLabel:   t('AFFAIRES.billing.approval.filter_cancel'),
      resetLabel:    t('AFFAIRES.billing.approval.filter_reset'),
      align:         'right',
      initialValues: {
        statut:    filter.statut()  ? [filter.statut()]  : [],
        affaire:   filter.affaire() ? [filter.affaire()] : [],
        periode:   filter.periode() ? [filter.periode()] : [],
        amountMin: filter.amountMin(),
        amountMax: filter.amountMax(),
      },
    };
  }

  readonly lineFilterConfigForfait = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    return this.lineFilterConfigFor(this.lineForfaitFilter);
  });
  readonly lineFilterConfigRegie = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    return this.lineFilterConfigFor(this.lineRegieFilter);
  });

  onLineForfaitSearch(value: string): void {
    this.lineForfaitSearch.set(value);
    this.lineForfaitPage.set(0);
  }

  onLineForfaitFilterApply(result: FilterResult): void {
    this.lineForfaitFilter.apply(result);
    this.lineForfaitPage.set(0);
  }

  onLineRegieSearch(value: string): void {
    this.lineRegieSearch.set(value);
    this.lineRegiePage.set(0);
  }

  onLineRegieFilterApply(result: FilterResult): void {
    this.lineRegieFilter.apply(result);
    this.lineRegiePage.set(0);
  }

  private filterLineRows(
    rows: ReturnType<typeof this.mapLineRows>,
    search: string,
    filter: LineFilterState,
  ) {
    const q       = search.trim().toLowerCase();
    const statut  = filter.statut();
    const affaire = filter.affaire();
    const periode = filter.periode();
    const min     = parseAmount(filter.amountMin());
    const max     = parseAmount(filter.amountMax());
    return rows.filter(r => {
      if (q && !`${r.affaireRef} ${r.affaireIntitule} ${r.reference}`.toLowerCase().includes(q)) return false;
      if (statut && r._raw.statut !== statut) return false;
      if (affaire && String(r._raw.affaireId) !== affaire) return false;
      if (periode && r._raw.periode !== periode) return false;
      if (!inAmountRange(r._raw.montantHt, min, max)) return false;
      return true;
    });
  }

  readonly filteredLineRowsForfait = computed(() =>
    this.filterLineRows(this.lineRowsForfait(), this.lineForfaitSearch(), this.lineForfaitFilter));
  readonly filteredLineRowsRegie = computed(() =>
    this.filterLineRows(this.lineRowsRegie(), this.lineRegieSearch(), this.lineRegieFilter));

  private pageRows<T>(rows: T[], page: number, size: number): T[] {
    const p = Math.min(page, Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(p * size, p * size + size);
  }

  lineForfaitPage     = signal(0);
  lineForfaitPageSize = signal(10);
  readonly lineForfaitTotalPages = computed(() => Math.ceil(this.filteredLineRowsForfait().length / this.lineForfaitPageSize()));
  readonly pagedLineRowsForfait = computed(() =>
    this.pageRows(this.filteredLineRowsForfait(), this.lineForfaitPage(), this.lineForfaitPageSize()));

  lineRegiePage     = signal(0);
  lineRegiePageSize = signal(10);
  readonly lineRegieTotalPages = computed(() => Math.ceil(this.filteredLineRowsRegie().length / this.lineRegiePageSize()));
  readonly pagedLineRowsRegie = computed(() =>
    this.pageRows(this.filteredLineRowsRegie(), this.lineRegiePage(), this.lineRegiePageSize()));

  // ── daf-data-table: Livrable batches (DF) ────────────────────────────────────
  readonly livrableBatchColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',     label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'), type: 'custom', sortable: true,
        sortAccessor: row => row['affaireRef'] },
      { key: 'documents',   label: this.translate.instant('AFFAIRES.billing.approval.col_documents'), type: 'custom', align: 'right', sortable: true },
      { key: 'montant',     label: this.translate.instant('AFFAIRES.billing.approval.col_montant'), type: 'custom', align: 'right', sortable: true,
        sortAccessor: row => row['_raw'].combinedMontant },
      { key: 'billingDate', label: this.translate.instant('AFFAIRES.billing.approval.col_date'), type: 'custom', sortable: true,
        sortAccessor: row => row['_raw'].billingDate },
    ];
  });

  readonly livrableBatchRows = computed(() =>
    this.pendingLivrableBatches().map(b => ({
      id:              b.batchId,
      affaireId:       b.affaireId,
      affaireRef:      b.affaireRef,
      affaireIntitule: b.affaireIntitule,
      documents:       b.documentCount,
      montant:         this.fmtAmt(b.combinedMontant),
      billingDate:     this.fmtDate(b.billingDate),
      _raw:            b,
    }))
  );

  readonly livrableBatchFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [{
      name:  'billingDate',
      label: t('AFFAIRES.billing.approval.filter_billing_date'),
      type:  'daterange',
    }, {
      name:       'affaire',
      label:      t('AFFAIRES.billing.approval.col_affaire'),
      type:       'select',
      searchable: true,
      options:    affaireOptions(this.pendingLivrableBatches()),
    }, {
      name:        'amountMin',
      label:       t('AFFAIRES.billing.approval.filter_amount_min'),
      type:        'text',
      placeholder: t('AFFAIRES.billing.approval.filter_amount_ph'),
    }, {
      name:        'amountMax',
      label:       t('AFFAIRES.billing.approval.filter_amount_max'),
      type:        'text',
      placeholder: t('AFFAIRES.billing.approval.filter_amount_ph'),
    }, {
      name:  'multiDocOnly',
      label: t('AFFAIRES.billing.approval.filter_multi_doc_only'),
      type:  'checkbox',
    }];
  });

  readonly livrableBatchFilterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:         t('AFFAIRES.billing.approval.filter_title'),
      applyLabel:    t('AFFAIRES.billing.approval.filter_apply'),
      cancelLabel:   t('AFFAIRES.billing.approval.filter_cancel'),
      resetLabel:    t('AFFAIRES.billing.approval.filter_reset'),
      align:         'right',
      initialValues: {
        billingDate:  this.livrableBatchDateRange(),
        affaire:      this.livrableBatchAffaire() ? [this.livrableBatchAffaire()] : [],
        amountMin:    this.livrableBatchAmountMin(),
        amountMax:    this.livrableBatchAmountMax(),
        multiDocOnly: this.livrableBatchMultiDocOnly(),
      },
    };
  });

  onLivrableBatchSearch(value: string): void {
    this.livrableBatchSearch.set(value);
    this.livrableBatchPage.set(0);
  }

  onLivrableBatchFilterApply(result: FilterResult): void {
    const range = result['billingDate'];
    this.livrableBatchDateRange.set(Array.isArray(range) && range.length ? range as Date[] : null);
    this.livrableBatchAffaire.set(selectValue(result, 'affaire'));
    this.livrableBatchAmountMin.set(textValue(result, 'amountMin'));
    this.livrableBatchAmountMax.set(textValue(result, 'amountMax'));
    this.livrableBatchMultiDocOnly.set(result['multiDocOnly'] === true);
    this.livrableBatchPage.set(0);
  }

  readonly filteredLivrableBatchRows = computed(() => {
    const q       = this.livrableBatchSearch().trim().toLowerCase();
    const range   = this.livrableBatchDateRange();
    const affaire = this.livrableBatchAffaire();
    const min     = parseAmount(this.livrableBatchAmountMin());
    const max     = parseAmount(this.livrableBatchAmountMax());
    const multi   = this.livrableBatchMultiDocOnly();
    return this.livrableBatchRows().filter(r => {
      if (q && !`${r.affaireRef} ${r.affaireIntitule}`.toLowerCase().includes(q)) return false;
      if (!inDayRange(r._raw.billingDate, range)) return false;
      if (affaire && String(r._raw.affaireId) !== affaire) return false;
      if (!inAmountRange(r._raw.combinedMontant, min, max)) return false;
      if (multi && r._raw.documentCount < 2) return false;
      return true;
    });
  });

  livrableBatchPage     = signal(0);
  livrableBatchPageSize = signal(10);
  readonly livrableBatchTotalPages = computed(() => Math.ceil(this.filteredLivrableBatchRows().length / this.livrableBatchPageSize()));
  readonly pagedLivrableBatchRows = computed(() => {
    const rows = this.filteredLivrableBatchRows();
    const size = this.livrableBatchPageSize();
    const page = Math.min(this.livrableBatchPage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

  // ── daf-data-table: Credit notes / avoirs (DF) ───────────────────────────────
  readonly creditNoteColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',   label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'),  type: 'custom', sortable: true,
        sortAccessor: row => row['affaireRef'] },
      { key: 'reference', label: this.translate.instant('AFFAIRES.billing.approval.col_reference'), type: 'custom', sortable: true },
      { key: 'montant',   label: this.translate.instant('AFFAIRES.billing.approval.col_montant'),  type: 'custom', align: 'right', sortable: true,
        sortAccessor: row => Math.abs(row['_raw'].montantTtc) },
      { key: 'motif',     label: this.translate.instant('AFFAIRES.billing.approval.col_motif'),    type: 'custom', sortable: true },
      { key: 'soumis',    label: this.translate.instant('AFFAIRES.billing.approval.col_soumis'),   type: 'custom', sortable: true,
        sortAccessor: row => row['_raw'].submittedAt },
    ];
  });

  private mapCreditNoteRows(notes: PendingCreditNoteDto[]) {
    return notes.map(cn => ({
      id:              cn.id,
      affaireId:       cn.affaireId,
      affaireRef:      cn.affaireRef,
      affaireIntitule: cn.affaireIntitule,
      reference:       cn.linkedInvoiceNumber ?? '—',
      // Toujours négatif (voir InvoiceService.createCreditNote) — Math.abs pour afficher
      // le montant crédité plutôt qu'un signe qui n'apporte rien à ce stade.
      montant:         this.fmtAmt(Math.abs(cn.montantTtc)),
      motif:           this.creditNoteReasonLabel(cn.creditNoteReason),
      soumis:          this.fmtDate(cn.submittedAt),
      _raw:            cn,
    }));
  }

  readonly creditNoteRowsForfait  = computed(() => this.mapCreditNoteRows(this.creditNotesForfait()));
  readonly creditNoteRowsRegie    = computed(() => this.mapCreditNoteRows(this.creditNotesRegie()));
  readonly creditNoteRowsLivrable = computed(() => this.mapCreditNoteRows(this.creditNotesLivrable()));

  readonly creditNoteFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [{
      name:    'motif',
      label:   this.translate.instant('AFFAIRES.billing.approval.filter_motif'),
      type:    'select',
      options: Object.entries(CREDIT_NOTE_REASONS).map(([value, key]) => ({
        value, label: this.translate.instant(key),
      })),
    }];
  });

  private creditNoteFilterConfigFor(filter: FilterResult): SearchToolbarFilterConfig {
    const t = (key: string) => this.translate.instant(key);
    return {
      title:         t('AFFAIRES.billing.approval.filter_title'),
      applyLabel:    t('AFFAIRES.billing.approval.filter_apply'),
      cancelLabel:   t('AFFAIRES.billing.approval.filter_cancel'),
      resetLabel:    t('AFFAIRES.billing.approval.filter_reset'),
      align:         'right',
      initialValues: filter,
    };
  }

  readonly creditNoteFilterConfigForfait = computed(() => this.creditNoteFilterConfigFor(this.creditNoteForfaitFilter()));
  readonly creditNoteFilterConfigRegie   = computed(() => this.creditNoteFilterConfigFor(this.creditNoteRegieFilter()));
  readonly creditNoteFilterConfigLivrable = computed(() => this.creditNoteFilterConfigFor(this.creditNoteLivrableFilter()));

  onCreditNoteForfaitSearch(value: string): void {
    this.creditNoteForfaitSearch.set(value);
    this.creditNoteForfaitPage.set(0);
  }

  onCreditNoteForfaitFilterApply(result: FilterResult): void {
    this.creditNoteForfaitFilter.set(result);
    this.creditNoteForfaitPage.set(0);
  }

  onCreditNoteRegieSearch(value: string): void {
    this.creditNoteRegieSearch.set(value);
    this.creditNoteRegiePage.set(0);
  }

  onCreditNoteRegieFilterApply(result: FilterResult): void {
    this.creditNoteRegieFilter.set(result);
    this.creditNoteRegiePage.set(0);
  }

  onCreditNoteLivrableSearch(value: string): void {
    this.creditNoteLivrableSearch.set(value);
    this.creditNoteLivrablePage.set(0);
  }

  onCreditNoteLivrableFilterApply(result: FilterResult): void {
    this.creditNoteLivrableFilter.set(result);
    this.creditNoteLivrablePage.set(0);
  }

  private filterCreditNoteRows(
    rows: ReturnType<typeof this.mapCreditNoteRows>,
    search: string,
    filter: FilterResult,
  ) {
    const q     = search.trim().toLowerCase();
    const motif = filter['motif'] as string | null;
    return rows.filter(r => {
      if (q && !`${r.affaireRef} ${r.affaireIntitule} ${r.reference}`.toLowerCase().includes(q)) return false;
      if (motif && r._raw.creditNoteReason !== motif) return false;
      return true;
    });
  }

  readonly filteredCreditNoteRowsForfait = computed(() =>
    this.filterCreditNoteRows(this.creditNoteRowsForfait(), this.creditNoteForfaitSearch(), this.creditNoteForfaitFilter()));
  readonly filteredCreditNoteRowsRegie = computed(() =>
    this.filterCreditNoteRows(this.creditNoteRowsRegie(), this.creditNoteRegieSearch(), this.creditNoteRegieFilter()));
  readonly filteredCreditNoteRowsLivrable = computed(() =>
    this.filterCreditNoteRows(this.creditNoteRowsLivrable(), this.creditNoteLivrableSearch(), this.creditNoteLivrableFilter()));

  creditNoteForfaitPage     = signal(0);
  creditNoteForfaitPageSize = signal(10);
  readonly creditNoteForfaitTotalPages = computed(() => Math.ceil(this.filteredCreditNoteRowsForfait().length / this.creditNoteForfaitPageSize()));
  readonly pagedCreditNoteRowsForfait = computed(() =>
    this.pageRows(this.filteredCreditNoteRowsForfait(), this.creditNoteForfaitPage(), this.creditNoteForfaitPageSize()));

  creditNoteRegiePage     = signal(0);
  creditNoteRegiePageSize = signal(10);
  readonly creditNoteRegieTotalPages = computed(() => Math.ceil(this.filteredCreditNoteRowsRegie().length / this.creditNoteRegiePageSize()));
  readonly pagedCreditNoteRowsRegie = computed(() =>
    this.pageRows(this.filteredCreditNoteRowsRegie(), this.creditNoteRegiePage(), this.creditNoteRegiePageSize()));

  creditNoteLivrablePage     = signal(0);
  creditNoteLivrablePageSize = signal(10);
  readonly creditNoteLivrableTotalPages = computed(() => Math.ceil(this.filteredCreditNoteRowsLivrable().length / this.creditNoteLivrablePageSize()));
  readonly pagedCreditNoteRowsLivrable = computed(() =>
    this.pageRows(this.filteredCreditNoteRowsLivrable(), this.creditNoteLivrablePage(), this.creditNoteLivrablePageSize()));

  // ── daf-data-table: Audit history ────────────────────────────────────────────
  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'createdAt',   label: this.translate.instant('AFFAIRES.billing.approval.col_date'),    type: 'custom' },
      { key: 'userNom',     label: this.translate.instant('AFFAIRES.billing.approval.col_user'),    type: 'custom' },
      { key: 'action',      label: this.translate.instant('AFFAIRES.billing.approval.col_action'),  type: 'custom' },
      { key: 'entity',      label: this.translate.instant('AFFAIRES.billing.approval.col_entity'),  type: 'custom' },
      { key: 'commentaire', label: this.translate.instant('AFFAIRES.billing.approval.col_comment'), type: 'custom' },
    ];
  });

  readonly historyRows = computed(() =>
    this.auditLog().map(entry => ({
      id:          entry.id,
      createdAt:   this.fmtDateTime(entry.createdAt),
      userNom:     entry.userNom,
      action:      entry.action,
      entity:      `${entry.entityType} #${entry.entityId}`,
      commentaire: entry.commentaire,
    }))
  );

  historyPage     = signal(0);
  historyPageSize = signal(10);
  readonly historyTotalPages = computed(() => Math.ceil(this.historyRows().length / this.historyPageSize()));
  readonly pagedHistoryRows = computed(() => {
    const rows = this.historyRows();
    const size = this.historyPageSize();
    const page = Math.min(this.historyPage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: true, showHeader: false }));

  // ── Row action buttons — rendered as icon buttons in a trailing column by
  // daf-data-table itself (config.actions), same as the library demo's table. ──
  private validateAction(onClick: (row: TableRow) => void): TableAction {
    return {
      id: 'validate', icon: 'check_circle',
      tooltip: this.translate.instant('AFFAIRES.billing.approval.validate'),
      onClick,
    };
  }

  private returnAction(onClick: (row: TableRow) => void): TableAction {
    return {
      id: 'return', icon: 'undo',
      tooltip: this.translate.instant('AFFAIRES.billing.approval.return'),
      onClick,
    };
  }

  // Colonnes triables/déplaçables/redimensionnables — même trio de propriétés sur les 4
  // configs ci-dessous, factorisé ici pour ne pas le répéter à chaque fois.
  private tableExtras(): Pick<TableConfig, 'resizableColumns' | 'resizableRows' | 'columnPicker' | 'columnPickerLabel' | 'resetLabel'> {
    const t = (key: string) => this.translate.instant(key);
    return {
      resizableColumns:  true,
      resizableRows:     true,
      columnPicker:      true,
      columnPickerLabel: t('AFFAIRES.billing.approval.table_columns'),
      resetLabel:        t('AFFAIRES.billing.approval.table_reset'),
    };
  }

  readonly lineTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      showHeader: false,
      ...this.tableExtras(),
      actions: [
        this.validateAction(row => this.doValidateDF(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'])),
      ],
    };
  });

  readonly livrableBatchTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      showHeader: false,
      ...this.tableExtras(),
      actions: [
        this.validateAction(row => this.doValidateLivrableBatch(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'], 'livrableBatch')),
      ],
    };
  });

  readonly creditNoteTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      showHeader: false,
      ...this.tableExtras(),
      actions: [
        this.validateAction(row => this.doValidateCreditNote(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'], 'creditNote')),
      ],
    };
  });

  ngOnInit(): void {
    // Jalons no longer have a tab of their own, but the "En attente RF" KPI still
    // needs a count — fetched once here, independent of which tab is active.
    this.loadRF();
    this.loadDF();
  }

  onTabChange(id: string): void {
    const tab = id as ActiveTab;
    this.activeTab.set(tab);
    this.setTab(tab);
  }

  onDfSubTabChange(id: string): void {
    this.activeDfSubTab.set(id as DfSubTab);
  }

  /**
   * Row click on either of the two tables (line, livrable) opens the detail page for
   * that item.
   *
   * No leading `..`: this component sits on the `approval` route's *empty-path* child, which
   * doesn't add a navigation hop of its own — so `this.route` already resolves at the
   * `approval` level, and `[type, id]` reaches its sibling `:type/:id` route directly. A
   * leading `..` here overshoots past `approval` to `billing`, producing `billing/line/1`
   * instead of `billing/approval/line/1` (a 404) — confirmed live 2026-08-24.
   */
  openDetail(row: { id: number }, type: 'line' | 'livrable'): void {
    this.router.navigate([type, String(row.id)], { relativeTo: this.route });
  }

  /** A credit note is a real Invoice, not a billing-module entity with its own detail
   * route here — its row opens the ordinary invoice detail page directly (absolute
   * navigation, unlike openDetail() above which stays relative under this route). */
  openCreditNoteDetail(row: { id: number }): void {
    this.router.navigate(['/finance/invoicing', row.id]);
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'df')      this.loadDF();
    if (tab === 'history') this.loadHistory();
  }

  /** Feeds only the "En attente RF" KPI now — jalons have no tab of their own. */
  private loadRF(): void {
    this.svc.getPendingJalons().subscribe({ next: j => this.pendingJalons.set(j) });
  }

  /** AV taux no longer have a queue of their own — a taux's BillingLine appears in
   * pendingLines below exactly like every other mode, once the client has confirmed an
   * amount (see docs/superpowers/specs/2026-09-21-av-client-confirmation-design.md). */
  private loadDF(): void {
    this.dfLoading.set(true);
    forkJoin({
      livrableBatches: this.svc.getPendingLivrableBatches(),
      lines: this.svc.getPendingDFLines(),
      creditNotes: this.svc.getPendingCreditNotes(),
    }).subscribe({
      next: ({ livrableBatches, lines, creditNotes }) => {
        this.pendingLivrableBatches.set(livrableBatches);
        this.pendingLines.set(lines);
        this.pendingCreditNotes.set(creditNotes);
        this.dfLoading.set(false);
        this.firstLoad.set(false);
      },
      error: () => { this.dfLoading.set(false); this.firstLoad.set(false); },
    });
  }

  private loadHistory(): void {
    this.histLoading.set(true);
    this.svc.getAuditLog().subscribe({
      next:  a => { this.auditLog.set(a); this.histLoading.set(false); },
      error: () => this.histLoading.set(false),
    });
  }

  doValidateDF(lineId: number): void {
    // DF validation creates the draft invoice server-side (DFValidationService) — jump
    // straight into its edit stepper instead of staying on this list, since there's
    // nothing left to do here once the invoice exists.
    this.svc.validateDF(lineId).subscribe({
      next: line => {
        if (line.invoiceId) {
          // fromApproval: the stepper's "Annuler" then reverts this validation instead of
          // leaving the draft invoice behind (InvoiceNewComponent.cancel()).
          this.router.navigate(['/finance/invoicing', line.invoiceId, 'edit'],
            { queryParams: { fromApproval: 1 } });
        } else {
          this.loadDF();
        }
      },
    });
  }

  doValidateLivrableBatch(batchId: number): void {
    // Same as doValidateDF() above — the batch's shared invoice is created as a DRAFT
    // (LivrableBillingService → DFValidationService.generateFromBillingLines), so the
    // edit stepper is where DF reviews it, not the read-only detail page.
    this.svc.validateLivrableBatch(batchId).subscribe({
      next: batch => {
        if (batch.invoiceId) {
          this.router.navigate(['/finance/invoicing', batch.invoiceId, 'edit'],
            { queryParams: { fromApproval: 1 } });
        } else {
          this.loadDF();
        }
      },
    });
  }

  /**
   * A credit note is already a full Invoice (SUBMITTED at creation, see
   * InvoiceService.createCreditNote) — there's no BillingLine here for
   * DFValidationService to turn into one. "Valider" is therefore approve THEN emit,
   * chained the same way createCreditNote_linkedInvoiceSet's fixture data flows
   * server-side, so DF gets the same one-click result as every other row in this tab.
   */
  doValidateCreditNote(id: number): void {
    this.invoiceSvc.approve(id, { decision: 'APPROVE' }).pipe(
      switchMap(() => this.invoiceSvc.emit(id)),
    ).subscribe({
      next: () => this.router.navigate(['/finance/invoicing', id]),
      error: () => this.loadDF(),
    });
  }

  openDfRetourModal(entityId: number, type: 'line' | 'livrableBatch' | 'creditNote' = 'line'): void {
    this.dfRetourEntityId = entityId;
    this.dfRetourType = type;
    this.dfRetourMotif.set('');
    this.dfRetourError.set(null);
    this.dfRetourRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_return_title'),
      body: this.dfRetourTpl,
      size: 'sm',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),  variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_confirm'), variant: 'primary',   action: () => this.submitDfRetour() },
      ],
    });
  }

  submitDfRetour(): void {
    const motif = this.dfRetourMotif().trim();
    if (!motif) {
      this.dfRetourError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    // Typed Observable<unknown> rather than letting each branch's own return type stand —
    // a union of BillingLineDto/LivrableBatchDto/void observables isn't callable in this
    // TS/RxJS combination (differently-parameterized Observable overloads don't unify),
    // and every branch's follow-up is identical anyway.
    const request$: Observable<unknown> = this.dfRetourType === 'livrableBatch'
      ? this.svc.returnLivrableBatch(this.dfRetourEntityId, motif)
      : this.dfRetourType === 'creditNote'
      ? this.invoiceSvc.approve(this.dfRetourEntityId, { decision: 'RETURN', comment: motif })
      : this.svc.returnDF(this.dfRetourEntityId, motif);
    request$.subscribe({
      next: () => { this.dfRetourRef?.close(); this.loadDF(); },
    });
  }

  lineBadgeVariant(statut: string): BadgeVariant {
    return LINE_STATUT_VARIANT[statut] ?? 'neutral';
  }

  lineStatusLabel(statut: string): string {
    return this.translate.instant('AFFAIRES.billing.status.' + statut);
  }

  /** `creditNoteReason` holds one of CREDIT_NOTE_REASONS' codes (see
   * credit-note-modal.component.ts) — translate it, falling back to the raw code for
   * anything unrecognised rather than showing nothing. */
  creditNoteReasonLabel(code: string | null): string {
    if (!code) return '—';
    const key = CREDIT_NOTE_REASONS[code];
    return key ? this.translate.instant(key) : code;
  }

  // No currency is known here — these rows span multiple affaires, each potentially in a
  // different currency — so this always shows 2 decimals (the common case) rather than
  // guessing a per-row currency.
  fmtAmt(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  fmtDateTime(d: string): string {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
