import {
  Component, EventEmitter, Input, OnInit, Output, inject, signal,
} from '@angular/core';
import {
  FormControl, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { FactListService }   from '../../../core/fact-list.service';
import { CostService }       from '../cost.service';
import {
  CostCategoryDto, CostApprovalThresholdDto, CostLineDto,
  CreateCostLineRequest, ListValueDto,
  isManualSource, isCategoryStrictScrutiny,
} from '../cost.model';

@Component({
  selector: 'app-cost-line-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './cost-line-form.component.html',
  styleUrl: './cost-line-form.component.scss',
})
export class CostLineFormComponent implements OnInit {
  @Input() costLine?: CostLineDto;
  @Input() paysId!: number;
  @Output() saved  = new EventEmitter<CostLineDto>();
  @Output() closed = new EventEmitter<void>();

  private readonly svc          = inject(CostService);
  private readonly factListSvc  = inject(FactListService);

  categories    = signal<CostCategoryDto[]>([]);
  thresholds    = signal<CostApprovalThresholdDto[]>([]);
  currencies    = signal<ListValueDto[]>([]);
  costTypes     = signal<ListValueDto[]>([]);
  paymentMethods = signal<ListValueDto[]>([]);
  recurrenceFreqs = signal<ListValueDto[]>([]);
  isSaving      = signal(false);
  serverError   = signal<string | null>(null);
  approvalPreview = signal<string | null>(null);

  form = new FormGroup({
    categoryId:           new FormControl<number | null>(null, Validators.required),
    transactionDate:      new FormControl<string>('',   Validators.required),
    periodYear:           new FormControl<number | null>(null),
    periodMonth:          new FormControl<number | null>(null),
    description:          new FormControl<string>('',   [Validators.required, Validators.minLength(3), Validators.maxLength(500)]),
    costTypeId:           new FormControl<number | null>(null),
    netAmountLocal:       new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vatAmountLocal:       new FormControl<number>(0),
    currencyId:           new FormControl<number | null>(null, Validators.required),
    paymentMethodId:      new FormControl<number | null>(null),
    supplierNameFree:     new FormControl<string>(''),
    documentUrl:          new FormControl<string>(''),
    notes:                new FormControl<string>(''),
    isRecurring:          new FormControl<boolean>(false),
    recurrenceFrequencyId: new FormControl<number | null>(null),
  });

  ngOnInit(): void {
    this.factListSvc.getListValues('CURRENCY',             this.paysId).subscribe(v => this.currencies.set(v));
    this.factListSvc.getListValues('COST_TYPE',            this.paysId).subscribe(v => this.costTypes.set(v));
    this.factListSvc.getListValues('PAYMENT_METHOD',       this.paysId).subscribe(v => this.paymentMethods.set(v));
    this.factListSvc.getListValues('RECURRENCE_FREQUENCY', this.paysId).subscribe(v => this.recurrenceFreqs.set(v));

    this.svc.getCategories(this.paysId).subscribe(cats =>
      this.categories.set(cats.filter(c => c.isActive)),
    );
    this.svc.getThresholds(this.paysId).subscribe(t => this.thresholds.set(t));

    if (this.costLine) {
      this.form.patchValue({
        categoryId:           this.costLine.categoryId,
        transactionDate:      this.costLine.transactionDate ?? '',
        description:          this.costLine.label ?? '',
        netAmountLocal:       this.costLine.netAmountLocal,
        vatAmountLocal:       this.costLine.vatAmountLocal ?? 0,
        currencyId:           this.costLine.currencyId,
        costTypeId:           this.costLine.costTypeId,
        paymentMethodId:      this.costLine.paymentMethodId,
        supplierNameFree:     this.costLine.supplierNameFree ?? '',
        documentUrl:          this.costLine.documentUrl ?? '',
        notes:                this.costLine.notes ?? '',
        isRecurring:          this.costLine.recurrenceFlag ?? false,
        recurrenceFrequencyId: this.costLine.recurrenceFrequencyId,
      });
      if (this.costLine.transactionDate) {
        const d = new Date(this.costLine.transactionDate);
        this.form.patchValue({ periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 }, { emitEvent: false });
      }
    }

    this.form.get('transactionDate')!.valueChanges.subscribe(date => {
      if (date) {
        const d = new Date(date);
        this.form.patchValue({ periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 }, { emitEvent: false });
      }
    });

    this.form.get('netAmountLocal')!.valueChanges
      .pipe(debounceTime(300))
      .subscribe(amount => this.updateApprovalPreview(amount));

    this.form.get('categoryId')!.valueChanges.subscribe(() =>
      this.updateApprovalPreview(this.form.get('netAmountLocal')!.value),
    );

    this.form.get('isRecurring')!.valueChanges.subscribe(isRecurring => {
      const ctrl = this.form.get('recurrenceFrequencyId')!;
      if (isRecurring) ctrl.setValidators(Validators.required);
      else { ctrl.clearValidators(); ctrl.setValue(null); }
      ctrl.updateValueAndValidity();
    });
  }

  get isEditMode(): boolean { return !!this.costLine; }

  readonly isCategoryStrictScrutiny = isCategoryStrictScrutiny;

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closed.emit();
    }
  }

  get selectedCategory(): CostCategoryDto | undefined {
    const id = this.form.get('categoryId')!.value;
    return id ? this.categories().find(c => c.id === +id) : undefined;
  }

  get strictScrutinyWarning(): boolean {
    const cat = this.selectedCategory;
    return !!cat && isCategoryStrictScrutiny(cat);
  }

  get previewBgClass(): string {
    return ({
      L1: 'preview-l1', L2: 'preview-l2',
      L3: 'preview-l3', L4: 'preview-l4',
    })[this.approvalPreview() ?? ''] ?? '';
  }

  get previewLabel(): string {
    return ({
      L1: 'L1 — Auto-approuvé',
      L2: 'L2 — Finance Manager',
      L3: 'L3 — Country Director',
      L4: 'L4 — Double approbation requise',
    })[this.approvalPreview() ?? ''] ?? this.approvalPreview() ?? '';
  }

  updateApprovalPreview(amount: number | null): void {
    if (!amount || amount <= 0) { this.approvalPreview.set(null); return; }
    const cat    = this.selectedCategory;
    const strict = cat ? isCategoryStrictScrutiny(cat) : false;
    const sorted = [...this.thresholds()].sort((a, b) => a.minAmountEur - b.minAmountEur);
    let level    = sorted.length > 0 ? sorted[sorted.length - 1].level : 'L4';
    for (const t of sorted) {
      if (amount >= t.minAmountEur && (t.maxAmountEur == null || amount < t.maxAmountEur)) {
        level = t.level; break;
      }
    }
    if (strict) {
      const levels = ['L1', 'L2', 'L3', 'L4'];
      const idx    = levels.indexOf(level);
      level        = levels[Math.min(idx + 1, 3)];
    }
    this.approvalPreview.set(level);
  }

  isInvalid(name: string): boolean {
    const ctrl = this.form.get(name);
    return !!(ctrl?.invalid && ctrl.touched);
  }

  saveForm(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const dto: CreateCostLineRequest = {
      paysId:               this.paysId,
      categoryId:           v.categoryId!,
      transactionDate:      v.transactionDate!,
      periodYear:           v.periodYear!,
      periodMonth:          v.periodMonth!,
      description:          v.description!,
      netAmountLocal:       v.netAmountLocal!,
      vatAmountLocal:       v.vatAmountLocal ?? 0,
      currencyId:           v.currencyId!,
      costTypeId:           v.costTypeId ?? undefined,
      paymentMethodId:      v.paymentMethodId ?? undefined,
      supplierNameFree:     v.supplierNameFree || undefined,
      documentUrl:          v.documentUrl || undefined,
      notes:                v.notes || undefined,
      isRecurring:          v.isRecurring ?? false,
      recurrenceFrequencyId: v.recurrenceFrequencyId ?? undefined,
    };

    const save$ = this.costLine
      ? this.svc.updateCostLine(this.costLine.id, dto)
      : this.svc.createCostLine(dto);

    save$.subscribe({
      next: result => { this.isSaving.set(false); this.saved.emit(result); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(err.error?.message ?? err.error?.error ?? 'Une erreur est survenue.');
      },
    });
  }
}
