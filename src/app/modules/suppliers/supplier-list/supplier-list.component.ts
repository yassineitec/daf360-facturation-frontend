import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FieldMessageComponent, MetricCardComponent, MetricCardOptions,
  MetricDelta, PageComponent, PageHeaderComponent, PaginationComponent,
  SearchToolbarComponent, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { SupplierService } from '../supplier.service';
import { ClientService } from '../../clients/client.service';
import { SupplierDto, SupplierStatsDto } from '../supplier.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { SuppliersCardsSectionComponent } from './suppliers-cards-section.component';
import { SuppliersTableSectionComponent } from './suppliers-table-section.component';

type ViewMode = 'grid' | 'list';

/**
 * Liste des fournisseurs, refondue sur le squelette des autres listes finance.
 *
 * Ce qui a disparu :
 * - le **panneau scindé** (table à gauche, fiche à droite). Une fiche coincée dans un
 *   tiers de page ne pouvait ni respirer ni s'ouvrir en propre : elle vit maintenant à
 *   `/finance/suppliers/:id`, comme les fiches facture, client et recouvrement.
 * - la **liste mobile dupliquée** (`.mob-list` / `.mob-row`), qui redessinait chaque
 *   fournisseur dans un second balisage sous 640 px, avec ses propres couleurs de
 *   statut — la vue cartes remplit ce rôle à toutes les largeurs.
 * - la **barre d'outils mobile maison** (`matchMedia`, `mobileSearchOpen`, trois
 *   boutons icône) : `daf-search-toolbar` est déjà responsive.
 * - la **modale de création en ligne** (`createTpl` et ses sept signaux `create*`),
 *   morte depuis que `openCreateModal()` navigue vers l'assistant `/new`.
 * - les 244 lignes de SCSS et l'en-tête maison à icône (`daf-page-header` n'en prend
 *   pas, par principe — cf. 4.11.0).
 *
 * Ce qui reste ici : la requête, la recherche et la pagination. Les deux vues sont des
 * composants sans état (UI-PLAYBOOK §8b).
 */
@Component({
  selector: 'app-supplier-list',
  imports: [
    TranslatePipe, PermissionDirective,
    PageComponent, PageHeaderComponent, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, PaginationComponent, FieldMessageComponent,
    SuppliersCardsSectionComponent, SuppliersTableSectionComponent,
  ],
  host: { class: 'block' },
  templateUrl: './supplier-list.component.html',
})
export class SupplierListComponent implements OnInit {
  private readonly svc        = inject(SupplierService);
  private readonly clientSvc  = inject(ClientService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly translate  = inject(TranslateService);

  paysId = signal(0);

  suppliers = signal<SupplierDto[]>([]);
  stats     = signal<SupplierStatsDto>({ total: 0, withIban: 0, withTva: 0, countries: 0 });
  error     = signal<string | null>(null);

  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  pageSize      = signal(20);

  /** `firstLoad` pilote le squelette de page entière, `loading` seulement la section (§5). */
  firstLoad = signal(true);
  loading   = signal(false);

  searchText = signal('');
  viewMode   = signal<ViewMode>('grid');

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  /**
   * Classes Tailwind littérales et complètes sur des jetons de la lib (UI-PLAYBOOK
   * §3/§4). L'ancienne page passait par `app-affaire-kpi-card` et son `variant="green"` /
   * `"red"`, une échelle de couleurs propre au module affaires que rien d'autre en
   * finance ne parle.
   */
  readonly kpiTotal     : MetricCardOptions = { icon: 'storefront',      iconColor: 'text-primary',   iconBg: 'bg-primary/10'   };
  readonly kpiIban      : MetricCardOptions = { icon: 'account_balance', iconColor: 'text-teal',      iconBg: 'bg-teal/10'      };
  readonly kpiTva       : MetricCardOptions = { icon: 'receipt_long',    iconColor: 'text-secondary', iconBg: 'bg-secondary/10' };
  readonly kpiCountries : MetricCardOptions = { icon: 'public',          iconColor: 'text-tertiary',  iconBg: 'bg-tertiary/10'  };

  /** Part des fournisseurs actifs disposant d'un IBAN — leur seule condition de paiement. */
  readonly ibanPct = computed(() => {
    const s = this.stats();
    return s.total > 0 ? Math.round((s.withIban / s.total) * 100) : 0;
  });

  readonly tvaPct = computed(() => {
    const s = this.stats();
    return s.total > 0 ? Math.round((s.withTva / s.total) * 100) : 0;
  });

  private pctDelta(pct: number): MetricDelta | null {
    this.translate.currentLang();
    if (!this.stats().total) return null;
    return {
      value: this.translate.instant('SUPPLIERS.LIST.KPI.PCT_OF_BASE', { pct }),
      // Une complétude partielle n'est pas une bonne nouvelle : au-dessous de 100 %, il
      // manque quelque chose pour payer ou pour déclarer.
      direction: pct >= 100 ? 'up' : 'down',
    };
  }

  readonly ibanDelta = computed<MetricDelta | null>(() => this.pctDelta(this.ibanPct()));
  readonly tvaDelta  = computed<MetricDelta | null>(() => this.pctDelta(this.tvaPct()));

  /**
   * Les tuiles viennent de `GET /suppliers?paysId=`, qui ne renvoie **que les actifs** —
   * elles décrivent donc le référentiel utilisable, pas la page affichée ni le total
   * historique. Le delta de la première tuile le dit, sinon on lit « 42 fournisseurs »
   * comme un total.
   */
  readonly scopeDelta = computed<MetricDelta | null>(() => {
    this.translate.currentLang();
    return { value: this.translate.instant('SUPPLIERS.LIST.KPI.SCOPE_ACTIVE'), direction: 'neutral' };
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('SUPPLIERS.LIST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('SUPPLIERS.LIST.VIEW_LIST') },
    ];
  });

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.clientSvc.getMyPays().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: id => {
        if (id && id > 0) {
          this.paysId.set(id);
          this.loadSuppliers();
          this.loadStats();
        } else {
          this.firstLoad.set(false);
          this.error.set(this.translate.instant('SUPPLIERS.LIST.ERROR_PAYS'));
        }
      },
      error: () => {
        this.firstLoad.set(false);
        this.error.set(this.translate.instant('SUPPLIERS.LIST.ERROR_PAYS'));
      },
    });
  }

  loadSuppliers(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.loading.set(true);
    this.error.set(null);
    this.svc.getSuppliers({
      paysId,
      search: this.searchText().trim() || undefined,
      page:   this.currentPage(),
      size:   this.pageSize(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.suppliers.set(r.content);
        this.totalElements.set(r.totalElements);
        this.totalPages.set(r.totalPages);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('SUPPLIERS.LIST.ERROR_LOAD'));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  loadStats(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.svc.getStats(paysId).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => this.stats.set(s));
  }

  /**
   * Recherche côté serveur : `GET /suppliers/search` prend `q`. L'anti-rebond est celui
   * de `daf-search-toolbar` — le `Subject` + `debounceTime` + `distinctUntilChanged`
   * qu'on tenait à la main faisait exactement cela.
   */
  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(0);
    this.loadSuppliers();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.loadSuppliers();
  }

  /** `pageSizeChange` arrive seul — la page décide de revenir à la première (§7). */
  onPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(0);
    this.loadSuppliers();
  }

  navigateToDetail(id: number): void {
    this.router.navigate([id], { relativeTo: this.route });
  }

  goToNewSupplier(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }
}
