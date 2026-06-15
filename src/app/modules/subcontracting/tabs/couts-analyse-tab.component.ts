import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AffaireService } from '../../affaires/affaire.service';
import { AffaireListItem } from '../../affaires/affaire.model';
import { SubcontractingService } from '../subcontracting.service';
import { MarginDto, fmtAmt } from '../subcontracting.model';

@Component({
  selector: 'app-couts-analyse-tab',
  imports: [FormsModule],
  templateUrl: './couts-analyse-tab.component.html',
  styleUrl: './couts-analyse-tab.component.scss',
})
export class CoutsAnalyseTabComponent {
  private readonly svc        = inject(SubcontractingService);
  private readonly affaireSvc = inject(AffaireService);

  searchQuery     = '';
  searchResults   = signal<AffaireListItem[]>([]);
  searching       = signal(false);
  selectedAffaire = signal<AffaireListItem | null>(null);

  margin  = signal<MarginDto | null>(null);
  loading = signal(false);
  error   = signal<string | null>(null);

  searchAffaires(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.searching.set(true);
    this.affaireSvc.getAffaires({ search: q, size: 8 }).subscribe({
      next: page => { this.searchResults.set(page.content); this.searching.set(false); },
      error: () => this.searching.set(false),
    });
  }

  onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.searchAffaires();
  }

  selectAffaire(a: AffaireListItem): void {
    this.selectedAffaire.set(a);
    this.searchResults.set([]);
    this.searchQuery = `${a.reference} — ${a.intitule}`;
    this.loadMargin(a.id);
  }

  clearAffaire(): void {
    this.selectedAffaire.set(null);
    this.searchQuery = '';
    this.searchResults.set([]);
    this.margin.set(null);
  }

  loadMargin(affaireId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getMargin(affaireId).subscribe({
      next: m => { this.margin.set(m); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger les données de marge.'); this.loading.set(false); },
    });
  }

  barPct(value: number, total: number): number {
    if (!total) return 0;
    return Math.min(100, Math.max(0, (value / total) * 100));
  }

  fmt(v: number | null, devise?: string): string {
    return fmtAmt(v, devise ?? 'TND');
  }

  fmtPct(v: number | null): string {
    if (v == null) return '—';
    return v.toFixed(2) + '%';
  }
}
