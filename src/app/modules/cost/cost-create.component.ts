import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { debounceTime } from 'rxjs/operators';

import { CostService }     from './cost.service';
import { FactListService } from '../../core/fact-list.service';
import { ClientService }   from '../clients/client.service';
import {
  CostCategoryDto, CostApprovalThresholdDto, CreateCostLineRequest,
  ListValueDto, isCategoryStrictScrutiny,
} from './cost.model';

type CostStep = 1 | 2 | 3;

const STEP_ICONS = ['category', 'payments', 'store'] as const;

@Component({
  selector: 'app-cost-create',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, TranslatePipe],
  templateUrl: './cost-create.component.html',
  styleUrl:    './cost-create.component.scss',
})
export class CostCreateComponent implements OnInit {

  private readonly svc         = inject(CostService);
  private readonly factListSvc = inject(FactListService);
  private readonly clientSvc   = inject(ClientService);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly translate   = inject(TranslateService);

  categories      = signal<CostCategoryDto[]>([]);
  thresholds      = signal<CostApprovalThresholdDto[]>([]);
  currencies      = signal<ListValueDto[]>([]);
  costTypes       = signal<ListValueDto[]>([]);
  paymentMethods  = signal<ListValueDto[]>([]);
  recurrenceFreqs = signal<ListValueDto[]>([]);
  paysId          = signal<number>(1);
  isSaving        = signal(false);
  isDraft         = signal(false);
  serverError     = signal<string | null>(null);
  approvalPreview = signal<string | null>(null);

  // ── Stepper ──────────────────────────────────────────────────────────────
  step = signal<CostStep>(1);
  readonly steps = computed(() => {
    this.translate.currentLang();
    return [
      {
        icon:  STEP_ICONS[0],
        title: this.translate.instant('COST.CREATE.STEPS.CONTEXT.TITLE'),
        sub:   this.translate.instant('COST.CREATE.STEPS.CONTEXT.SUB'),
        tip:   this.translate.instant('COST.CREATE.STEPS.CONTEXT.TIP'),
      },
      {
        icon:  STEP_ICONS[1],
        title: this.translate.instant('COST.CREATE.STEPS.AMOUNTS.TITLE'),
        sub:   this.translate.instant('COST.CREATE.STEPS.AMOUNTS.SUB'),
        tip:   this.translate.instant('COST.CREATE.STEPS.AMOUNTS.TIP'),
      },
      {
        icon:  STEP_ICONS[2],
        title: this.translate.instant('COST.CREATE.STEPS.SUPPLIER.TITLE'),
        sub:   this.translate.instant('COST.CREATE.STEPS.SUPPLIER.SUB'),
        tip:   this.translate.instant('COST.CREATE.STEPS.SUPPLIER.TIP'),
      },
    ];
  });

  readonly stepTitle = computed(() => this.steps()[this.step() - 1].title);
  readonly stepSub   = computed(() => this.steps()[this.step() - 1].sub);
  readonly stepTip   = computed(() => this.steps()[this.step() - 1].tip);
  readonly stepIcon  = computed(() => this.steps()[this.step() - 1].icon);

  readonly canGoNext = computed(() => {
    const s = this.step();
    if (s === 1) {
      return this.form.get('categoryId')!.valid
          && this.form.get('transactionDate')!.valid
          && this.form.get('description')!.valid;
    }
    if (s === 2) {
      return this.form.get('netAmountLocal')!.valid
          && this.form.get('currencyId')!.valid;
    }
    return true;
  });

  // ── Summary sidebar ───────────────────────────────────────────────────────
  readonly summaryCategory = computed(() => {
    const id = this.form.get('categoryId')!.value;
    if (!id) return '—';
    return this.categories().find(c => c.id === +id)?.labelFr ?? '—';
  });

