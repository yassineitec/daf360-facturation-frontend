import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, DataTableComponent, TableColumn, TableConfig, TableRow } from '@khalilrebhiitec/daf360';
import { WipTmHourDto } from './wip.model';
import { isoWeek } from '../../../shared/iso-week';
/**
 * Drill-down for one collaborator out of a WIP T&M preview — the "most important
 * information" summary strip (hours, cost, average rate, days worked) plus the full
 * Date -> Discipline -> WBS -> Document breakdown that used to be crammed into the
 * top-level table for every collaborator at once.
 */
@Component({
  selector: 'app-wip-tm-collaborator-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [DataTableComponent, ButtonComponent, TranslatePipe],
  host: { class: 'block' },
  templateUrl: './wip-tm-collaborator-detail.component.html',
})
export class WipTmCollaboratorDetailComponent {
  private readonly translate = inject(TranslateService);

  /** Full preview list — filtered internally to userId, so the parent never has to
   * duplicate the same aggregation/filtering logic the summary table already did. */
  hours  = input.required<WipTmHourDto[]>();
  userId = input.required<number>();
  back   = output<void>();

  protected readonly rowsForUser = computed(() => this.hours().filter(h => h.userId === this.userId()));

  protected readonly userFullName = computed(() => this.rowsForUser()[0]?.userFullName ?? '');

  protected readonly summary = computed(() => {
    const rows = this.rowsForUser();
    const totalHours = rows.reduce((sum, h) => sum + h.hoursValidated, 0);
    const totalCost  = rows.reduce((sum, h) => sum + h.costAmount, 0);
    const days = new Set(rows.map(h => h.workDate)).size;
    const documents = new Set(rows.map(h => h.document).filter(Boolean)).size;
    return {
      totalHours,
      totalCost,
      avgRate: totalHours > 0 ? totalCost / totalHours : 0,
      days,
      documents,
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'workDate',   label: t('AFFAIRES.WIP.COL_DATE'),       type: 'text' },
      { key: 'week',       label: t('AFFAIRES.WIP.COL_WEEK'),       type: 'text' },
      { key: 'discipline', label: t('AFFAIRES.WIP.COL_DISCIPLINE'), type: 'text' },
      { key: 'wbs',        label: t('AFFAIRES.WIP.COL_WBS'),        type: 'text' },
      { key: 'document',   label: t('AFFAIRES.WIP.COL_DOCUMENT'),   type: 'text' },
      { key: 'hours',      label: t('AFFAIRES.WIP.COL_HOURS'),      type: 'text', align: 'right' },
      { key: 'cost',       label: t('AFFAIRES.WIP.COL_COST'),       type: 'text', align: 'right' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() =>
    this.rowsForUser()
      .slice()
      .sort((a, b) => a.workDate.localeCompare(b.workDate))
      .map((h, i) => ({
        id:         i,
        workDate:   this.fmtDate(h.workDate),
        week:       'S' + isoWeek(h.workDate),
        discipline: h.disciplineLabel ?? '—',
        wbs:        h.wbsName ?? h.wbsId ?? '—',
        document:   h.document ?? '—',
        hours:      h.hoursValidated.toFixed(2),
        cost:       this.fmtAmt(h.costAmount),
      })),
  );

  protected readonly config = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable: true,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.EMPTY_DETAIL'),
  }));

  protected fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  protected fmtAmt(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }
}
