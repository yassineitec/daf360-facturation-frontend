import { ChangeDetectionStrategy, Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MetricCardComponent, MultiDatePickerComponent, SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';
import { DepenseService } from './depense.service';
import { DepensePreview, DepenseLigne } from './depense.model';
import { DepenseSummaryTableComponent } from './depense-summary-table.component';
import { DepenseCollaboratorDetailComponent } from './depense-collaborator-detail.component';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/**
 * "Dépense" tab — read-only visibility into Timesheet-logged hours for FORFAIT/LIVRABLE
 * affaires, valued at internal cost. No write path anywhere in this tab: no validate, no
 * lock, no billing line. See docs/superpowers/specs/2026-09-16-affaire-depense-tab-design.md.
 */
@Component({
  selector: 'app-affaire-depense-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MetricCardComponent, DepenseSummaryTableComponent, DepenseCollaboratorDetailComponent],
  providers: [DisplayCurrencyPipe],
  templateUrl: './affaire-depense-tab.component.html',
})
export class AffaireDepenseTabComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc = inject(DepenseService);
  private readonly translate = inject(TranslateService);
  private readonly currency = inject(DisplayCurrencyPipe);

  protected readonly loading = signal(false);
  protected readonly preview = signal<DepensePreview | null>(null);
  protected readonly selectedEmail = signal<string | null>(null);

  /** Single filter control with 3 modes — see
   * docs/superpowers/specs/2026-09-17-depense-tab-enhancements-design.md section 4. 'ALL'
   * (default) shows the full life-to-date data exactly as before this feature; the other 3
   * modes narrow `filteredLignes()`, which every consumer (KPI tiles, both tables) reads
   * instead of `preview()?.lignes` directly. */
  protected readonly filterMode = signal<'ALL' | 'PERIOD' | 'MONTH' | 'YEAR'>('ALL');
  protected readonly filterRangeDates = signal<Date | Date[] | null>(null);
  protected readonly filterMonth = signal<{ year: number; month: number } | null>(null);
  protected readonly filterYear = signal<number | null>(null);

  /** Same `this.currency.transform(v, devise)` convention `affaire-detail.component.ts`'s
   * own `money()` helper and `AffaireWipTabComponent` already use — internal cost is still a
   * monetary figure in the affaire's own currency, formatted the same way everywhere else. */
  protected readonly kpiTiles = computed(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const lignes = this.filteredLignes();
    const totalHours = lignes.reduce((s, l) => s + l.hours, 0);
    const totalCost = lignes.reduce((s, l) => s + l.costAmount, 0);
    const collaboratorCount = new Set(lignes.map(l => l.userEmail)).size;
    return [
      { label: t('AFFAIRES.DEPENSE.KPI_HOURS'), value: totalHours.toFixed(2) + ' h',
        options: { icon: 'schedule', iconColor: 'text-primary', iconBg: 'bg-primary/10' } },
      { label: t('AFFAIRES.DEPENSE.KPI_COST'), value: this.currency.transform(totalCost, this.affaire.devise),
        options: { icon: 'payments', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' } },
      { label: t('AFFAIRES.DEPENSE.KPI_COLLABORATORS'), value: collaboratorCount,
        options: { icon: 'groups', iconColor: 'text-tertiary', iconBg: 'bg-tertiary/10' } },
    ];
  });

  /** ISO `YYYY-MM-DD`, local calendar date, no time component — same shape as
   * `DepenseLigne.date`, and the same conversion the WIP tab's own AV date-range picker
   * already uses (`affaire-wip-tab.component.ts`'s `toIso`). Lets `filteredLignes()` compare
   * with plain string ops — no `Date` parsing or timezone-conversion risk. */
  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  protected readonly filterRange = computed<{ start: string; end: string } | null>(() => {
    const value = this.filterRangeDates();
    if (!Array.isArray(value) || value.length !== 2) return null;
    return { start: this.toIso(value[0]), end: this.toIso(value[1]) };
  });

  /** Derived from the actual fetched data, not a hardcoded range — a Mois/Année option is
   * never offered for a window with zero rows. */
  protected readonly availableYears = computed(() => {
    const years = new Set((this.preview()?.lignes ?? []).map(l => Number(l.date.slice(0, 4))));
    return [...years].sort((a, b) => b - a);
  });

  protected readonly availableMonths = computed(() => {
    const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
    const seen = new Map<string, { year: number; month: number }>();
    for (const l of this.preview()?.lignes ?? []) {
      const year = Number(l.date.slice(0, 4));
      const month = Number(l.date.slice(5, 7));
      seen.set(key(year, month), { year, month });
    }
    return [...seen.values()].sort((a, b) => b.year - a.year || b.month - a.month);
  });

  protected readonly monthSelectOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return this.availableMonths().map(m => ({
      value: `${m.year}-${String(m.month).padStart(2, '0')}`,
      label: `${this.translate.instant('COST.RATE.MONTHS.M' + m.month)} ${m.year}`,
    }));
  });

  protected readonly yearSelectOptions = computed<SelectOption[]>(() =>
    this.availableYears().map(y => ({ value: String(y), label: String(y) })),
  );

  protected readonly selectedMonthValue = computed<string[]>(() => {
    const m = this.filterMonth();
    return m ? [`${m.year}-${String(m.month).padStart(2, '0')}`] : [];
  });

  protected readonly selectedYearValue = computed<string[]>(() => {
    const y = this.filterYear();
    return y != null ? [String(y)] : [];
  });

  /** Single source of truth every consumer reads instead of `preview()?.lignes` directly —
   * `kpiTiles` below, and (from Task 6 onward) both child tables' `[lignes]` binding. ISO
   * string comparison is lexicographically correct for both the range and the `startsWith`
   * prefix checks — no `Date` parsing needed. */
  protected readonly filteredLignes = computed<DepenseLigne[]>(() => {
    const all = this.preview()?.lignes ?? [];
    switch (this.filterMode()) {
      case 'PERIOD': {
        const r = this.filterRange();
        if (!r) return all;
        return all.filter(l => l.date >= r.start && l.date <= r.end);
      }
      case 'MONTH': {
        const m = this.filterMonth();
        if (!m) return all;
        const prefix = `${m.year}-${String(m.month).padStart(2, '0')}`;
        return all.filter(l => l.date.startsWith(prefix));
      }
      case 'YEAR': {
        const y = this.filterYear();
        if (y == null) return all;
        return all.filter(l => l.date.startsWith(String(y)));
      }
      default:
        return all;
    }
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.svc.getDepense(this.affaire.id).subscribe(p => {
      this.preview.set(p);
      this.loading.set(false);
    });
  }

  onCollaboratorSelected(email: string): void {
    this.selectedEmail.set(email);
  }

  onBack(): void {
    this.selectedEmail.set(null);
  }

  setFilterMode(mode: 'ALL' | 'PERIOD' | 'MONTH' | 'YEAR'): void {
    this.filterMode.set(mode);
    this.filterRangeDates.set(null);
    this.filterMonth.set(null);
    this.filterYear.set(null);
    this.selectedEmail.set(null);
  }

  onFilterRangeChange(value: Date | Date[] | null): void {
    this.filterRangeDates.set(value);
    // `null` arrives when the user clicks "Effacer" in the picker — unlike the WIP tab's AV
    // period (which always needs a value), this filter is optional: clearing it means "show
    // everything again", so fall back to 'ALL' instead of leaving a stale range applied.
    if (value === null) this.filterMode.set('ALL');
    this.selectedEmail.set(null);
  }

  onFilterMonthChange(values: string[]): void {
    const v = values[0];
    if (!v) {
      this.filterMonth.set(null);
      this.selectedEmail.set(null);
      return;
    }
    const [year, month] = v.split('-').map(Number);
    this.filterMonth.set({ year, month });
    this.selectedEmail.set(null);
  }

  onFilterYearChange(values: string[]): void {
    const v = values[0];
    this.filterYear.set(v ? Number(v) : null);
    this.selectedEmail.set(null);
  }
}
