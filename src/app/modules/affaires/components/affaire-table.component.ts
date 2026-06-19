import { Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { AffaireListItem, STATUT_LABELS, TYPE_LABELS } from '../affaire.model';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-affaire-table',
  imports: [FormsModule, UpperCasePipe, StatusBadgeComponent],
  templateUrl: './affaire-table.component.html',
  styleUrl: './affaire-table.component.scss',
})
export class AffaireTableComponent {
  affaires      = input.required<AffaireListItem[]>();
  loading       = input(false);
  error         = input<string | null>(null);
  deletingId    = input<number | null>(null);
  totalElements = input(0);
  currentPage   = input(0);
  totalPages    = input(0);

  searchText   = model('');
  filterStatut = model('');
  filterType   = model('');

  readonly rowClick    = output<number>();
  readonly deleteClick = output<{ affaire: AffaireListItem; event: MouseEvent }>();
  readonly pageChange  = output<number>();
  readonly searchGo    = output<void>();
  readonly filterGo    = output<void>();

  readonly statutOptions = Object.entries(STATUT_LABELS).map(([k, v]) => ({ value: k, label: v }));
  readonly typeOptions   = Object.entries(TYPE_LABELS).map(([k, v])   => ({ value: k, label: v }));

  readonly viewMode = signal<'table' | 'card'>('table');

  readonly statsEnCours  = computed(() => this.affaires().filter(a => a.statut === 'EN_COURS').length);
  readonly statsSuspendu = computed(() => this.affaires().filter(a => a.statut === 'SUSPENDUE').length);

  get pages(): number[] {
    const total = this.totalPages();
    const cur   = this.currentPage();
    const start = Math.max(0, cur - 2);
    const end   = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  typeLabel(type: string): string { return TYPE_LABELS[type] ?? type; }

  initials(name: string | null): string {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  formatAmount(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v);
  }

  rafColor(a: AffaireListItem): string {
    if (!a.budgetPrevisionnel || a.rafDisponible == null) return '#757684';
    const pct = (a.rafDisponible / a.budgetPrevisionnel) * 100;
    if (pct > 20) return '#006c49';
    if (pct > a.rafAlerteSeuilPct) return '#f59e0b';
    return '#ba1a1a';
  }

  budgetIcon(a: AffaireListItem): string {
    if (a.budgetValide) return 'check_circle';
    if (!a.budgetPrevisionnel) return 'schedule';
    return 'warning';
  }

  budgetIconColor(a: AffaireListItem): string {
    if (a.budgetValide) return '#006c49';
    if (!a.budgetPrevisionnel) return '#757684';
    return '#f59e0b';
  }
}
