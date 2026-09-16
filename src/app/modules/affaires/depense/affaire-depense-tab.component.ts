import { ChangeDetectionStrategy, Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MetricCardComponent } from '@khalilrebhiitec/daf360';
import { DepenseService } from './depense.service';
import { DepensePreview } from './depense.model';
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

  /** Same `this.currency.transform(v, devise)` convention `affaire-detail.component.ts`'s
   * own `money()` helper and `AffaireWipTabComponent` already use — internal cost is still a
   * monetary figure in the affaire's own currency, formatted the same way everywhere else. */
  protected readonly kpiTiles = computed(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const p = this.preview();
    return [
      { label: t('AFFAIRES.DEPENSE.KPI_HOURS'), value: (p?.totalHours ?? 0).toFixed(2),
        options: { icon: 'schedule', iconColor: 'text-primary', iconBg: 'bg-primary/10' } },
      { label: t('AFFAIRES.DEPENSE.KPI_COST'), value: this.currency.transform(p?.totalCost ?? null, this.affaire.devise),
        options: { icon: 'payments', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' } },
      { label: t('AFFAIRES.DEPENSE.KPI_COLLABORATORS'), value: p?.collaboratorCount ?? 0,
        options: { icon: 'groups', iconColor: 'text-tertiary', iconBg: 'bg-tertiary/10' } },
    ];
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
}
