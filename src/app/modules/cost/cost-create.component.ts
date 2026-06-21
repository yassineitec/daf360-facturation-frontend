import {
  Component, OnInit, inject, signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime } from 'rxjs/operators';

import { CostService }       from './cost.service';
import { FactListService }   from '../../core/fact-list.service';
import { ClientService }     from '../clients/client.service';
import {
  CostCategoryDto, CostApprovalThresholdDto, CreateCostLineRequest,
  ListValueDto, isCategoryStrictScrutiny,
} from './cost.model';

@Component({
  selector: 'app-cost-create',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './cost-create.component.html',
  styleUrl:    './cost-create.component.scss',
})
export class CostCreateComponent implements OnInit {

  private readonly svc         = inject(CostService);
  private readonly factListSvc = inject(FactListService);
  private readonly clientSvc   = inject(ClientService);
  private readonly router      = inject(Router);

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

  readonly today = new Date().toISOString().split('T')[0];

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

    // Auto-fill period from date
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

    // Approval preview
    this.form.get('netAmountLocal')!.valueChanges
      .pipe(debounceTime(300))
      .subscribe(v => this.updateApprovalPreview(v));

    this.form.get('categoryId')!.valueChanges.subscribe(() =>
      this.updateApprovalPreview(this.form.get('netAmountLocal')!.value));

    // Recurrence validation
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

  get selectedCategory(): CostCategoryDto | undefined {
    const id = this.form.get('categoryId')!.value;
    return id ? this.categories().find(c => c.id === +id) : undefined;
  }

  get strictScrutinyWarning(): boolean {
    const cat = this.selectedCategory;
    return !!cat && isCategoryStrictScrutiny(cat);
  }

  get netAmount(): number { return this.form.get('netAmountLocal')!.value ?? 0; }
  get vatAmount(): number { return this.form.get('vatAmountLocal')!.value ?? 0; }
  get grossAmount(): number { return this.netAmount + this.vatAmount; }

  get selectedCurrency(): ListValueDto | undefined {
    const id = this.form.get('currencyId')!.value;
    return id ? this.currencies().find(c => c.id === +id) : undefined;
  }

  get approvalLabel(): string {
    return ({
      L1: 'L1 — Auto-approuvé',
      L2: 'L2 — Finance Manager',
      L3: 'L3 — Country Director',
      L4: 'L4 — Double approbation requise',
    })[this.approvalPreview() ?? ''] ?? '—';
  }

  get approvalSteps(): { label: string; role: string; state: 'done' | 'current' | 'pending' }[] {
    const level = this.approvalPreview();
    const all = [
      { key: 'L2', label: 'ÉTAPE 1 : MANAGER', role: 'Finance Manager' },
      { key: 'L3', label: 'ÉTAPE 2 : DIRECTEUR', role: 'Country Director' },
      { key: 'L4', label: 'ÉTAPE FINALE : DUAL', role: 'Double approbation' },
    ];
    const idx = all.findIndex(s => s.key === level);
    return all.map((s, i) => ({
      label: s.label,
      role: s.role,
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
            next: () => this.router.navigate(['/fact/cost']),
            error: () => this.router.navigate(['/fact/cost']),
          });
        } else {
          this.router.navigate(['/fact/cost']);
        }
      },
      error: err => {
        this.isSaving.set(false);
        this.isDraft.set(false);
        this.serverError.set(err.error?.message ?? 'Une erreur est survenue.');
      },
    });
  }

  reset(): void { this.form.reset({ transactionDate: this.today, vatAmountLocal: 0, isRecurring: false }); }
  cancel(): void { this.router.navigate(['/fact/cost']); }
}
