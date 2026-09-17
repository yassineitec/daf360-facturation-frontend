import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, input,
  output, signal, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';
import {
  DataTableComponent, TableColumn, TableConfig, TableRow,
  SearchToolbarComponent, ButtonComponent, PaginationComponent, FilterField, FilterOption, FilterResult,
} from '@khalilrebhiitec/daf360';
import { DepenseLigne } from './depense.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/**
 * "Dépense" preview, aggregated one row per collaborator — same reasoning as
 * WipTmDetailTableComponent (a flat per-entry list becomes unreadable on a real affaire).
 * Keyed by email, not userId: some Timesheet rows have no matching DAF360 user_ref and must
 * still show up as their own row (see AffaireDepenseService — it never drops a row for this).
 *
 * Stateless: lignes in, an email out on click — the parent tab owns the drill-down state.
 */
@Component({
  selector: 'app-depense-summary-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, SearchToolbarComponent, ButtonComponent, PaginationComponent, TranslatePipe],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './depense-summary-table.component.html',
  styles: [`
    /* daf-pagination's own row is justify-between (summary left, page numbers +
       "par page" selector right) — grouped to the right instead, same override
       mechanism as .wip-pagination in affaire-wip-tab.component.ts. */
    ::ng-deep .depense-zoom-pagination > div {
      justify-content: flex-end;
    }
  `],
})
export class DepenseSummaryTableComponent implements OnDestroy {
  private readonly translate = inject(TranslateService);
  private readonly currency = inject(DisplayCurrencyPipe);

  lignes = input.required<DepenseLigne[]>();
  devise = input.required<string>();
  /** Full-range Mois/Année options, computed by the parent tab from the UNFILTERED preview
   * (this component only ever sees `lignes` already narrowed by whatever Période/Mois/Année
   * is active) — so switching, say, Année never offers only the year currently applied. */
  monthOptions = input<FilterOption[]>([]);
  yearOptions = input<FilterOption[]>([]);
  collaboratorSelected = output<string>();
  /** Bubbles the Période/Mois/Année part of this panel's result up to the parent tab, whose
   * `filteredLignes()` also drives the KPI tiles — Discipline stays local (see
   * `onFilterApply`), it never affects the cards. */
  periodApply = output<FilterResult>();

  /** Text search (name/email, on the aggregated rows) and a Discipline filter (on the raw
   * lines, before aggregation — a collaborator can span several disciplines) — same
   * `daf-search-toolbar` + `daf-filter` combo `affaire-wip-tab.component.html`'s history
   * popup already uses, just without the popup. */
  protected readonly search = signal('');
  protected readonly disciplineFilter = signal<string[]>([]);

  /** Fullscreen "zoom" popup — same overlay/panel markup as the WIP tab's own Historique
   * popup (`affaire-wip-tab.component.html`), reused rather than `daf-modal` because that
   * one caps at 900px (see its own comment) and this needs the full viewport. Shows the
   * exact same `columns()`/`rows()`/`config()` this component already renders, just bigger —
   * search/filter state (`search`/`disciplineFilter`) is shared, not duplicated. */
  protected readonly zoomOpen = signal(false);

  /** Pagination for the zoom popup only — the small preview table underneath stays as
   * a short, unpaginated list, same reasoning as the WIP tab's history popup
   * (`affaire-wip-tab.component.html`), which this mirrors. */
  protected readonly zoomPage = signal(0);
  protected readonly zoomPageSize = signal(20);

