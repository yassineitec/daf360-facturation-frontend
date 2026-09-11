import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataTableComponent, TableColumn, TableConfig, TableRow } from '@khalilrebhiitec/daf360';
import { WipTmHourDto } from './wip.model';
import { centered } from '../../../shared/table-align';

/**
 * WIP T&M preview, aggregated one row per collaborator — the flat Date -> Collaborateur ->
 * Discipline -> WBS -> Document list this used to render directly became unreadable on a
 * real affaire (hundreds of rows for a handful of people). Clicking a row now hands the
 * full per-collaborator breakdown to a drill-down view instead
 * (see WipTmCollaboratorDetailComponent).
 *
 * Stateless: hours in, a userId out on click — this component owns no drill-down state
 * itself, the parent tab does (see affaire-wip-tab.component.ts).
 */
@Component({
  selector: 'app-wip-tm-detail-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table [columns]="columns()" [rows]="rows()" [config]="config()"
      (rowClick)="collaboratorSelected.emit($any($event)['userId'])" />
  `,
})
export class WipTmDetailTableComponent {
  private readonly translate = inject(TranslateService);

  hours = input.required<WipTmHourDto[]>();
  collaboratorSelected = output<number>();

  protected readonly aggregates = computed(() => {
    const byUser = new Map<number, { userId: number; userFullName: string; totalHours: number; totalCost: number; days: Set<string> }>();
    for (const h of this.hours()) {
      const entry = byUser.get(h.userId) ?? { userId: h.userId, userFullName: h.userFullName, totalHours: 0, totalCost: 0, days: new Set<string>() };
      entry.totalHours += h.hoursValidated;
      entry.totalCost  += h.costAmount;
      entry.days.add(h.workDate);
      byUser.set(h.userId, entry);
    }
    return [...byUser.values()]
      .map(e => ({ userId: e.userId, userFullName: e.userFullName, totalHours: e.totalHours, totalCost: e.totalCost, daysWorked: e.days.size }))
      .sort((a, b) => b.totalCost - a.totalCost);
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return centered([
      { key: 'user',       label: t('AFFAIRES.WIP.COL_COLLABORATOR'), type: 'text', clickable: true },
      { key: 'daysWorked', label: t('AFFAIRES.WIP.COL_DAYS'),         type: 'text', align: 'right' },
      { key: 'hours',      label: t('AFFAIRES.WIP.COL_HOURS'),        type: 'text', align: 'right' },
      { key: 'cost',       label: t('AFFAIRES.WIP.COL_COST'),         type: 'text', align: 'right' },
    ]);
  });

  protected readonly rows = computed<TableRow[]>(() =>
    this.aggregates().map(a => ({
      id:         a.userId,
      userId:     a.userId,
      user:       a.userFullName,
      daysWorked: a.daysWorked,
      hours:      a.totalHours.toFixed(2),
      cost:       this.fmtAmt(a.totalCost),
    })),
  );

  protected readonly config = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable: true,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.EMPTY_DETAIL'),
  }));

  private fmtAmt(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }
}
