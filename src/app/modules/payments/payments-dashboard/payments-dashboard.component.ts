import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, MetricCardComponent, MetricCardOptions,
  MetricDelta, PageComponent, PageHeaderComponent, PaginationComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { PaymentService } from '../payment.service';
import { AgingFilter, AgingRow, PaymentsDashboardStats } from '../payment.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { AgingCardsSectionComponent } from './aging-cards-section.component';
import { AgingTableSectionComponent } from './aging-table-section.component';

type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-payments-dashboard',
  imports: [
    TranslatePipe, PermissionDirective, PageComponent, PageHeaderComponent, ButtonComponent,
    MetricCardComponent, SearchToolbarComponent, PaginationComponent, DisplayCurrencyPipe,
    AgingCardsSectionComponent, AgingTableSectionComponent,
  ],
  host: { class: 'block' },
  templateUrl: './payments-dashboard.component.html',
})
export class PaymentsDashboardComponent implements OnInit {
  private readonly svc       = inject(PaymentService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  stats  = signal<PaymentsDashboardStats | null>(null);
  error  = signal<string | null>(null);

  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  pageSize      = signal(20);

  /** `firstLoad` drives the whole-page skeleton, `loadingRows` only the section (§5). */
  firstLoad   = signal(true);
  loadingRows = signal(false);

  readonly rows = signal<AgingRow[]>([]);

  searchText      = signal('');
  filterAffaireId = signal('');
  filterClientId  = signal('');
  filterDateRange = signal<Date[] | null>(null);
  filterOverdueOnly = signal(false);
  viewMode        = signal<ViewMode>('grid');

  /**
   * Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4).
   *
   * These four tiles previously passed **raw hex** (`iconColor: '#1d2b3e'`,
   * `valueColor: '#DC2626'`, `iconBg: '#e8ecf2'`, …). The component interpolates those
   * straight into a `class` attribute, where a hex is not a valid class name — so every
   * icon, background and value colour on this page rendered uncoloured. This is the
   * page the playbook flagged for exactly that.
   */
  readonly kpiPending = computed<MetricCardOptions>(() => ({
    icon: 'hourglass_empty', iconColor: 'text-primary', iconBg: 'bg-primary/10',
    deltaColor: 'text-on-surface-variant',
    ...this.help('PENDING'),
  }));
  readonly kpiOverdue = computed<MetricCardOptions>(() => ({
    icon: 'warning', iconColor: 'text-warning', iconBg: 'bg-warning/10',
    valueColor: 'text-warning', deltaColor: 'text-on-surface-variant',
    ...this.help('OVERDUE'),
  }));
  readonly kpiCollected = computed<MetricCardOptions>(() => ({
    icon: 'payments', iconColor: 'text-teal', iconBg: 'bg-teal/10',
    ...this.help('COLLECTED_MONTH'),
  }));
  /**
   * La tranche la plus ancienne. Rouge quand elle n'est pas vide, neutre sinon : une
   * balance âgée sans créance à plus de 90 jours est une bonne nouvelle, pas une alerte
   * à zéro. Classes Tailwind littérales et complètes (UI-PLAYBOOK §3).
   */
  readonly kpiPlus90 = computed<MetricCardOptions>(() => ({
    icon: 'hourglass_bottom',
    ...((this.stats()?.plus90Count ?? 0) > 0
      ? { iconColor: 'text-danger', iconBg: 'bg-danger/10',
          valueColor: 'text-danger', deltaColor: 'text-danger' }
      : { iconColor: 'text-secondary', iconBg: 'bg-secondary/10',
          deltaColor: 'text-on-surface-variant' }),
    ...this.help('PLUS_90'),
  }));

  /**
   * Ce que la tuile mesure, révélé au survol. Ces quatre chiffres sont **nets des
   * règlements reçus** et la nuance ne se lit nulle part sur l'écran : « en attente »
   * pourrait tout aussi bien vouloir dire « total facturé non soldé ». Le texte le dit.
   *
   * Le popover est une **annotation** (voir `MetricCardOptions.help`) : il ne porte
   * jamais une valeur dont l'utilisateur a besoin — un écran tactile ne le verra pas.
   */
  private help(kpi: string): Pick<MetricCardOptions, 'help' | 'helpTitle'> {
    this.translate.currentLang();
    return {
      helpTitle: this.translate.instant(`PAYMENTS.DASHBOARD.KPI.${kpi}`),
      help:      this.translate.instant(`PAYMENTS.DASHBOARD.KPI.${kpi}_HELP`),
    };
  }

  /**
   * Les quatre tuiles portent maintenant toutes un **montant** comme valeur, et le
   * décompte de factures en second plan. C'était l'inverse pour « en retard » : un
   * nombre de factures au milieu de trois montants, qui se comparait à la mauvaise
   * chose. Le montant est ce sur quoi porte la décision de relancer ; le nombre dit
   * seulement sur combien de dossiers il se répartit.
   *
   * ⚠️ `direction` est volontairement absent. Il ne sert qu'à choisir une couleur par
   * défaut (`deltaColorClass`), et l'ancien `direction: 'down'` peignait donc le montant
   * en retard de la couleur d'une baisse — sur un chiffre qui n'est pas une variation :
   * rien ici ne compare deux périodes. `deltaColor` dit la couleur voulue, sans prétendre
   * à un sens de variation.
   */
  readonly overdueDelta = computed<MetricDelta | null>(() => {
    const s = this.stats();
    if (!s) return null;
    this.translate.currentLang();
    return { value: this.translate.instant('PAYMENTS.DASHBOARD.KPI.INVOICE_COUNT', { n: s.enRetardCount }) };
  });

  readonly plus90Delta = computed<MetricDelta | null>(() => {
    const s = this.stats();
    if (!s) return null;
    this.translate.currentLang();
    return { value: this.translate.instant('PAYMENTS.DASHBOARD.KPI.INVOICE_COUNT', { n: s.plus90Count }) };
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('PAYMENTS.DASHBOARD.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('PAYMENTS.DASHBOARD.VIEW_LIST') },
    ];
  });

  /**
   * Affaire and client are still free-text **database ids** — that is what the
   * endpoint takes and what the old page asked for with two `<input type="number">`.
   * They belong in the filter panel rather than loose on the page, but they should
   * become searchable client/affaire pickers; that needs a lookup call this module
   * does not have today.
   */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { name: 'affaireId',   label: t('PAYMENTS.DASHBOARD.FILTER.AFFAIRE'), type: 'text',      placeholder: t('PAYMENTS.DASHBOARD.FILTER.AFFAIRE_PH') },
      { name: 'clientId',    label: t('PAYMENTS.DASHBOARD.FILTER.CLIENT'),  type: 'text',      placeholder: t('PAYMENTS.DASHBOARD.FILTER.CLIENT_PH')  },
      { name: 'dates',       label: t('PAYMENTS.DASHBOARD.FILTER.PERIOD'),  type: 'daterange', placeholder: t('PAYMENTS.DASHBOARD.FILTER.DATE_PH')    },
      { name: 'overdueOnly', label: t('PAYMENTS.DASHBOARD.FILTER.OVERDUE_ONLY'), type: 'checkbox' },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('PAYMENTS.DASHBOARD.FILTER.PANEL_TITLE'),
      applyLabel:   t('PAYMENTS.DASHBOARD.FILTER.APPLY'),
      cancelLabel:  t('PAYMENTS.COMMON.CANCEL'),
      resetLabel:   t('PAYMENTS.DASHBOARD.FILTER.RESET'),
      triggerLabel: t('PAYMENTS.DASHBOARD.FILTER.FILTERS'),
      // Seeded once, in the panel's internal shape (§10b).
      initialValues: {
        affaireId:   this.filterAffaireId(),
        clientId:    this.filterClientId(),
        dates:       this.filterDateRange(),
        overdueOnly: this.filterOverdueOnly(),
      },
    };
  });

  ngOnInit(): void {
    this.loadStats();
    this.loadRows();
  }

  loadStats(): void {
    this.svc.getStats().subscribe({
      next:  s  => this.stats.set(s),
      // The tiles fall back to "—" on their own; a stats failure must not blank the list.
      error: () => this.stats.set(null),
    });
  }

  loadRows(): void {
    this.loadingRows.set(true);
    this.error.set(null);
    const range = this.filterDateRange() ?? [];
    const filter: AgingFilter = {
      page:        this.currentPage(),
      size:        this.pageSize(),
      affaireId:   toId(this.filterAffaireId()),
      clientId:    toId(this.filterClientId()),
      from:        toIsoDate(range[0]),
      to:          toIsoDate(range[1]),
      overdueOnly: this.filterOverdueOnly() || undefined,
      search:      this.searchText().trim() || null,
    };
    this.svc.getAgingRows(filter).subscribe({
      next: res => {
        this.rows.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loadingRows.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('PAYMENTS.DASHBOARD.ERROR_LOAD'));
        this.loadingRows.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  /**
   * Recherche **serveur**, sur tout l'encours de l'entité — plus seulement sur la page
   * affichée. La toolbar débounce déjà à 300 ms, donc la frappe ne déclenche pas un appel
   * par caractère. Retour à la première page : les résultats d'une nouvelle recherche
   * n'ont rien à voir avec la page où l'on se trouvait.
   */
  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(0);
    this.loadRows();
  }

  applyFilters(result: FilterResult): void {
    this.filterAffaireId.set((result['affaireId'] as string | null) ?? '');
    this.filterClientId.set((result['clientId'] as string | null) ?? '');
    const dates = result['dates'];
    this.filterDateRange.set(Array.isArray(dates) ? (dates as Date[]) : null);
    this.filterOverdueOnly.set(result['overdueOnly'] === true);
    this.currentPage.set(0);
    this.loadRows();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.loadRows();
  }

  /** `pageSizeChange` fires alone — the page decides to go back to the first page (§7). */
  onPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(0);
    this.loadRows();
  }

  /**
   * Ouvre la **fiche de recouvrement** de la facture, pas sa fiche de facturation.
   * Les deux existent et ne répondent pas à la même question : `/finance/invoicing/:id`
   * raconte le document (lignes, TVA, cycle de vie), `/finance/payments/:id` raconte
   * l'encaissement (retard, relances envoyées, règlements reçus, reste dû).
   */
  navigateToInvoice(id: number): void {
    this.router.navigate([id], { relativeTo: this.route });
  }

  private currencyLabel(value: number, devise: string): string {
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise }).format(value);
    } catch {
      return `${value.toLocaleString('fr-FR')} ${devise}`;
    }
  }
}

/** `Date` → `YYYY-MM-DD`, the shape `AgingFilter.from` / `.to` expect. */
function toIsoDate(d: unknown): string | null {
  return d instanceof Date ? d.toISOString().split('T')[0] : null;
}

/** Free-text id field → a positive number, or null when blank/invalid. */
function toId(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isFinite(n) && n > 0 ? n : null;
}
