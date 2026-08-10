import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, MetricCardComponent, MetricCardOptions,
  ProgressBarComponent, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from '../../affaires/affaire.service';
import { AffaireListItem } from '../../affaires/affaire.model';
import { SubcontractingService } from '../subcontracting.service';
import { MarginDto } from '../subcontracting.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

@Component({
  selector: 'app-couts-analyse-tab',
  imports: [
    TranslatePipe, ButtonComponent, CardComponent, MetricCardComponent,
    ProgressBarComponent, SkeletonComponent, DisplayCurrencyPipe,
  ],
  host: { class: 'block' },
  templateUrl: './couts-analyse-tab.component.html',
})
export class CoutsAnalyseTabComponent {
  private readonly svc        = inject(SubcontractingService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);

  searchQuery     = signal('');
  searchResults   = signal<AffaireListItem[]>([]);
  searching       = signal(false);
  selectedAffaire = signal<AffaireListItem | null>(null);

  margin  = signal<MarginDto | null>(null);
  loading = signal(false);
  error   = signal<string | null>(null);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiCa : MetricCardOptions = { icon: 'payments',  iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiSt : MetricCardOptions = { icon: 'handshake', iconColor: 'text-warning', iconBg: 'bg-warning/10' };

  /**
   * `MarginDto.ca` is `SUM(payments.amount_local)` joined through the affaire's
   * invoices — money actually **collected**, not invoiced revenue. The tile used to be
   * labelled "CA global", which reads as turnover; the caption says which it is.
   */
  readonly caDelta = computed(() => {
    this.translate.currentLang();
    return { value: this.translate.instant('SUBCONTRACTING.ANALYSIS.CA_BASIS'), direction: 'neutral' as const };
  });

  /**
   * Margin can be negative, so its two tiles recolour together. Both branches are
   * complete literal classes — a runtime-assembled one is never emitted (§3).
   */
  readonly marginOptions = computed<MetricCardOptions>(() => {
    const negative = (this.margin()?.margeBrute ?? 0) < 0;
    return negative
      ? { icon: 'trending_down', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger' }
      : { icon: 'savings',       iconColor: 'text-teal',   iconBg: 'bg-teal/10',   valueColor: 'text-teal'   };
  });

  searchAffaires(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.searching.set(true);
    this.affaireSvc.getAffaires({ search: q, size: 8 }).subscribe({
      next: page => { this.searchResults.set(page.content); this.searching.set(false); },
      error:    () => this.searching.set(false),
    });
  }

  selectAffaire(a: AffaireListItem): void {
    this.selectedAffaire.set(a);
    this.searchResults.set([]);
    this.searchQuery.set(`${a.reference} — ${a.intitule}`);
    this.loadMargin(a.id);
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.margin.set(null);
  }

  loadMargin(affaireId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getMargin(affaireId).subscribe({
      next: m => { this.margin.set(m); this.loading.set(false); },
      error: () => {
        this.error.set(this.translate.instant('SUBCONTRACTING.ANALYSIS.ERROR'));
        this.loading.set(false);
      },
    });
  }

  barPct(value: number, total: number): number {
    if (!total) return 0;
    return Math.min(100, Math.max(0, (value / total) * 100));
  }

  fmtPct(v: number | null): string {
    if (v == null) return '—';
    return v.toFixed(2) + '%';
  }
}
