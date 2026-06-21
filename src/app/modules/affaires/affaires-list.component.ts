import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AffaireService } from './affaire.service';
import { AffaireListItem, AffaireFilter, TYPE_LABELS, STATUT_LABELS } from './affaire.model';
import { PermissionDirective } from '../../shared/permission.directive';
import { AffaireKpiCardComponent } from './components/affaire-kpi-card.component';
import { AffaireTableComponent } from './components/affaire-table.component';

@Component({
  selector: 'app-affaires-list',
  imports: [PermissionDirective, AffaireKpiCardComponent, AffaireTableComponent],
  templateUrl: './affaires-list.component.html',
  styleUrl: './affaires-list.component.scss',
})
export class AffairesListComponent implements OnInit {
  private readonly svc            = inject(AffaireService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);

  affaires      = signal<AffaireListItem[]>([]);
  loading       = signal(false);
  error         = signal<string | null>(null);
  deletingId    = signal<number | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);

  searchText   = '';
  filterStatut = '';
  filterType   = '';

  readonly PAGE_SIZE = 20;

  readonly statsActives     = computed(() => this.affaires().filter(a => a.statut === 'EN_COURS').length);
  readonly statsSuspendu    = computed(() => this.affaires().filter(a => a.statut === 'SUSPENDUE').length);
  readonly statsRafTotal    = computed(() => this.affaires().reduce((s, a) => s + (a.rafDisponible ?? 0), 0));
  readonly statsBudgetTotal = computed(() => this.affaires().reduce((s, a) => s + (a.budgetPrevisionnel ?? 0), 0));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: AffaireFilter = {
      page:   this.currentPage(),
      size:   this.PAGE_SIZE,
      search: this.searchText.trim()  || null,
      statut: this.filterStatut       || null,
      type:   this.filterType         || null,
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
    this.router.navigate([id], { relativeTo: this.activatedRoute });
  }

  openNewForm(): void {
    this.router.navigate(['new'], { relativeTo: this.activatedRoute });
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v);
  }
}
