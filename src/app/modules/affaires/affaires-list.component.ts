import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AffaireService } from './affaire.service';
import { AffaireListItem, AffaireFilter, TYPE_LABELS, STATUT_LABELS } from './affaire.model';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { PermissionDirective } from '../../shared/permission.directive';
import { AffaireFormComponent } from './affaire-form.component';

@Component({
  selector: 'app-affaires-list',
  imports: [FormsModule, StatusBadgeComponent, PermissionDirective, AffaireFormComponent],
  templateUrl: './affaires-list.component.html',
  styleUrl: './affaires-list.component.scss',
})
export class AffairesListComponent implements OnInit {
  private readonly svc    = inject(AffaireService);
  private readonly router = inject(Router);

  affaires       = signal<AffaireListItem[]>([]);
  loading        = signal(false);
  error          = signal<string | null>(null);
  totalElements  = signal(0);
  totalPages     = signal(0);
  currentPage    = signal(0);
  showForm       = signal(false);

  // filter model bound with ngModel
  searchText  = '';
  filterStatut = '';
  filterType   = '';
  readonly PAGE_SIZE = 20;

  readonly typeOptions  = Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }));
  readonly statutOptions = Object.entries(STATUT_LABELS).map(([k, v]) => ({ value: k, label: v }));

  // Computed stats from current page data
  readonly statsActives = computed(() => this.affaires().filter(a => a.statut === 'EN_COURS').length);
  readonly statsRafTotal = computed(() =>
    this.affaires().reduce((sum, a) => sum + (a.rafDisponible ?? 0), 0)
  );
  readonly statsBudgetTotal = computed(() =>
    this.affaires().reduce((sum, a) => sum + (a.budgetPrevisionnel ?? 0), 0)
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: AffaireFilter = {
      page: this.currentPage(),
      size: this.PAGE_SIZE,
      search: this.searchText.trim() || null,
      statut: this.filterStatut || null,
      type:   this.filterType   || null,
    };
    this.svc.getAffaires(filter).subscribe({
      next: res => {
        this.affaires.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les affaires. Vérifiez votre connexion.');
        this.loading.set(false);
      },
    });
  }

  onSearch(): void {
    this.currentPage.set(0);
    this.load();
  }

  onFilterChange(): void {
    this.currentPage.set(0);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.load();
  }

  navigateToDetail(id: number): void {
    this.router.navigate(['/fact/affaires', id]);
  }

  openNewForm(): void {
    this.showForm.set(true);
  }

  onFormClosed(saved: boolean): void {
    this.showForm.set(false);
    if (saved) this.load();
  }

  rafColor(a: AffaireListItem): string {
    if (!a.budgetPrevisionnel || a.rafDisponible === null) return '#94a3b8';
    const pct = (a.rafDisponible / a.budgetPrevisionnel) * 100;
    if (pct > 20) return '#1a6b7c';
    if (pct > a.seuilAlertePct) return '#f59e0b';
    return '#dc2626';
  }

  typeLabel(type: string): string { return TYPE_LABELS[type] ?? type; }
  statutLabel(s: string): string { return STATUT_LABELS[s] ?? s; }

  formatAmount(v: number | null, devise = 'TND'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  get pages(): number[] {
    const total = this.totalPages();
    const cur   = this.currentPage();
    const start = Math.max(0, cur - 2);
    const end   = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}
