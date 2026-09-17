import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';
import {
  AvatarComponent, ButtonComponent, CardComponent, DataTableComponent, FilterField,
  FilterResult, PageComponent, PaginationComponent, SearchToolbarComponent,
  SearchToolbarFilterConfig, TableColumn, TableConfig, TableRow, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import type { AvatarData, BreadcrumbItem } from '@khalilrebhiitec/daf360';

import { EmployeeCostService } from './employee-cost.service';
import { formatAmount, formatDate } from './employee-cost-display';
import { EntityAuditLogDto } from '../../affaires/billing/billing.service';
import { AffaireService } from '../../affaires/affaire.service';
import { UserRefDto } from '../../affaires/affaire.model';

interface TimelineDiff {
  label:  string;
  before: string;
  after:  string;
}

/** One entry per audit EVENT (not per changed field — see the class doc comment for why
 * this moved away from a flat table). An UPDATE that touched 3 fields carries all 3 in
 * `diffs`, rendered as one bullet list under a single header line. */
interface TimelineEvent {
  /** The underlying audit-log row's own id — stable across re-renders/pagination. */
  id:           number;
  dateDisplay:  string;
  action:       string;
  actor:        string;
  diffs:        TimelineDiff[];
  /** Only set when `diffs` is empty AND the status actually changed — i.e. a
   * STATUS_NORMALIZED cascade entry, whose metadata is always empty but whose
   * `statutAvant`/`statutApres` fields are the one place that event's effect is
   * recorded. Shown as a fallback bullet so that row isn't left blank. */
  statusChange: string | null;
  /** The resulting basic/internal/external selling cost at this point in the record's
   * history — the table view's "Coût"/"Coût de vente interne"/"Coût de vente externe"
   * columns show these on EVERY row for reference, regardless of which field the event
   * actually changed. From the event's `after` snapshot (or `before` for a DELETE, whose
   * `after` is null); `'—'` when there's no metadata at all (a STATUS_NORMALIZED entry). */
  basicCost:    string;
  internalCost: string;
  externalCost: string;
  /** The resulting end date ("date d'expiration") at this point in the record's history
   * — same snapshot reasoning as the 3 cost fields above, formatted with `formatDate()`
   * (not `formatAmount()`) since it's a calendar date, not a currency amount. */
  expirationDate: string;
}

/** The Excel export's flat shape — one row per changed field (spreadsheets can't group
 * the way the on-screen table/timeline do). Built from a `TimelineEvent` via
 * `toFieldRows()`. */
interface HistoryFieldRow {
  dateDisplay: string;
  actor:       string;
  fieldLabel:  string;
  before:      string;
  after:       string;
  action:      string;
}

type HistoryViewMode = 'timeline' | 'table';

/**
 * Full page (not a popup) showing one employee-cost record's complete audit trail —
 * reached from the "History" row action on the list ({@link EmployeeCostComponent}).
 * Was a custom full-screen overlay before; moved to its own route so it gets a real URL,
 * survives a refresh, and — the immediate reason for the move — sidesteps a `daf-filter`
 * bug where a `daf-multi-date-picker` field nested inside it gets its clicks swallowed
 * (the panel's own "click outside closes me" check doesn't know about a floating child
 * that portals itself a second time). Nothing about that bug is specific to being a
 * popup; it only ever showed up here because the popup happened to host the filter panel
 * that carries the date field. A plain page hosts the exact same `daf-search-toolbar` /
 * `daf-filter` combination, so if the library-level fix (`data-daf-portal`, see
 * filter.component.ts) doesn't hold, it would resurface here too.
 *
 * Rendered as a TIMELINE (one block per audit event, its field changes as a bullet list
 * underneath), not a flat `daf-data-table` — an earlier one-row-per-changed-field table
 * made a single UPDATE that touched 3 fields look like 3 separate, unrelated rows (same
 * date/actor repeated 3 times with nothing visually tying them together). Grouping by
 * event is the natural shape for "what happened, and what did it change" the way a
 * commit log reads, rather than a spreadsheet export.
 */
@Component({
  selector: 'app-employee-cost-history',
  standalone: true,
  imports: [
    TranslatePipe, AvatarComponent, ButtonComponent, CardComponent, DataTableComponent,
    PageComponent, PaginationComponent, RouterLink, SearchToolbarComponent,
  ],
  templateUrl: './employee-cost-history.component.html',
})
export class EmployeeCostHistoryComponent implements OnInit {
  private readonly svc        = inject(EmployeeCostService);
  private readonly translate  = inject(TranslateService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly affaireSvc = inject(AffaireService);

  /** Read off `paramMap`/`queryParamMap` rather than route `input()` bindings — same
   * convention as cost-line-detail.component.ts, this remote being mounted by the
   * shell's own router. `employeeName`/`employeeEmail` are passed by the list screen's
   * `viewHistory()` navigation purely to label this page without a second network call;
   * a direct/bookmarked visit without them still works, just with a generic title. */
  private readonly recordId     = Number(this.route.snapshot.paramMap.get('id'));
  readonly employeeName  = this.route.snapshot.queryParamMap.get('name');
  readonly employeeEmail = this.route.snapshot.queryParamMap.get('email');

  loading      = signal(true);
  loadError    = signal<string | null>(null);
  historyTrail = signal<EntityAuditLogDto[]>([]);

  /** Same `/ref/users` list AffaireService already exposes elsewhere (the employee-cost
   * form's own collaborator picker, the affaire wizard's T&M step) — reused here purely
   * to resolve `actorId` → a real name, since `EntityAuditLogDto` itself only carries
   * the numeric id and a role string, not a name. */
  users = signal<UserRefDto[]>([]);

  historySearch = signal('');
  historyAction = signal('');
  historyField  = signal('');
  historyDate   = signal<Date | null>(null);
  historyPage   = signal(0);
  historySize   = signal(25);

  /** Timeline (cards, grouped by event) is the default — see the class doc comment for
   * why it replaced the original flat table. The table view stays available as an
   * alternate for anyone who wants the old spreadsheet-like layout, same toggle pattern
   * as EmployeeCostComponent's own grid/list `viewMode`. */
  viewMode = signal<HistoryViewMode>('timeline');

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'timeline', icon: 'grid_view',  tooltip: this.translate.instant('COST.EMPLOYEE_COST.VIEW_GRID') },
      { id: 'table',    icon: 'table_rows', tooltip: this.translate.instant('COST.EMPLOYEE_COST.VIEW_LIST') },
    ];
  });

  /** `pageChange`'s own convention elsewhere in this app: switching views goes back to
   * the first page rather than keeping a page number that may not exist under the other
   * view's own item count (events vs. flattened field rows). */
  onViewChange(mode: string): void {
    this.viewMode.set(mode as HistoryViewMode);
    this.historyPage.set(0);
  }

  /** For the `daf-avatar` shown next to the title — same `AvatarData` shape the app's
   * other avatars use (entity cards, table avatar cells). No `avatarUrl`: there's no
   * photo source wired up for this record, so it falls back to initials derived from
   * `name`, exactly like every other avatar in this app. */
  readonly avatarData = computed<AvatarData>(() => ({
    name: this.employeeName ?? this.employeeEmail ?? '?',
  }));

  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    const name = this.employeeName ?? this.employeeEmail;
    return name
      ? this.translate.instant('COST.EMPLOYEE_COST.HISTORY_MODAL_TITLE', { name })
      : this.translate.instant('COST.EMPLOYEE_COST.HISTORY_TITLE');
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('COST.EMPLOYEE_COST.TITLE'), link: ['/finance/cost/employee-costs'] },
      { label: this.pageTitle() },
    ];
  });

  /** Table view's columns — every one plain `text`, bound straight to a precomputed
   * field on the row. "Coût"/"Coût de vente interne"/"Coût de vente externe" show the
   * resulting cost snapshot on EVERY row (see `TimelineEvent`'s own doc comment), rather
   * than the generic "which field changed, before/after" pair the table used to have —
   * a fixed, always-comparable set of 3 numbers reads faster at a glance than an
   * open-ended diff. */
  readonly auditColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'dateDisplay',     label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_DATE'),   type: 'text' },
      { key: 'actor',           label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_USER'),   type: 'text' },
      { key: 'basicCost',       label: this.translate.instant('COST.EMPLOYEE_COST.BASIC_COST'),         type: 'text' },
      { key: 'internalCost',    label: this.translate.instant('COST.EMPLOYEE_COST.COL_INTERNAL'),       type: 'text' },
      { key: 'externalCost',    label: this.translate.instant('COST.EMPLOYEE_COST.COL_EXTERNAL'),       type: 'text' },
      { key: 'expirationDate',  label: this.translate.instant('COST.EMPLOYEE_COST.DATE_FIN'),           type: 'text' },
      { key: 'action',          label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_ACTION'), type: 'text' },
    ];
  });

  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: false }));

  /** Table view's rows: one per EVENT, same set the timeline shows. */
  readonly tableRows = computed<TableRow[]>(() =>
    this.pagedEvents().map(ev => ({
      id: ev.id,
      dateDisplay: ev.dateDisplay,
      actor: ev.actor,
      action: ev.action,
      basicCost: ev.basicCost,
      internalCost: ev.internalCost,
      externalCost: ev.externalCost,
      expirationDate: ev.expirationDate,
    })));

  /** Options built from whatever actually occurs in this record's own trail, same
   * pattern as affaire-wip-tab.component.ts's own `historyFilterFields`. */
  readonly historyFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [
      {
        name: 'action',
        label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_ACTION'),
        type: 'select',
        options: [...new Set(this.historyTrail().map(e => e.action))].sort()
          .map(value => ({ value, label: value })),
      },
      {
        name: 'date',
        label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_DATE'),
        type: 'date',
      },
      {
        name: 'field',
        label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_FIELD'),
        type: 'select',
        options: [...new Set(this.events().flatMap(ev => ev.diffs.map(d => d.label)))].sort()
          .map(value => ({ value, label: value })),
      },
    ];
  });

  readonly historyFilterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:        t('COST.EMPLOYEE_COST.FILTER_TITLE'),
      applyLabel:   t('COST.EMPLOYEE_COST.FILTER_APPLY'),
      cancelLabel:  t('COST.EMPLOYEE_COST.FILTER_CANCEL'),
      resetLabel:   t('COST.EMPLOYEE_COST.FILTER_RESET'),
      triggerLabel: t('COST.EMPLOYEE_COST.FILTERS'),
      initialValues: { action: this.historyAction(), date: this.historyDate(), field: this.historyField() },
    };
  });

  /** `daf-filter` types a select's value as `FilterFieldValue` (string | string[] | boolean
   * | Date | Date[] | null) even though this field only ever emits a plain string —
   * narrow it down, same pattern as affaire-wip-tab.component.ts's own `asFilterValue`. */
  onHistoryFilterApply(result: FilterResult): void {
    const action = result['action'];
    this.historyAction.set(Array.isArray(action) ? (action[0] as string ?? '') : (typeof action === 'string' ? action : ''));
    const date = result['date'];
    this.historyDate.set(date instanceof Date ? date : null);
    const field = result['field'];
    this.historyField.set(Array.isArray(field) ? (field[0] as string ?? '') : (typeof field === 'string' ? field : ''));
    this.historyPage.set(0);
  }

  resetHistoryFilters(): void {
    this.historyAction.set('');
    this.historyDate.set(null);
    this.historyField.set('');
    this.historyPage.set(0);
  }

  onHistorySearch(value: string): void {
    this.historySearch.set(value);
    this.historyPage.set(0);
  }

  /** Same calendar day as the selected date, in the viewer's own local timezone — matches
   * how `fmtDateTime()` renders `timestampUtc`, so "select 05/09" keeps exactly the
   * events that visibly show as 05/09. */
  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** Action + date filters apply directly on the raw entries (one entry = one action,
   * one date) before they're turned into display events below. */
  private readonly filteredEntries = computed<EntityAuditLogDto[]>(() => {
    const action = this.historyAction();
    const date   = this.historyDate();
    return this.historyTrail()
      .filter(e => !action || e.action === action)
      .filter(e => !date || this.isSameDay(new Date(e.timestampUtc), date));
  });

  private toEvent(e: EntityAuditLogDto): TimelineEvent {
    const diffs = this.diffEntries(e.metadata);
    const statusChange = diffs.length === 0 && (e.statutAvant || e.statutApres)
      ? `${e.statutAvant ?? '—'} → ${e.statutApres ?? '—'}`
      : null;
    return {
      id:           e.id,
      dateDisplay:  this.fmtDateTime(e.timestampUtc),
      action:       e.action,
      actor:        this.actorName(e.actorId, e.actorRole),
      diffs,
      statusChange,
      basicCost:      this.snapshotValue(e.metadata, 'basicCost', v => formatAmount(Number(v))),
      internalCost:   this.snapshotValue(e.metadata, 'internalSellingCost', v => formatAmount(Number(v))),
      externalCost:   this.snapshotValue(e.metadata, 'externalSellingCost', v => formatAmount(Number(v))),
      expirationDate: this.snapshotValue(e.metadata, 'dateFin', v => formatDate(String(v))),
    };
  }

  /** Resulting value of one field at this point in the record's history: the event's
   * `after` snapshot when there is one (CREATE/UPDATE), else `before` (a DELETE has no
   * `after`). `'—'` when there's no metadata at all (a STATUS_NORMALIZED entry). */
  private snapshotValue(
    metadata: string | null | undefined,
    key: 'basicCost' | 'internalSellingCost' | 'externalSellingCost' | 'dateFin',
    format: (v: unknown) => string,
  ): string {
    if (!metadata) return '—';
    try {
      const parsed = JSON.parse(metadata) as { before?: Record<string, unknown>; after?: Record<string, unknown> };
      const state = parsed.after ?? parsed.before;
      const value = state?.[key];
      return value === undefined || value === null ? '—' : format(value);
    } catch {
      return '—';
    }
  }

  readonly events = computed<TimelineEvent[]>(() =>
    this.filteredEntries().map(e => this.toEvent(e)));

  /** "Champ" keeps the WHOLE event (all its field changes) when ANY of them matches the
   * selected field — narrowing to just that one line would hide the fact that other
   * fields changed in the very same edit. Search runs over the event's own header plus
   * every diff line, so a hit is always visibly explained by the block it matched. */
  readonly filteredEvents = computed<TimelineEvent[]>(() => {
    const q     = this.historySearch().trim().toLowerCase();
    const field = this.historyField();
    return this.events()
      .filter(ev => !field || ev.diffs.some(d => d.label === field))
      .filter(ev => !q || `${ev.action} ${ev.actor} ${ev.statusChange ?? ''} ` +
        ev.diffs.map(d => `${d.label} ${d.before} ${d.after}`).join(' ')
          .toLowerCase().includes(q));
  });

  /** One row per changed field, built from the SAME filtered events the timeline/table
   * show on screen — a STATUS_NORMALIZED event with no diffs still gets one row (via
   * `statusChange`, the same fallback the timeline's bullet / table's picker use), so the
   * export never silently drops an event the screen does show. Excel-only — the on-screen
   * table renders one row per EVENT instead (see `tableRows` above). */
  private toFieldRows(ev: TimelineEvent): HistoryFieldRow[] {
    const lines: TimelineDiff[] = ev.diffs.length > 0
      ? ev.diffs
      : ev.statusChange
        ? [{
            label: this.translate.instant('COST.EMPLOYEE_COST.HISTORY_COL_STATUS'),
            before: ev.statusChange.split(' → ')[0],
            after:  ev.statusChange.split(' → ')[1],
          }]
        : [{ label: '—', before: '—', after: '—' }];
    return lines.map(d => ({
      dateDisplay: ev.dateDisplay, actor: ev.actor, action: ev.action,
      fieldLabel: d.label, before: d.before, after: d.after,
    }));
  }

  readonly flatRows = computed<HistoryFieldRow[]>(() =>
    this.filteredEvents().flatMap(ev => this.toFieldRows(ev)));

  /** Both views now paginate over the SAME events (the table shows one row per event too,
   * see `tableRows` above) — one shared count, no more branching on `viewMode()`. */
  readonly historyTotalElements = computed(() => this.filteredEvents().length);

  readonly historyTotalPages = computed(() => Math.ceil(this.historyTotalElements() / this.historySize()) || 1);

  readonly pagedEvents = computed<TimelineEvent[]>(() => {
    const start = this.historyPage() * this.historySize();
    return this.filteredEvents().slice(start, start + this.historySize());
  });

  goToHistoryPage(p: number): void {
    if (p < 0 || p >= this.historyTotalPages()) return;
    this.historyPage.set(p);
  }

  onHistoryPageSize(size: number): void {
    this.historySize.set(size);
    this.historyPage.set(0);
  }

  ngOnInit(): void {
    this.affaireSvc.getUsers().subscribe(u => this.users.set(u));

    if (!this.recordId || isNaN(this.recordId)) {
      this.loadError.set(this.translate.instant('COST.EMPLOYEE_COST.LOAD_ERROR'));
      this.loading.set(false);
      return;
    }
    this.svc.getAuditLog(this.recordId).subscribe({
      next: entries => {
        this.historyTrail.set(entries);
        this.loading.set(false);
      },
      error: err => {
        this.loadError.set(err.error?.detail ?? this.translate.instant('COST.EMPLOYEE_COST.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  /** Resolves `actorId` to the person's full name — falls back to the raw role string
   * (still informative, e.g. "SYSTEM" for an automated STATUS_NORMALIZED entry) when the
   * id isn't found in `/ref/users` (a deactivated account, or a system/service actor with
   * no user record at all). */
  private actorName(actorId: number, actorRole: string | null): string {
    const user = this.users().find(u => u.id === actorId);
    return user?.fullName ?? actorRole ?? '—';
  }

  /** The event block's header line — "{date} — {action} par {actor}" — built through
   * i18n rather than hardcoded in the template, so the connector word ("par"/"by")
   * follows the active language like everything else on this page. */
  eventHeader(ev: TimelineEvent): string {
    return this.translate.instant('COST.EMPLOYEE_COST.HISTORY_EVENT_LINE', {
      date: ev.dateDisplay, action: ev.action, actor: ev.actor,
    });
  }

  back(): void {
    this.router.navigate(['/finance/cost/employee-costs']);
  }

  private fmtDateTime(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  /** Which of the raw snapshot's fields to show, in this order, and how to label/format
   * each one — reuses the SAME formatters the main list uses (`formatAmount`/`formatDate`
   * from `employee-cost-display.ts`) so a changed cost or date reads the same way here as
   * it does in the main table. `userRefId` is deliberately excluded: it's an internal id
   * with no meaning to whoever is reading this history, and `employeeEmail` already
   * identifies the person. */
  private static readonly AUDIT_FIELDS: {
    key: string; labelKey: string; format: (v: unknown) => string;
  }[] = [
    { key: 'employeeEmail', labelKey: 'COST.EMPLOYEE_COST.EMPLOYEE_EMAIL', format: v => String(v) },
    { key: 'basicCost', labelKey: 'COST.EMPLOYEE_COST.BASIC_COST', format: v => formatAmount(Number(v)) },
    { key: 'internalSellingCost', labelKey: 'COST.EMPLOYEE_COST.INTERNAL_SELLING_COST', format: v => formatAmount(Number(v)) },
    { key: 'externalSellingCost', labelKey: 'COST.EMPLOYEE_COST.EXTERNAL_SELLING_COST', format: v => formatAmount(Number(v)) },
    { key: 'currency', labelKey: 'COST.EMPLOYEE_COST.CURRENCY', format: v => String(v) },
    { key: 'dateDebut', labelKey: 'COST.EMPLOYEE_COST.DATE_DEBUT', format: v => formatDate(String(v)) },
    { key: 'dateFin', labelKey: 'COST.EMPLOYEE_COST.DATE_FIN', format: v => formatDate(String(v)) },
    { key: 'sourceStatus', labelKey: 'COST.EMPLOYEE_COST.HISTORY_COL_STATUS', format: v => String(v) },
  ];

  /** Extracts the real field-level changes from an audit entry's `metadata` JSON
   * (`{"before":{...},"after":{...}}`) — only the fields that actually differ, so a long
   * unchanged field list doesn't drown out what matters. CREATE entries only carry
   * `after` (before reads '—'); DELETE entries only carry `before` (after reads '—').
   * STATUS_NORMALIZED cascade entries carry no metadata at all — empty list, handled by
   * `toEvent()`'s `statusChange` fallback above. */
  private diffEntries(metadata: string | null | undefined): TimelineDiff[] {
    if (!metadata) return [];
    try {
      const parsed = JSON.parse(metadata) as { before?: Record<string, unknown>; after?: Record<string, unknown> };
      const { before, after } = parsed;
      const label = (labelKey: string) => this.translate.instant(labelKey);

      if (before && after) {
        return EmployeeCostHistoryComponent.AUDIT_FIELDS
          .filter(f => JSON.stringify(before[f.key]) !== JSON.stringify(after[f.key]))
          .map(f => ({ label: label(f.labelKey), before: f.format(before[f.key]), after: f.format(after[f.key]) }));
      }

      const only = after ?? before;
      if (!only) return [];
      const isCreate = !!after;
      return EmployeeCostHistoryComponent.AUDIT_FIELDS
        .filter(f => only[f.key] !== undefined)
        .map(f => ({
          label: label(f.labelKey),
          before: isCreate ? '—' : f.format(only[f.key]),
          after:  isCreate ? f.format(only[f.key]) : '—',
        }));
    } catch {
      return [];
    }
  }

  /** Same `xlsx` pattern as EmployeeCostComponent's own `exportExcel()` — spreadsheets are
   * inherently flat, so this exports `flatRows()`, the exact same one-row-per-changed-
   * field data the table view shows on screen. */
  exportHistoryExcel(): void {
    const rows = this.flatRows();
    if (!rows.length) return;

    const t = (k: string) => this.translate.instant(k);
    const sheetRows = rows.map(r => ({
      [t('COST.EMPLOYEE_COST.HISTORY_COL_DATE')]:    r.dateDisplay,
      [t('COST.EMPLOYEE_COST.HISTORY_COL_USER')]:    r.actor,
      [t('COST.EMPLOYEE_COST.HISTORY_COL_FIELD')]:   r.fieldLabel,
      [t('COST.EMPLOYEE_COST.HISTORY_COL_BEFORE')]:  r.before,
      [t('COST.EMPLOYEE_COST.HISTORY_COL_AFTER')]:   r.after,
      [t('COST.EMPLOYEE_COST.HISTORY_COL_ACTION')]:  r.action,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), t('COST.EMPLOYEE_COST.HISTORY_TITLE'));
    const who = this.employeeName ?? this.employeeEmail ?? String(this.recordId);
    XLSX.writeFile(wb, `Historique_Cout_${who}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
