import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, takeUntil } from 'rxjs';
import { ClientService } from '../client.service';
import { ClientListItemDto, ClientFilter } from '../client.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { PaysRefDto } from '../../affaires/affaire.model';
import { UserStore } from '../../../core/user.store';
import { CardComponent, PaginationComponent, ButtonComponent } from '@khalilrebhiitec/daf360';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-client-list',
  imports: [FormsModule, DecimalPipe, PermissionDirective,
            CardComponent, PaginationComponent, ButtonComponent, TranslatePipe],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss',
})
export class ClientListComponent implements OnInit, OnDestroy {
  private readonly svc            = inject(ClientService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly userStore      = inject(UserStore);
  private readonly destroy$       = new Subject<void>();
  private readonly search$        = new Subject<string>();

  readonly canViewAllClients = computed(() => this.userStore.hasPermission('FACT_VIEW_ALL_CLIENTS'));

  clients          = signal<ClientListItemDto[]>([]);
  loading          = signal(false);
  error            = signal<string | null>(null);
  totalElements    = signal(0);
  totalPages       = signal(0);
  currentPage      = signal(0);
  paysList         = signal<PaysRefDto[]>([]);
  sectors          = signal<string[]>([]);

  searchText      = '';
  filterPaysId    = 0;
  filterIsActive  : boolean | null = null;
  filterIsKycDone : boolean | null = null;
  filterSector    = '';

  readonly PAGE_SIZE = 20;

  readonly statsTotal   = computed(() => this.totalElements());
  readonly statsActive  = computed(() => this.clients().filter(c => c.isActive).length);
  readonly statsKycDone = computed(() => this.clients().filter(c => c.isKycDone).length);
  readonly statsTotalCA = computed(() =>
    this.clients().reduce((sum, c) => sum + (c.totalCA ?? 0), 0)
  );
  readonly statsKycPct  = computed(() => {
    const total = this.clients().length;
    return total === 0 ? 0 : Math.round((this.statsKycDone() / total) * 100);
  });

  readonly activeFilter = computed(() => {
    if (this.filterIsActive === true)  return 'active';
    if (this.filterIsActive === false) return 'pending';
    if (this.filterIsKycDone === true) return 'kyc';
    return 'all';
  });

  private readonly AVATAR_VARIANTS = ['primary', 'secondary', 'blue', 'tertiary', 'slate'] as const;

  avatarVariant(index: number): string {
    return this.AVATAR_VARIANTS[index % this.AVATAR_VARIANTS.length];
  }

  initials(name: string): string {
    return name.split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
  }

  ngOnInit(): void {
    // Data is no longer scoped by pays — always load the full client list.
    this.loadSectors();
    this.load();

    // Populate the country dropdown for display only; selecting a country no
    // longer filters the data (pays is ignored server-side).
    forkJoin({
      pays:     this.svc.getPays(),
      myPaysId: this.svc.getMyPays(),
    }).subscribe(({ pays, myPaysId }) => {
      this.paysList.set(pays);
      if (pays.length > 0) {
        const userPays = myPaysId != null
          ? (pays.find(p => p.id === myPaysId) ?? pays[0])
          : pays[0];
        this.filterPaysId = userPays.id;
      }
    });

    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.currentPage.set(0);
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: ClientFilter = {
      paysId:    this.filterPaysId || 0,
      page:      this.currentPage(),
      size:      this.PAGE_SIZE,
      search:    this.searchText.trim() || null,
      isActive:  this.filterIsActive,
      isKycDone: this.filterIsKycDone,
      sector:    this.filterSector || null,
    };
    this.svc.getClients(filter).subscribe({
      next: res => {
        this.clients.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les clients. Vérifiez votre connexion.');
        this.loading.set(false);
      },
    });
  }

  loadSectors(): void {
    this.svc.getSectors().subscribe(s => this.sectors.set(s));
  }

  onSearch(): void { this.search$.next(this.searchText); }

  onPaysChange(): void {
    this.currentPage.set(0);
    this.filterSector = '';
    this.loadSectors();
    this.load();
  }

  onFilterChange(): void {
    this.currentPage.set(0);
    this.load();
  }

  resetStatusFilter(): void {
    this.filterIsActive  = null;
    this.filterIsKycDone = null;
    this.onFilterChange();
  }

  toggleIsActive(val: boolean): void {
    this.filterIsKycDone = null;
    this.filterIsActive  = this.filterIsActive === val ? null : val;
    this.onFilterChange();
  }

  toggleIsKycDone(val: boolean): void {
    this.filterIsActive  = null;
    this.filterIsKycDone = this.filterIsKycDone === val ? null : val;
    this.onFilterChange();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.load();
  }

  goToNewClient(): void {
    this.router.navigate(['new'], { relativeTo: this.activatedRoute });
  }

  navigateToDetail(id: number): void { this.router.navigate([id], { relativeTo: this.activatedRoute }); }

  formatAmount(v: number | null, currency = 'TND'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  get pages(): number[] {
    const total = this.totalPages(), cur = this.currentPage();
    const start = Math.max(0, cur - 2), end = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}
