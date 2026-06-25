import {
  Component, OnInit, inject, signal, computed, DestroyRef,
  ViewChild, TemplateRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SupplierService }   from './supplier.service';
import { ClientService }     from '../clients/client.service';
import { PermissionDirective } from '../../shared/permission.directive';
import { SupplierDto, SupplierStatsDto, CreateSupplierRequest, PageResponse } from './supplier.model';
import { PaysRefDto } from '../affaires/affaire.model';
import {
  MetricCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
  PaginationComponent,
  ToolbarComponent, ToolbarAction,
  StatusBadgeComponent as DafBadgeComponent, BadgeOptions,
  CardComponent,
  FormFieldComponent,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [
    PermissionDirective,
    MetricCardComponent, DataTableComponent, DafCellDirective,
    PaginationComponent, ToolbarComponent,
    DafBadgeComponent, CardComponent, FormFieldComponent,
  ],
  templateUrl: './supplier-list.component.html',
  styleUrl:    './supplier-list.component.scss',
})
export class SupplierListComponent implements OnInit {
  private readonly svc        = inject(SupplierService);
  private readonly clientSvc  = inject(ClientService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modal      = inject(ModalService);

  private readonly search$ = new Subject<string>();

  @ViewChild('createTpl') createTpl!: TemplateRef<any>;
  @ViewChild('toggleTpl') toggleTpl!: TemplateRef<any>;
  private createRef: ModalRef | null = null;
  private toggleRef: ModalRef | null = null;

  paysId           = signal<number>(0);
  suppliers        = signal<PageResponse<SupplierDto> | null>(null);
  selectedSupplier = signal<SupplierDto | null>(null);
  isLoading        = signal(true);
  searchTerm       = signal('');
  currentPage      = signal(0);
  stats            = signal<SupplierStatsDto>({ total: 0, active: 0, pendingValidation: 0 });

  ibanRevealed    = signal(false);
  ibanRaw         = signal<string | null>(null);
  isRevealLoading = signal(false);

  paysList   = signal<PaysRefDto[]>([]);
  isSaving   = signal(false);
  saveError  = signal<string | null>(null);
  isToggling = signal(false);

  // Create form signals
  createName            = signal<string | number | null>('');
  createPaysCode        = signal('');
  createPaysLabel       = signal('');
  createNumeroTva       = signal<string | number | null>('');
  createIban            = signal<string | number | null>('');
  createTvaUniqueActive = signal(false);
  createNotes           = signal<string | number | null>('');
  createTouched         = signal(false);

  readonly activePct = computed(() => {
    const s = this.stats();
    return s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;
  });

  readonly totalPagesCount = computed(() => this.suppliers()?.totalPages ?? 0);

  readonly tableColumns: TableColumn[] = [
    { key: 'code',   label: 'Code',   type: 'custom' },
    { key: 'name',   label: 'Nom',    type: 'custom' },
    { key: 'pays',   label: 'Pays',   type: 'text' },
    { key: 'tva',    label: 'N° TVA', type: 'custom' },
    { key: 'statut', label: 'Statut', type: 'custom', align: 'center' },
  ];

  readonly tableRows = computed(() =>
    (this.suppliers()?.content ?? []).map(s => ({
      id:     s.id,
      code:   s.code ?? s.supplierCode ?? '—',
      name:   s.name,
      pays:   s.paysLabel ?? s.paysCode ?? '—',
      tva:    s.numeroTva ?? null,
      statut: s.isActive,
      _raw:   s,
    }))
  );

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.isLoading(),
    emptyMessage: 'Aucun fournisseur trouvé.',
    skeletonRows: 5,
  }));

  readonly toolbarActions: ToolbarAction[] = [
    { id: 'new', label: 'Nouveau Fournisseur', icon: 'add', position: 'right', variant: 'primary' },
  ];

  ngOnInit(): void {
    this.clientSvc.getPays().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.paysList.set(list));

    this.clientSvc.getMyPays().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: id => {
        if (id && id > 0) {
          this.paysId.set(id);
          this.loadSuppliers();
          this.loadStats();
        }
      },
      error: () => this.isLoading.set(false),
    });

    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(term => {
      this.searchTerm.set(term);
      this.currentPage.set(0);
      this.loadSuppliers();
    });
  }

  loadSuppliers(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.isLoading.set(true);
    this.svc.getSuppliers({
      paysId,
      search: this.searchTerm() || undefined,
      page:   this.currentPage(),
      size:   20,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:  r  => { this.suppliers.set(r); this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  loadStats(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.svc.getStats(paysId).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => this.stats.set(s));
  }

  onSearch(term: string): void { this.search$.next(term); }

  onRowClick(row: TableRow): void { this.selectSupplier(row['_raw'] as SupplierDto); }

  onToolbarAction(id: string): void { if (id === 'new') this.openCreateModal(); }

  selectSupplier(s: SupplierDto): void {
    this.selectedSupplier.set(s);
    this.ibanRevealed.set(false);
    this.ibanRaw.set(null);
  }

  revealIban(): void {
    const s = this.selectedSupplier();
    if (!s) return;
    this.isRevealLoading.set(true);
    this.svc.revealIban(s.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:  r  => { this.ibanRaw.set(r.iban); this.ibanRevealed.set(true); this.isRevealLoading.set(false); },
      error: () => this.isRevealLoading.set(false),
    });
  }

  hideIban(): void {
    this.ibanRevealed.set(false);
    this.ibanRaw.set(null);
  }

  openToggleModal(): void {
    const s = this.selectedSupplier();
    if (!s) return;
    this.toggleRef = this.modal.open({
      title:           s.isActive ? 'Désactiver le fournisseur' : 'Réactiver le fournisseur',
      body:            this.toggleTpl,
      size:            'sm',
      closeOnBackdrop: true,
      buttons: [
        { label: 'Annuler',   variant: 'secondary', action: r => r.close() },
        { label: 'Confirmer', variant: 'primary', action: _r => this.confirmToggle() },
      ],
    });
  }

  confirmToggle(): void {
    const s = this.selectedSupplier();
    if (!s || !s.isActive) return;
    this.isToggling.set(true);
    this.svc.deactivate(s.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.selectedSupplier.set({ ...s, isActive: false });
        this.toggleRef?.close();
        this.isToggling.set(false);
        this.loadSuppliers();
        this.loadStats();
      },
      error: () => this.isToggling.set(false),
    });
  }

  openCreateModal(): void {
    this.resetCreateForm();
    this.createRef = this.modal.open({
      title:           'Nouveau fournisseur',
      body:            this.createTpl,
      size:            'lg',
      closeOnBackdrop: false,
      buttons: [
        { label: 'Annuler',              variant: 'secondary', action: r  => { r.close(); this.resetCreateForm(); } },
        { label: 'Créer le fournisseur', variant: 'primary',   action: _r => this.saveNewSupplier() },
      ],
    });
  }

  onPaysChange(event: Event): void {
    this.onPaysCodeChange((event.target as HTMLSelectElement).value);
  }

  onPaysCodeChange(code: string): void {
    this.createPaysCode.set(code);
    const pays = this.paysList().find(p => p.isoCode === code);
    this.createPaysLabel.set(pays?.frenchLabel ?? '');
  }

  onTvaUniqueChange(event: Event): void {
    this.createTvaUniqueActive.set((event.target as HTMLInputElement).checked);
  }

  saveNewSupplier(): void {
    this.createTouched.set(true);
    if (!this.createName() || !this.createPaysCode()) return;
    const paysId = this.paysId();
    if (!paysId) { this.saveError.set('Pays introuvable. Rechargez la page.'); return; }
    this.isSaving.set(true);
    this.saveError.set(null);
    const dto: CreateSupplierRequest = {
      paysId,
      name:            String(this.createName()),
      paysCode:        this.createPaysCode(),
      paysLabel:       this.createPaysLabel()  || undefined,
      numeroTva:       this.createNumeroTva()  ? String(this.createNumeroTva())  : undefined,
      iban:            this.createIban()       ? String(this.createIban())       : undefined,
      tvaUniqueActive: this.createTvaUniqueActive(),
      notes:           this.createNotes()      ? String(this.createNotes())      : undefined,
    };
    this.svc.create(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => {
        this.isSaving.set(false);
        this.createRef?.close();
        this.resetCreateForm();
        this.loadSuppliers();
        this.loadStats();
        this.selectSupplier(s);
      },
      error: err => {
        this.isSaving.set(false);
        this.saveError.set(err.error?.message ?? 'Erreur lors de la création.');
      },
    });
  }

  private resetCreateForm(): void {
    this.createName.set('');
    this.createPaysCode.set('');
    this.createPaysLabel.set('');
    this.createNumeroTva.set('');
    this.createIban.set('');
    this.createTvaUniqueActive.set(false);
    this.createNotes.set('');
    this.createTouched.set(false);
    this.saveError.set(null);
  }

  goPage(p: number): void {
    const page = this.suppliers();
    if (!page) return;
    if (p < 0 || p >= page.totalPages) return;
    this.currentPage.set(p);
    this.loadSuppliers();
  }

  activeBadgeOptions(isActive: boolean): BadgeOptions {
    return { variant: isActive ? 'success' : 'danger', pill: true };
  }
}
