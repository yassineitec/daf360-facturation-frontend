import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataTableComponent, TableColumn, TableConfig, TableRow } from '@khalilrebhiitec/daf360';
import { DepenseLigne } from './depense.model';

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
  imports: [DataTableComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table [columns]="columns()" [rows]="rows()" [config]="config()"
      (rowClick)="collaboratorSelected.emit($any($event)['email'])" />
  `,
})
export class DepenseSummaryTableComponent {
  private readonly translate = inject(TranslateService);

  lignes = input.required<DepenseLigne[]>();
  collaboratorSelected = output<string>();

  protected readonly aggregates = computed(() => {
    const byEmail = new Map<string, { email: string; userFullName: string; totalHours: number; totalCost: number; days: Set<string> }>();
    for (const l of this.lignes()) {
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

  private fmtAmt(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  /** Same `dd/MM/yyyy`-style formatting `depense-collaborator-detail.component.ts`'s own
   * `fmtDate` already uses — copied here rather than shared, matching this tab's existing
   * "deliberately independent, not shared with the WIP sibling" convention. */
  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
