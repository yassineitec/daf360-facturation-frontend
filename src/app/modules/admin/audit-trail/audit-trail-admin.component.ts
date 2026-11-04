import { Component, OnInit, inject, signal, computed, viewChild, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DataTableComponent, TableColumn, TableConfig, TableRow, SearchToolbarComponent,
  SearchToolbarFilterConfig, FilterField, FilterResult, PaginationComponent,
  ModalService, ModalRef, StatusBadgeComponent,
} from '@khalilrebhiitec/daf360';
import { AuditTrailService, AuditTrailEntryDto } from '../../../core/audit-trail.service';
import { AffaireService } from '../../affaires/affaire.service';
import {
  tableLabel, tableDomain, recordIdentity, rowAffaireId, computeFieldDiffs, groupBatches,
  actionVariant, domainVariant, FieldDiff, DisplayRow,
} from './audit-trail-display.util';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-audit-trail-admin',
  standalone: true,
  imports: [CommonModule, TranslatePipe, DataTableComponent, SearchToolbarComponent, PaginationComponent, StatusBadgeComponent],
  templateUrl: './audit-trail-admin.component.html',
  styles: [`
    /* ── Ledger rail: a thin coloured spine on the date cell, keyed to the action ── */
    .ledger-rail { position: relative; display: inline-block; padding-left: 0.65rem;
      font-family: ui-monospace, 'Consolas', monospace; font-size: 0.75rem; color: #475569; }
    .ledger-rail::before { content: ''; position: absolute; left: 0; top: 1px; bottom: 1px;
      width: 3px; border-radius: 2px; background: var(--rail-color, #cbd5e1); }
    .ledger-rail-group::before { background-image:
      repeating-linear-gradient(to bottom, var(--rail-color, #cbd5e1) 0 3px, transparent 3px 6px);
      background-color: transparent; }

    .record-cell { display: inline-flex; align-items: center; gap: 0.35rem; }
    .group-cell { font-style: italic; color: #475569; cursor: help; }
    .group-icon { font-size: 15px; color: #64748b; }

    .detail-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.5rem; margin-bottom: 1.25rem;
      font-size: 0.8rem; }
    .detail-meta-label { display: block; font-size: 0.7rem; font-weight: 600; color: #94a3b8; }

    /* ── Field diff: a version-control-style +/- list, one entry per changed field ── */
    .diff-list { display: flex; flex-direction: column; font-size: 0.8rem;
      font-family: ui-monospace, 'Consolas', monospace; }
    .diff-row { padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; }
    .diff-field-name { font-family: -apple-system, sans-serif; font-weight: 600; color: #64748b;
      font-size: 0.75rem; margin-bottom: 0.25rem; }
    .diff-line { padding: 0.15rem 0.5rem; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
    .diff-marker { display: inline-block; width: 1.2em; font-weight: 700; }
    .diff-line-removed { background: #fef2f2; color: #991b1b; }
    .diff-line-removed .diff-marker { color: #dc2626; }
    .diff-line-added { background: #f0fdf4; color: #166534; margin-top: 2px; }
    .diff-line-added .diff-marker { color: #16a34a; }
    .diff-line-unchanged { color: #94a3b8; }

    .diff-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .diff-table th { text-align: left; padding: 0.5rem 0.75rem; background: #f8fafc; color: #475569;
      font-weight: 700; font-size: 0.7rem; border-bottom: 1px solid #e2e8f0; }
    .diff-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; vertical-align: top;
      word-break: break-word; }
    .group-members-table .group-member-row { cursor: pointer; }
    .group-members-table .group-member-row:hover { background: #eff6ff; }
  `],
})
export class AuditTrailAdminComponent implements OnInit {
  private readonly auditSvc = inject(AuditTrailService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate = inject(TranslateService);
  private readonly modal = inject(ModalService);

  readonly auditTableRef = viewChild<DataTableComponent>('auditDataTable');
  @ViewChild('detailTpl') detailTpl!: TemplateRef<unknown>;
  @ViewChild('groupTpl') groupTpl!: TemplateRef<unknown>;

  entries = signal<AuditTrailEntryDto[]>([]);
  totalElements = signal(0);
  currentPage = signal(0);
  pageSize = signal(PAGE_SIZE_OPTIONS[1]);
  isLoading = signal(false);
  loadError = signal<string | null>(null);
  tableOptions = signal<{ value: string; label: string }[]>([]);
  filter = signal<FilterResult>({});

  /** affaire_id -> reference, resolved lazily for whichever ids show up on the current page.
   *  'Affaire #<id>' is shown as a placeholder (and kept) if the lookup 404s -- an unauthorized
   *  or deleted affaire shouldn't block reading the rest of the audit entry. */
  private affaireLabels = signal<Record<number, string>>({});

  /** The row currently shown in the detail/group modal -- read by the modal templates. */
  activeEntry = signal<AuditTrailEntryDto | null>(null);
  activeGroup = signal<AuditTrailEntryDto[] | null>(null);
  private modalRef: ModalRef | null = null;

  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  readonly displayRows = computed<DisplayRow<AuditTrailEntryDto>[]>(() => groupBatches(this.entries()));

  readonly rows = computed<TableRow[]>(() => {
    const affaireLabels = this.affaireLabels();
    const affaireCell = (id: number | null): string =>
      id === null ? '—' : (affaireLabels[id] ?? this.translate.instant('ADMIN.AUDIT_TRAIL.AFFAIRE_PLACEHOLDER', { id }));

    return this.displayRows().map((r, i) => {
      if (r.kind === 'group') {
        return {
          id: `group-${i}`,
          changedAt: r.members[0].changedAt,
          domain: tableDomain(r.tableName),
          tableName: tableLabel(r.tableName),
          action: r.action,
          record: this.translate.instant('ADMIN.AUDIT_TRAIL.GROUP_LABEL', { count: r.members.length }),
          affaire: '—',
          changedBy: this.translate.instant('ADMIN.AUDIT_TRAIL.ACTOR_SYSTEM'),
          _group: r.members,
        } as TableRow;
      }
      return {
        id: String(r.entry.id),
        changedAt: r.entry.changedAt,
        domain: tableDomain(r.entry.tableName),
        tableName: tableLabel(r.entry.tableName),
        action: r.entry.action,
        record: recordIdentity(r.entry),
        affaire: affaireCell(rowAffaireId(r.entry)),
        changedBy: r.entry.changedBy ?? '—',
        _entry: r.entry,
      } as TableRow;
    });
  });

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'changedAt', label: t('ADMIN.AUDIT_TRAIL.COL_DATE') },
      { key: 'domain',    label: t('ADMIN.AUDIT_TRAIL.COL_DOMAIN') },
      { key: 'tableName', label: t('ADMIN.AUDIT_TRAIL.COL_TABLE') },
      { key: 'action',    label: t('ADMIN.AUDIT_TRAIL.COL_ACTION') },
      { key: 'record',    label: t('ADMIN.AUDIT_TRAIL.COL_PK') },
      { key: 'affaire',   label: t('ADMIN.AUDIT_TRAIL.COL_AFFAIRE') },
      { key: 'changedBy', label: t('ADMIN.AUDIT_TRAIL.COL_ACTOR') },
    ];
  });

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable: true,
    loading: this.isLoading(),
    emptyMessage: this.translate.instant('ADMIN.AUDIT_TRAIL.EMPTY'),
  }));

  readonly filterFields = computed<FilterField[]>(() => {
    const t = (key: string) => this.translate.instant(key);
    return [
      { name: 'changedAt', label: t('ADMIN.AUDIT_TRAIL.COL_DATE'), type: 'daterange' },
      { name: 'tableName', label: t('ADMIN.AUDIT_TRAIL.COL_TABLE'), type: 'select', searchable: true, options: this.tableOptions() },
      { name: 'changedBy', label: t('ADMIN.AUDIT_TRAIL.COL_ACTOR'), type: 'text' },
    ];
    // Domain isn't filterable server-side (it's a frontend-only grouping over tableName, not a
    // column search can target), so it's shown but not added as a filter field here.
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => ({
    title: this.translate.instant('ADMIN.AUDIT_TRAIL.FILTER_TITLE'),
    applyLabel: this.translate.instant('ADMIN.AUDIT_TRAIL.FILTER_APPLY'),
    cancelLabel: this.translate.instant('ADMIN.COMMON.CANCEL'),
    resetLabel: this.translate.instant('ADMIN.AUDIT_TRAIL.FILTER_RESET'),
    align: 'right',
    initialValues: this.filter(),
  }));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalElements() / this.pageSize())));

  readonly activeDiff = computed<FieldDiff[]>(() => {
    const entry = this.activeEntry();
    return entry ? computeFieldDiffs(entry) : [];
  });

  ngOnInit(): void {
    this.auditSvc.listTables().subscribe(tables =>
      this.tableOptions.set(tables.map(t => ({ value: t, label: tableLabel(t) }))));
    this.load();
  }

  onFilterApply(result: FilterResult): void {
    this.filter.set(result);
    this.currentPage.set(0);
    this.load();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.load();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(0);
    this.load();
  }

  onRowClick(row: TableRow): void {
    const group = row['_group'] as AuditTrailEntryDto[] | undefined;
    if (group) {
      this.openGroupModal(group);
      return;
    }
    this.openDetailModal(row['_entry'] as AuditTrailEntryDto);
  }

  openDetailModal(entry: AuditTrailEntryDto): void {
    this.activeEntry.set(entry);
    this.modalRef = this.modal.open({
      title: this.translate.instant('ADMIN.AUDIT_TRAIL.DETAIL_TITLE'),
      body: this.detailTpl,
      size: 'lg',
      buttons: [{ label: this.translate.instant('ADMIN.COMMON.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  openGroupModal(members: AuditTrailEntryDto[]): void {
    this.activeGroup.set(members);
    this.modalRef = this.modal.open({
      title: this.translate.instant('ADMIN.AUDIT_TRAIL.GROUP_MODAL_TITLE'),
      body: this.groupTpl,
      size: 'lg',
      buttons: [{ label: this.translate.instant('ADMIN.COMMON.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  /** Clicking a member inside the group modal replaces it with that entry's own detail. */
  openDetailFromGroup(entry: AuditTrailEntryDto): void {
    this.modalRef?.close();
    this.openDetailModal(entry);
  }

  recordIdentity = recordIdentity;
  tableDomain = tableDomain;
  tableLabel = tableLabel;
  actionVariant = actionVariant;
  domainVariant = domainVariant;

  /** The ledger rail's colour, by action -- same green/blue/red convention as the action badge,
   *  just restated as a CSS colour since the rail is a plain border, not a `daf-badge`. */
  railColor(row: TableRow): string {
    switch (row['action']) {
      case 'I': return '#15803d';
      case 'D': return '#b91c1c';
      default:  return '#2563eb';
    }
  }

  affaireLabelFor(entry: AuditTrailEntryDto): string {
    const id = rowAffaireId(entry);
    if (id === null) return '—';
    return this.affaireLabels()[id] ?? this.translate.instant('ADMIN.AUDIT_TRAIL.AFFAIRE_PLACEHOLDER', { id });
  }

  private load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    const f = this.filter();
    // daterange fields come back as a Date[] (one date = a single day), same convention as
    // approval-queue.component.ts's historyFilter -- not {from, to}.
    const range = Array.isArray(f['changedAt']) ? (f['changedAt'] as Date[]) : null;
    const from = range?.length ? `${toIsoDay(range[0])}T00:00:00` : undefined;
    const to = range?.length ? `${toIsoDay(range[range.length - 1])}T23:59:59` : undefined;

    this.auditSvc.search({
      tableName: f['tableName'] as string | undefined,
      actor: f['changedBy'] as string | undefined,
      from,
      to,
      page: this.currentPage(),
      size: this.pageSize(),
    }).subscribe({
      next: page => {
        this.entries.set(page.content);
        this.totalElements.set(page.totalElements);
        this.isLoading.set(false);
        this.resolveAffaires(page.content);
      },
      error: err => {
        this.loadError.set(err.error?.message ?? this.translate.instant('ADMIN.AUDIT_TRAIL.ERR_LOAD'));
        this.isLoading.set(false);
      },
    });
  }

  /** Resolves whichever affaire_ids appear on this page and aren't already cached -- at most a
   *  couple dozen individual GETs per page load (the audit page size caps at 100 rows and most
   *  pages carry far fewer distinct affaires than that), never a full affaire list fetch. */
  private resolveAffaires(entries: AuditTrailEntryDto[]): void {
    const known = this.affaireLabels();
    const missing = Array.from(new Set(
      entries.map(rowAffaireId).filter((id): id is number => id !== null && !(id in known))
    ));
    if (missing.length === 0) return;

    forkJoin(missing.map(id => this.affaireSvc.getAffaire(id).pipe(
      catchError(() => of(null)),
    ))).subscribe(results => {
      const next = { ...this.affaireLabels() };
      results.forEach((affaire, i) => {
        if (affaire) next[missing[i]] = affaire.reference;
      });
      this.affaireLabels.set(next);
    });
  }
}
