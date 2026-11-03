import { Component, OnInit, inject, signal, computed, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, TableColumn, TableConfig, SearchToolbarComponent,
  SearchToolbarFilterConfig, FilterField, FilterResult, PaginationComponent,
} from '@khalilrebhiitec/daf360';
import { AuditTrailService, AuditTrailEntryDto } from '../../../core/audit-trail.service';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-audit-trail-admin',
  standalone: true,
  imports: [CommonModule, TranslatePipe, DataTableComponent, SearchToolbarComponent, PaginationComponent],
  templateUrl: './audit-trail-admin.component.html',
})
export class AuditTrailAdminComponent implements OnInit {
  private readonly auditSvc = inject(AuditTrailService);
  private readonly translate = inject(TranslateService);

  readonly auditTableRef = viewChild<DataTableComponent>('auditDataTable');

  rows = signal<AuditTrailEntryDto[]>([]);
  totalElements = signal(0);
  currentPage = signal(0);
  pageSize = signal(PAGE_SIZE_OPTIONS[1]);
  isLoading = signal(false);
  loadError = signal<string | null>(null);
  tableOptions = signal<{ value: string; label: string }[]>([]);
  filter = signal<FilterResult>({});

  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'changedAt', label: t('ADMIN.AUDIT_TRAIL.COL_DATE') },
      { key: 'tableName', label: t('ADMIN.AUDIT_TRAIL.COL_TABLE') },
      { key: 'action',    label: t('ADMIN.AUDIT_TRAIL.COL_ACTION') },
      { key: 'pkJson',    label: t('ADMIN.AUDIT_TRAIL.COL_PK') },
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

  ngOnInit(): void {
    this.auditSvc.listTables().subscribe(tables =>
      this.tableOptions.set(tables.map(t => ({ value: t, label: t }))));
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
        this.rows.set(page.content);
        this.totalElements.set(page.totalElements);
        this.isLoading.set(false);
      },
      error: err => {
        this.loadError.set(err.error?.message ?? this.translate.instant('ADMIN.AUDIT_TRAIL.ERR_LOAD'));
        this.isLoading.set(false);
      },
    });
  }
}
