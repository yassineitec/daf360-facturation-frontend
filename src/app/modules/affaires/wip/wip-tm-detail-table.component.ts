import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataTableComponent, TableColumn, TableConfig, TableRow } from '@khalilrebhiitec/daf360';
import { WipTmHourDto } from './wip.model';

/**
 * Date -> Collaborateur -> Discipline -> WBS -> Document drill-down for a WIP T&M preview —
 * the house table style (no wrapper, no outer card, showHeader true since this is the only
 * table on the page rather than one of several sections).
 *
 * Stateless: hours in, nothing out — this is a read-only audit view.
 */
@Component({
  selector: 'app-wip-tm-detail-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table [columns]="columns()" [rows]="rows()" [config]="config()" />
  `,
})
export class WipTmDetailTableComponent {
  private readonly translate = inject(TranslateService);

  hours = input.required<WipTmHourDto[]>();

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'workDate',   label: t('AFFAIRES.WIP.COL_DATE'),         type: 'text' },
      { key: 'user',       label: t('AFFAIRES.WIP.COL_COLLABORATOR'), type: 'text' },
      { key: 'discipline', label: t('AFFAIRES.WIP.COL_DISCIPLINE'),   type: 'text' },
      { key: 'wbs',        label: t('AFFAIRES.WIP.COL_WBS'),          type: 'text' },
      { key: 'document',   label: t('AFFAIRES.WIP.COL_DOCUMENT'),     type: 'text' },
      { key: 'hours',      label: t('AFFAIRES.WIP.COL_HOURS'),        type: 'text', align: 'right' },
      { key: 'cost',       label: t('AFFAIRES.WIP.COL_COST'),         type: 'text', align: 'right' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() =>
    this.hours().map((h, i) => ({
      id: i,
      workDate:   this.fmtDate(h.workDate),
      user:       h.userFullName,
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

  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private fmtAmt(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }
}
