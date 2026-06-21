import {
  Component, OnInit, inject, signal, computed, DestroyRef,
} from '@angular/core';
import { CommonModule }       from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SupplierService }    from './supplier.service';
import { ClientService }      from '../clients/client.service';
import { PermissionDirective } from '../../shared/permission.directive';
import { SupplierDto, SupplierStatsDto, CreateSupplierRequest, PageResponse } from './supplier.model';
import { PaysRefDto } from '../affaires/affaire.model';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PermissionDirective],
  templateUrl: './supplier-list.component.html',
  styleUrl: './supplier-list.component.scss',
})
export class SupplierListComponent implements OnInit {
  private readonly svc        = inject(SupplierService);
  private readonly clientSvc  = inject(ClientService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly search$ = new Subject<string>();

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

  paysList        = signal<PaysRefDto[]>([]);
  showCreateForm  = signal(false);
  isSaving        = signal(false);
  saveError       = signal<string | null>(null);

  showToggleModal = signal(false);
  isToggling      = signal(false);

  createForm = new FormGroup({
    name:            new FormControl('', Validators.required),
    paysCode:        new FormControl('', Validators.required),
    paysLabel:       new FormControl(''),
    numeroTva:       new FormControl(''),
    iban:            new FormControl(''),
    tvaUniqueActive: new FormControl(false),
    notes:           new FormControl(''),
  });

  activePct = computed(() => {
    const s = this.stats();
    return s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;
  });

  ngOnInit(): void {
    this.clientSvc.getPays().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(list => this.paysList.set(list));

    this.clientSvc.getMyPays().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: id => {
        if (id && id > 0) {
          this.paysId.set(id);
          this.loadSuppliers();
          this.loadStats();
        }
      },
      error: () => { this.isLoading.set(false); },
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
      next:  r  => { this.suppliers.set(r);  this.isLoading.set(false); },
      error: () => this.isLoading.set(false),
    });
  }

  loadStats(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.svc.getStats(paysId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => this.stats.set(s));
  }

  onSearch(term: string): void {
    this.search$.next(term);
  }

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

  confirmToggle(): void {
    const s = this.selectedSupplier();
    if (!s || !s.isActive) return; // only deactivate is supported by backend
    this.isToggling.set(true);
    this.svc.deactivate(s.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.selectedSupplier.set({ ...s, isActive: false });
        this.showToggleModal.set(false);
        this.isToggling.set(false);
        this.loadSuppliers();
        this.loadStats();
      },
      error: () => this.isToggling.set(false),
    });
  }

  onPaysChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    const pays = this.paysList().find(p => p.isoCode === code);
    this.createForm.patchValue({ paysLabel: pays?.frenchLabel ?? '' });
  }

  saveNewSupplier(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const paysId = this.paysId();
    if (!paysId) {
      this.saveError.set('Pays introuvable. Rechargez la page.');
      return;
    }
    this.isSaving.set(true);
    this.saveError.set(null);
    const v = this.createForm.value;
    const dto: CreateSupplierRequest = {
      paysId,
      name:            v.name!,
      paysCode:        v.paysCode!,
      paysLabel:       v.paysLabel  || undefined,
      numeroTva:       v.numeroTva  || undefined,
      iban:            v.iban       || undefined,
      tvaUniqueActive: v.tvaUniqueActive ?? false,
      notes:           v.notes      || undefined,
    };
    this.svc.create(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => {
        this.isSaving.set(false);
        this.showCreateForm.set(false);
        this.createForm.reset({ tvaUniqueActive: false });
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

  goPage(delta: number): void {
    const page = this.suppliers();
    if (!page) return;
    const next = this.currentPage() + delta;
    if (next < 0 || next >= page.totalPages) return;
    this.currentPage.set(next);
    this.loadSuppliers();
  }
}