  protected readonly zoomTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.rows().length / this.zoomPageSize())));

  protected readonly paginatedRows = computed<TableRow[]>(() => {
    const size = this.zoomPageSize();
    const page = Math.min(this.zoomPage(), this.zoomTotalPages() - 1);
    return this.rows().slice(page * size, page * size + size);
  });

  protected onZoomPageSizeChange(size: number): void {
    this.zoomPageSize.set(size);
    this.zoomPage.set(0);
  }

  /**
   * Portaled to `<body>` while open — same reason `daf-select`/`daf-filter` portal their own
   * dropdowns (see their own comments): `position: fixed` is relative to the nearest
   * transformed/filtered ancestor, not the viewport, and the shell's sidebar container is
   * exactly that kind of ancestor here — without this the overlay stopped short of the
   * sidebar instead of covering the whole page over it.
   */
  private readonly zoomOverlayRef = viewChild<ElementRef<HTMLDivElement>>('zoomOverlay');
  private zoomPortaledNode: HTMLElement | null = null;

  constructor() {
    effect(onCleanup => {
      const ref = this.zoomOverlayRef();
      if (!ref || !this.zoomOpen()) return;

      const node = ref.nativeElement;
      if (node.parentElement !== document.body) {
        document.body.appendChild(node);
        this.zoomPortaledNode = node;
      }

      onCleanup(() => {
        // Angular's view removal targets the original anchor's parent and would leave the
        // overlay orphaned under <body> — we moved it there, so we take it back out too.
        node.remove();
        if (this.zoomPortaledNode === node) this.zoomPortaledNode = null;
      });
    });
  }

  ngOnDestroy(): void {
    this.zoomPortaledNode?.remove();
    this.zoomPortaledNode = null;
  }

  protected readonly searchPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('AFFAIRES.DEPENSE.SEARCH_PLACEHOLDER');
  });

  protected readonly disciplineOptions = computed<FilterOption[]>(() => {
    const set = new Set(this.lignes().map(l => l.disciplineLabel).filter((d): d is string => !!d));
    return [...set].sort().map(d => ({ value: d, label: d }));
  });

  protected readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [
      { name: 'discipline', label: this.translate.instant('AFFAIRES.WIP.COL_DISCIPLINE'), type: 'multiselect', options: this.disciplineOptions() },
      { name: 'period',     label: this.translate.instant('AFFAIRES.DEPENSE.FILTER_PERIOD'), type: 'daterange' },
      { name: 'month',      label: this.translate.instant('AFFAIRES.DEPENSE.FILTER_MONTH'),  type: 'select', options: this.monthOptions() },
      { name: 'year',       label: this.translate.instant('AFFAIRES.DEPENSE.FILTER_YEAR'),   type: 'select', options: this.yearOptions() },
    ];
  });

  /** No explicit type annotation: `daf-filter`'s `[title]`/`[applyLabel]`/… inputs require
   * plain `string`, and `SearchToolbarFilterConfig` (used when this went through
   * `daf-search-toolbar`'s embedded filter) marks every field optional — inferring the
   * object type here instead keeps all five as the `string` they always are. */
  protected readonly filterConfig = computed(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:        t('AFFAIRES.DEPENSE.TABLE_FILTER_TITLE'),
      applyLabel:   t('AFFAIRES.DEPENSE.TABLE_FILTER_APPLY'),
      cancelLabel:  t('AFFAIRES.DEPENSE.TABLE_FILTER_CANCEL'),
      resetLabel:   t('AFFAIRES.DEPENSE.TABLE_FILTER_RESET'),
      triggerLabel: t('AFFAIRES.DEPENSE.TABLE_FILTER_TRIGGER'),
    };
  });

  protected onFilterApply(result: FilterResult): void {
    const v = result['discipline'];
    this.disciplineFilter.set(Array.isArray(v) ? v as string[] : v ? [String(v)] : []);
    this.periodApply.emit(result);
    this.zoomPage.set(0);
  }

  protected onSearchChange(value: string): void {
    this.search.set(value);
    this.zoomPage.set(0);
  }

  protected readonly aggregates = computed(() => {
    const disciplines = this.disciplineFilter();
    const q = this.search().trim().toLowerCase();

    const byEmail = new Map<string, { email: string; userFullName: string; totalHours: number; totalCost: number; days: Set<string> }>();
    for (const l of this.lignes()) {
      if (disciplines.length > 0 && (l.disciplineLabel == null || !disciplines.includes(l.disciplineLabel))) continue;
      const entry = byEmail.get(l.userEmail) ?? { email: l.userEmail, userFullName: l.userFullName, totalHours: 0, totalCost: 0, days: new Set<string>() };
      entry.totalHours += l.hours;
      entry.totalCost += l.costAmount;
      entry.days.add(l.date);
      byEmail.set(l.userEmail, entry);
    }
    return [...byEmail.values()]
      .map(e => {
        const sorted = [...e.days].sort();
        const periodLabel = sorted.length
          ? `${this.fmtDate(sorted[0])} – ${this.fmtDate(sorted[sorted.length - 1])}`
          : '—';
        return { email: e.email, userFullName: e.userFullName, totalHours: e.totalHours, totalCost: e.totalCost, periodLabel };
      })
      .filter(a => !q || a.userFullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
      .sort((a, b) => b.totalCost - a.totalCost);
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'user', label: t('AFFAIRES.WIP.COL_COLLABORATOR'), type: 'text', clickable: true },
      { key: 'period', label: t('AFFAIRES.DEPENSE.COL_PERIOD'), type: 'text' },
      { key: 'hours', label: t('AFFAIRES.WIP.COL_HOURS'), type: 'text', align: 'right' },
      { key: 'cost', label: t('AFFAIRES.WIP.COL_COST'), type: 'text', align: 'right' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() =>
    this.aggregates().map(a => ({
      id: a.email,
      email: a.email,
      user: a.userFullName,
      period: a.periodLabel,
      hours: a.totalHours.toFixed(2),
      cost: this.fmtAmt(a.totalCost),
    })),
  );

  protected readonly config = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable: true,
    emptyMessage: this.translate.instant('AFFAIRES.DEPENSE.EMPTY'),
  }));

  /** Same xlsx/schema convention as `exportWipExcel()`/`exportHistoryExcel()` (WIP tab) —
   * one workbook, one sheet, translated headers, raw numbers (not `fmtAmt()`) since an
   * export feeds a spreadsheet recalculation, not the screen. Respects the active
   * search/discipline filter (`aggregates()`), not every raw line. */
  protected exportExcel(): void {
    const aggregates = this.aggregates();
    if (!aggregates.length) return;
    const t = (k: string) => this.translate.instant(k);
    const rows = aggregates.map(a => ({
      [t('AFFAIRES.WIP.COL_COLLABORATOR')]: a.userFullName,
      [t('AFFAIRES.DEPENSE.EMAIL')]:         a.email,
      [t('AFFAIRES.DEPENSE.COL_PERIOD')]:    a.periodLabel,
      [t('AFFAIRES.WIP.COL_HOURS')]:         Number(a.totalHours.toFixed(2)),
      [t('AFFAIRES.WIP.COL_COST')]:          Number(a.totalCost.toFixed(3)),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t('AFFAIRES.DEPENSE.ZOOM_TITLE'));
    XLSX.writeFile(wb, 'Depenses.xlsx');
  }

  private fmtAmt(v: number): string {
    return this.currency.transform(v, this.devise());
  }

  /** Same `dd/MM/yyyy`-style formatting `depense-collaborator-detail.component.ts`'s own
   * `fmtDate` already uses — copied here rather than shared, matching this tab's existing
   * "deliberately independent, not shared with the WIP sibling" convention. */
  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