  readonly summaryDate = computed(() => {
    const d = this.form.get('transactionDate')!.value;
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); }
    catch { return d; }
  });

  readonly summaryAmount = computed(() => {
    const gross = this.grossAmount;
    if (!gross) return '—';
    const code = this.selectedCurrency?.code ?? '';
    return `${gross.toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 })} ${code}`.trim();
  });

  readonly summarySupplier = computed(() =>
    this.form.get('supplierNameFree')!.value?.trim() || '—'
  );

  // ── Today ─────────────────────────────────────────────────────────────────
  readonly today = new Date().toISOString().split('T')[0];

  // ── Form ──────────────────────────────────────────────────────────────────
  form = new FormGroup({
    categoryId:            new FormControl<number | null>(null, Validators.required),
    transactionDate:       new FormControl<string>(this.today, Validators.required),
    periodYear:            new FormControl<number | null>(null),
    periodMonth:           new FormControl<number | null>(null),
    description:           new FormControl<string>('', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]),
    costTypeId:            new FormControl<number | null>(null),
    netAmountLocal:        new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vatAmountLocal:        new FormControl<number>(0),
    currencyId:            new FormControl<number | null>(null, Validators.required),
    paymentMethodId:       new FormControl<number | null>(null),
    supplierNameFree:      new FormControl<string>(''),
    documentUrl:           new FormControl<string>(''),
    notes:                 new FormControl<string>(''),
    isRecurring:           new FormControl<boolean>(false),
    recurrenceFrequencyId: new FormControl<number | null>(null),
    affaireId:             new FormControl<number | null>(null),
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: id => {
        const pid = (id != null && id > 0) ? id : 1;
        this.paysId.set(pid);
        this.loadFormData(pid);
      },
      error: () => this.loadFormData(1),
    });

    this.form.get('transactionDate')!.valueChanges.subscribe(date => {
      if (date) {
        const d = new Date(date);
        this.form.patchValue({ periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 }, { emitEvent: false });
      }
    });
    const initDate = this.form.get('transactionDate')!.value;
    if (initDate) {
      const d = new Date(initDate);
      this.form.patchValue({ periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 }, { emitEvent: false });
    }

    this.form.get('netAmountLocal')!.valueChanges
      .pipe(debounceTime(300))
      .subscribe(v => this.updateApprovalPreview(v));

    this.form.get('categoryId')!.valueChanges.subscribe(() =>
      this.updateApprovalPreview(this.form.get('netAmountLocal')!.value));

    this.form.get('isRecurring')!.valueChanges.subscribe(r => {
      const ctrl = this.form.get('recurrenceFrequencyId')!;
      if (r) ctrl.setValidators(Validators.required);
      else { ctrl.clearValidators(); ctrl.setValue(null); }
      ctrl.updateValueAndValidity();
    });
  }

  private loadFormData(pid: number): void {
    this.factListSvc.getListValues('CURRENCY',             pid).subscribe(v => this.currencies.set(v));
    this.factListSvc.getListValues('COST_TYPE',            pid).subscribe(v => this.costTypes.set(v));
    this.factListSvc.getListValues('PAYMENT_METHOD',       pid).subscribe(v => this.paymentMethods.set(v));
    this.factListSvc.getListValues('RECURRENCE_FREQUENCY', pid).subscribe(v => this.recurrenceFreqs.set(v));
    this.svc.getCategories(pid).subscribe(cats => this.categories.set(cats.filter(c => c.isActive)));
    this.svc.getThresholds(pid).subscribe(t => this.thresholds.set(t));
  }

  // ── Step navigation ───────────────────────────────────────────────────────
  goNext(): void {
    if (this.step() < 3) {
      this.touchCurrentStep();
      if (!this.canGoNext()) return;
      this.step.set((this.step() + 1) as CostStep);
    } else {
      this.submitForm();
    }
  }

  goPrev(): void {
    const s = this.step();
    if (s > 1) this.step.set((s - 1) as CostStep);
  }

  private touchCurrentStep(): void {
    const fields: Record<number, string[]> = {
      1: ['categoryId', 'transactionDate', 'description'],
      2: ['netAmountLocal', 'currencyId'],
      3: [],
    };
    for (const f of (fields[this.step()] ?? [])) {
      this.form.get(f)!.markAsTouched();
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────────
  get selectedCategory(): CostCategoryDto | undefined {
    const id = this.form.get('categoryId')!.value;
    return id ? this.categories().find(c => c.id === +id) : undefined;
  }

  get strictScrutinyWarning(): boolean {
    const cat = this.selectedCategory;
    return !!cat && isCategoryStrictScrutiny(cat);
  }

  get netAmount(): number  { return this.form.get('netAmountLocal')!.value ?? 0; }
  get vatAmount(): number  { return this.form.get('vatAmountLocal')!.value ?? 0; }
  get grossAmount(): number { return this.netAmount + this.vatAmount; }

  get selectedCurrency(): ListValueDto | undefined {
    const id = this.form.get('currencyId')!.value;
    return id ? this.currencies().find(c => c.id === +id) : undefined;
  }

  get approvalLabel(): string {
    const level = this.approvalPreview();
    if (!level) return '—';
    const key = ({ L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4' } as Record<string, string>)[level];
    return key ? this.translate.instant('COST.APPROVAL.LEVEL_' + key) : '—';
  }

  get approvalSteps(): { label: string; role: string; state: 'done' | 'current' | 'pending' }[] {
    const level = this.approvalPreview();
    const all = [
      { key: 'L2', label: this.translate.instant('COST.CREATE.CIRCUIT.STEP1_LABEL'),      role: this.translate.instant('COST.CREATE.CIRCUIT.ROLE_MANAGER') },
      { key: 'L3', label: this.translate.instant('COST.CREATE.CIRCUIT.STEP2_LABEL'),      role: this.translate.instant('COST.CREATE.CIRCUIT.ROLE_DIRECTOR') },
      { key: 'L4', label: this.translate.instant('COST.CREATE.CIRCUIT.STEP_FINAL_LABEL'), role: this.translate.instant('COST.CREATE.CIRCUIT.ROLE_DUAL') },
    ];
    const idx = all.findIndex(s => s.key === level);
    return all.map((s, i) => ({
      label: s.label,
      role:  s.role,
      state: (level === 'L1' ? 'pending' : i < idx ? 'done' : i === idx ? 'current' : 'pending') as 'done' | 'current' | 'pending',
    }));
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

  saveDraft(): void {
    this.isDraft.set(true);
    this.submit(true);
  }

  submitForm(): void {
    this.isDraft.set(false);
    this.submit(false);
  }

  private submit(draft: boolean): void {
    if (!draft && this.form.invalid) { this.form.markAllAsTouched(); this.isDraft.set(false); return; }
    this.isSaving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const dto: CreateCostLineRequest = {
      paysId:                this.paysId(),
      categoryId:            v.categoryId!,
      transactionDate:       v.transactionDate!,
      periodYear:            v.periodYear!,
      periodMonth:           v.periodMonth!,
      description:           v.description || 'Brouillon',
      netAmountLocal:        v.netAmountLocal ?? 0,
      vatAmountLocal:        v.vatAmountLocal ?? 0,
      currencyId:            v.currencyId!,
      costTypeId:            v.costTypeId ?? undefined,
      paymentMethodId:       v.paymentMethodId ?? undefined,
      supplierNameFree:      v.supplierNameFree || undefined,
      documentUrl:           v.documentUrl || undefined,
      notes:                 v.notes || undefined,
      isRecurring:           v.isRecurring ?? false,
      recurrenceFrequencyId: v.recurrenceFrequencyId ?? undefined,
      affaireId:             v.affaireId ?? undefined,
    };

    this.svc.createCostLine(dto).subscribe({
      next: created => {
        this.isSaving.set(false);
        if (!draft) {
          this.svc.submitCostLine(created.id).subscribe({
            next:  () => this.router.navigate(['..'], { relativeTo: this.route }),
            error: () => this.router.navigate(['..'], { relativeTo: this.route }),
          });
        } else {
          this.router.navigate(['..'], { relativeTo: this.route });
        }
      },
      error: err => {
        this.isSaving.set(false);
        this.isDraft.set(false);
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.CREATE.GENERIC_ERROR'));
      },
    });
  }

  reset(): void { this.form.reset({ transactionDate: this.today, vatAmountLocal: 0, isRecurring: false }); }
  cancel(): void { this.router.navigate(['..'], { relativeTo: this.route }); }
}
