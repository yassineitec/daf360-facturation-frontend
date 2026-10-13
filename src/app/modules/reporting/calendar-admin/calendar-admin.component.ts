import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, DafCellDirective, DataTableComponent, FormFieldComponent,
  PageComponent, PageHeaderComponent, SelectComponent, SelectOption,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { UserStore } from '../../../core/user.store';
import { SubmissionCalendarService } from '../submission-calendar.service';
import { SubmissionCalendarDto } from '../pl-reporting.model';

/**
 * P&L Reporting (F.08, Task 3.3) — submission calendar admin: year selector + 12 rows (one
 * per month), each with an editable `submissionDeadline`.
 *
 * Save is PER ROW, not batched (documented choice, see Task 3.3's brief which left this to
 * the implementer): unlike the budget grid's 156 cells — where a single round trip clearly
 * beats 156 — 12 independent date fields that are each a small, often one-off correction
 * ("push March's deadline back a week") don't benefit from forcing every other month's value
 * to be re-sent just to save one. `SubmissionCalendarService.upsert()` already takes exactly
 * one `(year, month, deadline)` at a time, which matches this 1-row-at-a-time shape without
 * any adapting.
 *
 * All editing (the date field + its Save button) is gated on `FACT_ADMIN_PL_REPORT`; without
 * it the deadline renders as plain read-only text.
 */
@Component({
  selector: 'app-calendar-admin',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent,
    DataTableComponent, DafCellDirective, SelectComponent, FormFieldComponent,
  ],
  host: { class: 'block' },
  templateUrl: './calendar-admin.component.html',
})
export class CalendarAdminComponent implements OnInit {
  private readonly calendarSvc = inject(SubmissionCalendarService);
  private readonly userStore   = inject(UserStore);
  private readonly translate   = inject(TranslateService);
  private readonly destroyRef  = inject(DestroyRef);

  private readonly currentYear = new Date().getFullYear();
  year = signal<number>(this.currentYear);

  /** A bit wider than the budget screen's "current ± 1": the calendar is inherently
   *  forward-looking (next year's deadlines are set well ahead of time). */
  readonly yearOptions = computed<SelectOption[]>(() =>
    [this.currentYear - 1, this.currentYear, this.currentYear + 1, this.currentYear + 2]
      .map(y => ({ value: String(y), label: String(y) })));

  onYearSelected(values: string[]): void {
    const y = Number(values[0]);
    if (Number.isFinite(y) && y !== this.year()) {
      this.year.set(y);
      this.load();
    }
  }

  firstLoad = signal(true);
  loading   = signal(false);
  error     = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  savingMonth = signal<number | null>(null);

  readonly canEdit = computed(() => this.userStore.hasPermission('FACT_ADMIN_PL_REPORT'));

  private readonly loaded  = signal<SubmissionCalendarDto[]>([]);
  /** Deadline currently in each row's field, keyed by month — seeded from `loaded()` on every
   *  fetch, edited locally until that row's own "Enregistrer" commits it. */
  private readonly edited  = signal<Map<number, string | null>>(new Map());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    this.calendarSvc.getCalendar(this.year())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => {
          this.loaded.set(rows);
          const map = new Map<number, string | null>();
          rows.forEach(r => map.set(r.month, r.submissionDeadline));
          this.edited.set(map);
          this.loading.set(false);
          this.firstLoad.set(false);
        },
        error: () => {
          this.error.set(this.translate.instant('REPORTING.CALENDAR.LOAD_ERROR'));
          this.loading.set(false);
          this.firstLoad.set(false);
        },
      });
  }

  private existingFor(month: number): SubmissionCalendarDto | null {
    return this.loaded().find(r => r.month === month) ?? null;
  }

  private monthLabel(month: number): string {
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    const label = new Date(2000, month - 1, 1).toLocaleDateString(locale, { month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  formatDeadline(iso: string | null | undefined): string {
    if (!iso) return '—';
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    // Append a fixed time-of-day so the ISO date parses in local time, not UTC midnight —
    // otherwise a negative UTC offset rolls the displayed day back by one.
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  private formatSetAt(iso: string | null | undefined): string {
    if (!iso) return '—';
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  }

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'monthLabel', label: t('REPORTING.CALENDAR.TABLE.MONTH') },
      { key: 'deadline',   label: t('REPORTING.CALENDAR.TABLE.DEADLINE'), type: 'custom' },
      { key: 'setByLabel', label: t('REPORTING.CALENDAR.TABLE.SET_BY') },
      { key: 'setAtLabel', label: t('REPORTING.CALENDAR.TABLE.SET_AT') },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const edited = this.edited();
    return Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
      const existing = this.existingFor(month);
      return {
        id:         month,
        month,
        monthLabel: this.monthLabel(month),
        deadline:   edited.get(month) ?? null,
        setByLabel: existing?.setBy != null
          ? this.translate.instant('REPORTING.CALENDAR.SET_BY_USER', { id: existing.setBy })
          : '—',
        setAtLabel: this.formatSetAt(existing?.setAt),
      };
    });
  });

  readonly config = computed<TableConfig>(() => ({
    showHeader:   true,
    loading:      this.loading(),
    skeletonRows: 12,
    emptyMessage: this.translate.instant('REPORTING.CALENDAR.EMPTY'),
  }));

  onDeadlineChange(month: number, value: string | number | null): void {
    const map = new Map(this.edited());
    map.set(month, value == null || value === '' ? null : String(value));
    this.edited.set(map);
  }

  saveRow(month: number): void {
    const deadline = this.edited().get(month);
    if (!deadline) return;
    this.savingMonth.set(month);
    this.error.set(null);
    this.successMessage.set(null);
    this.calendarSvc.upsert({ year: this.year(), month, deadline })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: saved => {
          this.loaded.update(list => [...list.filter(r => r.month !== month), saved]);
          this.savingMonth.set(null);
          this.successMessage.set(this.translate.instant('REPORTING.CALENDAR.SAVE_SUCCESS'));
        },
        error: () => {
          this.savingMonth.set(null);
          this.error.set(this.translate.instant('REPORTING.CALENDAR.SAVE_ERROR'));
        },
      });
  }
}
