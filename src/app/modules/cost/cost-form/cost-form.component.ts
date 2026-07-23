import {
  Component, OnInit, inject, signal, computed, DestroyRef,
} from '@angular/core';
import { CommonModule }         from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule }          from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed }   from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, lastValueFrom } from 'rxjs';
import { CostService }          from '../cost.service';
import { AffaireService }       from '../../affaires/affaire.service';
import type { AffaireListItem, PaysRefDto } from '../../affaires/affaire.model';
import {
  CostCategoryDto, CreateCostLineRequest,
  ListValueDto, ForexPreviewDto, CircuitPreviewDto,
  SupplierSearchItem, isManualSource, formatAmount,
} from '../cost.model';
import { SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-cost-form',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, TranslatePipe, SelectComponent, FormFieldComponent],
  templateUrl: './cost-form.component.html',
})
export class CostFormComponent implements OnInit {
  private readonly costSvc    = inject(CostService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate  = inject(TranslateService);

  editId     = signal<number | null>(null);
  isEditMode = computed(() => this.editId() !== null);

  paysList   = signal<PaysRefDto[]>([]);
  categories = signal<CostCategoryDto[]>([]);
  currencies = signal<ListValueDto[]>([]);
  costTypes  = signal<ListValueDto[]>([]);
  affaires   = signal<AffaireListItem[]>([]);
  suppliers  = signal<SupplierSearchItem[]>([]);

  paysId           = signal<number | null>(null);
  categoryId       = signal<number | null>(null);
  transactionDate  = signal<string>('');
  description      = signal<string>('');
  netAmountLocal   = signal<number | null>(null);
  currencyId       = signal<number | null>(null);
  supplierId       = signal<number | null>(null);
  supplierNameFree = signal<string>('');
  supplierQuery    = signal<string>('');
  useSupplierDb    = signal<boolean>(false);
  affaireId        = signal<number | null>(null);
  notes            = signal<string>('');
  costTypeId       = signal<number | null>(null);

  forexPreview    = signal<ForexPreviewDto | null>(null);
  circuitPreview  = signal<CircuitPreviewDto | null>(null);
  previewLoading  = signal<boolean>(false);
  isPageLoading   = signal<boolean>(false);
  isSaving        = signal<boolean>(false);
  error           = signal<string | null>(null);
  pendingFiles    = signal<File[]>([]);

  private readonly supplierSearch$ = new Subject<string>();

  filteredCategories = computed(() => this.categories().filter(c => isManualSource(c)));

  // ── daf-select option lists ─────────────────────────────────────────────────
  paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` }))
  );
  categoryOptions = computed<SelectOption[]>(() =>
    this.filteredCategories().map(c => ({ value: String(c.id), label: c.labelFr }))
  );
  currencyOptions = computed<SelectOption[]>(() =>
    this.currencies().map(c => ({ value: String(c.id), label: `${c.code} — ${c.labelFr}` }))
  );
  affaireOptions = computed<SelectOption[]>(() =>
    this.affaires().map(a => ({ value: String(a.id), label: `${a.reference} — ${a.intitule}` }))
  );
  costTypeOptions = computed<SelectOption[]>(() =>
    this.costTypes().map(t => ({ value: String(t.id), label: t.labelFr }))
  );

  /** Wrap a numeric id into the string[] shape daf-select's `selected` expects. */
  selArr(id: number | null): string[] { return [id !== null ? String(id) : '']; }

  selectedCurrencyCode = computed(() =>
    this.currencies().find(c => c.id === this.currencyId())?.code ?? null
  );

  canSave = computed(() =>
    !!this.paysId() &&
    !!this.categoryId() &&
    !!this.transactionDate() &&
    this.description().trim().length > 0 &&
    (this.netAmountLocal() ?? 0) > 0 &&
    !!this.currencyId()
  );

  readonly formatAmt = formatAmount;

  ngOnInit(): void {
    const idStr = this.route.snapshot.paramMap.get('id');
    if (idStr) {
      this.editId.set(+idStr);
      this.loadExisting(+idStr);
    } else {
      this.transactionDate.set(new Date().toISOString().slice(0, 10));
    }

    this.affaireSvc.getPays()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.paysList.set(list));

    this.supplierSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        const pid = this.paysId();
        if (!pid || q.length < 2) return of([] as SupplierSearchItem[]);
        return this.costSvc.searchSuppliers(pid, q);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(list => this.suppliers.set(list));
  }

  private loadExisting(id: number): void {
    this.isPageLoading.set(true);
    this.costSvc.getCostLine(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: line => {
        this.isPageLoading.set(false);
        if (line.paysId) this.onPaysChange(line.paysId);
        if (line.transactionDate) this.transactionDate.set(line.transactionDate.slice(0, 10));
        this.description.set(line.label ?? '');
        this.categoryId.set(line.categoryId);
        this.netAmountLocal.set(line.netAmountLocal);
        this.currencyId.set(line.currencyId);
        this.supplierId.set(line.supplierId);
        this.supplierNameFree.set(line.supplierNameFree ?? '');
        this.affaireId.set(line.affaireId);
        this.notes.set(line.notes ?? '');
        this.costTypeId.set(line.costTypeId);
      },
      error: () => {
        this.isPageLoading.set(false);
        this.error.set(this.translate.instant('COST.FORM.LOAD_ERROR'));
      },
    });
  }

  onPaysChange(id: number | null): void {
    const pid = id ? Number(id) : null;
    this.paysId.set(pid);
    if (!pid) { this.categories.set([]); return; }

    this.costSvc.getCategories(pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(c => this.categories.set(c));
    this.costSvc.getListValues('CURRENCY', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => this.currencies.set(v));
    this.costSvc.getListValues('COST_TYPE', pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => this.costTypes.set(v));
    this.affaireSvc.getAffaires({ paysId: pid, size: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(p => this.affaires.set(p.content));
  }

  onSupplierQueryChange(q: string): void {
    this.supplierQuery.set(q);
    if (!q) this.supplierId.set(null);
    this.supplierSearch$.next(q);
  }

  selectSupplier(s: SupplierSearchItem): void {
    this.supplierId.set(s.id);
    this.supplierQuery.set(s.name);
    this.suppliers.set([]);
  }

  onAmountOrCurrencyChange(): void {
    const amount = this.netAmountLocal();
    const currId = this.currencyId();
    const pid    = this.paysId();
    const catId  = this.categoryId();
    if (!amount || !currId || !pid) {
      this.forexPreview.set(null);
      this.circuitPreview.set(null);
      return;
    }
    const curr = this.currencies().find(c => c.id === currId);
    if (!curr) return;
    this.previewLoading.set(true);
    this.costSvc.getForexPreview(amount, curr.code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: fx => {
        this.forexPreview.set(fx);
        this.costSvc.getCircuitPreview(fx.montantEur, pid, catId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: cp => { this.circuitPreview.set(cp); this.previewLoading.set(false); },
          error: ()  => this.previewLoading.set(false),
        });
      },
      error: () => { this.forexPreview.set(null); this.previewLoading.set(false); },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const added = Array.from(input.files).filter(f => f.size <= 10 * 1024 * 1024);
    this.pendingFiles.update(prev => [...prev, ...added]);
    input.value = '';
  }

  removeFile(i: number): void {
    this.pendingFiles.update(prev => prev.filter((_, idx) => idx !== i));
  }

  saveDraft(): void { this.doSave(false); }
  submitLine(): void { this.doSave(true); }

  private doSave(submit: boolean): void {
    if (!this.canSave()) return;
    const date = this.transactionDate();
    const [year, month] = date.split('-').map(Number);
    const req: CreateCostLineRequest = {
      paysId:           this.paysId()!,
      categoryId:       this.categoryId()!,
      transactionDate:  date,
      periodYear:       year,
      periodMonth:      month,
      description:      this.description().trim(),
      netAmountLocal:   this.netAmountLocal()!,
      currencyId:       this.currencyId()!,
      supplierId:       this.supplierId() ?? undefined,
      supplierNameFree: this.supplierNameFree() || undefined,
      affaireId:        this.affaireId() ?? undefined,
      notes:            this.notes() || undefined,
      costTypeId:       this.costTypeId() ?? undefined,
    };

    this.isSaving.set(true);
    this.error.set(null);

    const save$ = this.editId()
      ? this.costSvc.updateCostLine(this.editId()!, req)
      : this.costSvc.createCostLine(req);

    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: line => {
        const uploads = this.pendingFiles().map(f =>
          lastValueFrom(this.costSvc.addAttachment(line.id, f)).catch(() => null)
        );
        Promise.all(uploads).then(() => {
          this.pendingFiles.set([]);
          if (submit) {
            this.costSvc.submitCostLine(line.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
              next:  () => { this.isSaving.set(false); this.router.navigate(this.isEditMode() ? ['../..'] : ['..'], { relativeTo: this.route }); },
              error: err => { this.isSaving.set(false); this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.SUBMIT_ERROR')); },
            });
          } else {
            this.isSaving.set(false);
            this.router.navigate(this.isEditMode() ? ['../..'] : ['..'], { relativeTo: this.route });
          }
        });
      },
      error: err => {
        this.isSaving.set(false);
        this.error.set(err.error?.message ?? this.translate.instant('COST.FORM.GENERIC_ERROR'));
      },
    });
  }

  fmtFileSize(bytes: number): string {
    if (bytes < 1024)     return this.translate.instant('COST.FORM.UNIT_BYTES', { n: bytes });
    if (bytes < 1048576)  return this.translate.instant('COST.FORM.UNIT_KB', { n: (bytes / 1024).toFixed(1) });
    return this.translate.instant('COST.FORM.UNIT_MB', { n: (bytes / 1048576).toFixed(1) });
  }

  levelBg(level: string): string {
    return ({ L1: '#f1f5f9', L2: '#dbeafe', L3: '#fef3c7', L4: '#ffdad6' } as Record<string, string>)[level] ?? '#f1f5f9';
  }

  levelColor(level: string): string {
    return ({ L1: '#475569', L2: '#1d4ed8', L3: '#92400e', L4: '#ba1a1a' } as Record<string, string>)[level] ?? '#475569';
  }
}
