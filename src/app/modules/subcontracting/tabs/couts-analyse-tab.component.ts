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
import { ExportService } from '../../../core/export.service';

@Component({
  selector: 'app-couts-analyse-tab',
  imports: [
    TranslatePipe, ButtonComponent, CardComponent, MetricCardComponent,
    ProgressBarComponent, SkeletonComponent, DisplayCurrencyPipe,
  ],
  host: { class: 'block' },
  templateUrl: './couts-analyse-tab.component.html',
  providers: [DisplayCurrencyPipe],
})
export class CoutsAnalyseTabComponent {
  private readonly svc        = inject(SubcontractingService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly translate  = inject(TranslateService);
  private readonly displayCurrency = inject(DisplayCurrencyPipe);
  private readonly exportSvc  = inject(ExportService);

  /** Export Excel en cours — état de chargement du bouton, ignore un double clic. */
  readonly exporting = signal(false);

  /** Export Excel de la marge de l'affaire sélectionnée et de ses ordres ST. */
  exportExcel(): void {
    const affaire = this.selectedAffaire();
    if (!affaire || !this.margin()) return;
    this.exportSvc.download(this.exportSvc.margeSt(affaire.id),
      `Analyse_couts_${affaire.reference.replace(/[^\w.-]+/g, '_')}.xlsx`, this.exporting);
  }

  searchQuery     = signal('');
  searchResults   = signal<AffaireListItem[]>([]);
  searching       = signal(false);
  /** Une recherche a abouti : sert à dire « aucune affaire » quand la liste revient vide. */
  searched        = signal(false);
  selectedAffaire = signal<AffaireListItem | null>(null);

  margin  = signal<MarginDto | null>(null);
  loading = signal(false);
  error   = signal<string | null>(null);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiCa : MetricCardOptions = { icon: 'payments',  iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiSt : MetricCardOptions = { icon: 'handshake', iconColor: 'text-warning', iconBg: 'bg-warning/10' };
  readonly kpiInt: MetricCardOptions = { icon: 'schedule',  iconColor: 'text-tertiary', iconBg: 'bg-tertiary/10' };

  /**
   * `MarginDto.facture` est le HT des factures émises — la base de la marge. L'encaissé
   * (paiements reçus) n'est plus la base : il est rappelé sous la tuile, pour information.
   */
  readonly caDelta = computed(() => {
    this.translate.currentLang();
    const m = this.margin();
    const amount = m ? this.displayCurrency.transform(m.encaisse, m.currency) : '—';
    return { value: this.translate.instant('SUBCONTRACTING.ANALYSIS.CA_BASIS', { amount }), direction: 'neutral' as const };
  });

  /** Heures Timesheet derrière les coûts internes, sous la tuile. */
  readonly internalDelta = computed(() => {
    this.translate.currentLang();
    const hours = (this.margin()?.heuresInternes ?? 0).toLocaleString(this.translate.currentLang() || 'fr', { maximumFractionDigits: 2 });
    return { value: this.translate.instant('SUBCONTRACTING.ANALYSIS.INTERNAL_HOURS', { hours }), direction: 'neutral' as const };
  });

  unvaluedHours(m: { heuresNonValorisees: number }): string {
    return m.heuresNonValorisees.toLocaleString(this.translate.currentLang() || 'fr', { maximumFractionDigits: 2 });
  }

  /**
   * Margin can be negative, so its two tiles recolour together. Both branches are
   * complete literal classes — a runtime-assembled one is never emitted (§3).
   */
  readonly marginOptions = computed<MetricCardOptions>(() => {
    const negative = (this.margin()?.margeBrute ?? 0) < 0;
    return negative
      ? { icon: 'trending_down', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger' }
      // `trending_up` fait la paire avec `trending_down` de la branche négative — une marge
      // positive est une variation, pas une tirelire.
      : { icon: 'trending_up',   iconColor: 'text-teal',   iconBg: 'bg-teal/10',   valueColor: 'text-teal'   };
  });

  searchAffaires(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.searching.set(true);
    this.affaireSvc.getAffaires({ search: q, size: 8 }).subscribe({
      next: page => { this.searchResults.set(page.content); this.searching.set(false); this.searched.set(true); },
      error:    () => this.searching.set(false),
    });
  }

  selectAffaire(a: AffaireListItem): void {
    this.selectedAffaire.set(a);
    this.searchResults.set([]);
    this.searched.set(false);
    this.searchQuery.set(`${a.reference} — ${a.intitule}`);
    this.loadMargin(a.id);
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searched.set(false);
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
