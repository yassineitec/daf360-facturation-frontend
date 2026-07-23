import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { TranslatePipe, TranslateService }                    from '@ngx-translate/core';
import { SelectComponent, SelectOption, FormFieldComponent }  from '@khalilrebhiitec/daf360';
import { BillingService, ExpenseDto }                         from '../billing.service';
import { BillingLinesComponent }                              from '../billing-lines.component';
import { AffaireDetail }                                      from '../../affaire.model';
import { UserStore }                                          from '../../../../core/user.store';
import { FactListService }                                    from '../../../../core/fact-list.service';
import { ListValueDto }                                       from '../../../cost/cost.model';

const EXPENSE_STATUT: Record<string, { bg: string; color: string; border: string }> = {
  EN_ATTENTE: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE:     { bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  REFUSE:     { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE  = 5 * 1024 * 1024; // 5 MB

@Component({
  selector: 'app-billing-rmb',
  standalone: true,
  imports: [NgClass, TranslatePipe, BillingLinesComponent, SelectComponent, FormFieldComponent],
  template: `
<div class="space-y-6">

  <!-- Submit form (CP) -->
  @if (canCP()) {
    <div class="bg-white border border-[#eceef0] rounded-xl p-5">
      <h3 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-2 mb-4">
        <span class="material-symbols-outlined text-base text-[#1a6b7c]">upload_file</span>
        {{ 'AFFAIRES.billing.modes.rmb.submit_title' | translate }}
      </h3>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <daf-select
            [options]="categoryOptions()"
            [selected]="[form.categorie]"
            [config]="{ label: ('AFFAIRES.billing.modes.rmb.categorie' | translate), placeholder: ('AFFAIRES.billing.modes.rmb.categorie_select' | translate), searchable: true, fullWidth: true }"
            (selectedChange)="form.categorie = $event[0] ?? ''" />
        </div>

        <div>
          <daf-form-field
            [options]="{ type: 'number', label: ('AFFAIRES.billing.modes.rmb.montant' | translate:{ devise: affaire.devise }), placeholder: '0.00', fullWidth: true }"
            [value]="form.montant"
            (valueChange)="form.montant = +($event ?? 0)" />
        </div>

        <div>
          <daf-form-field
            [options]="{ type: 'date', label: ('AFFAIRES.billing.modes.rmb.date' | translate), fullWidth: true }"
            [value]="form.dateDepense"
            (valueChange)="form.dateDepense = $any($event ?? '')" />
        </div>

        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">
            {{ 'AFFAIRES.billing.modes.rmb.justificatif' | translate }} <span class="font-normal text-[#64748b]">{{ 'AFFAIRES.billing.modes.rmb.justificatif_hint' | translate }}</span>
          </label>
          <label class="flex items-center gap-2 px-3 py-2 border border-[#eceef0] rounded-xl cursor-pointer
                        hover:border-[#1a6b7c] transition-colors text-sm text-[#64748b]">
            <span class="material-symbols-outlined text-base text-[#1a6b7c]">attach_file</span>
            @if (selectedFile()) {
              <span class="text-[#1d2b3e] truncate max-w-xs">{{ selectedFile()!.name }}</span>
            } @else {
              {{ 'AFFAIRES.billing.modes.rmb.choose_file' | translate }}
            }
            <input #fileInput type="file" accept=".jpg,.jpeg,.png,.pdf"
              class="hidden" (change)="onFileChange($event)" />
          </label>
          @if (fileError()) {
            <p class="text-xs text-[#dc2626] mt-1">{{ fileError() }}</p>
          }
        </div>

        <div class="col-span-2">
          <daf-form-field
            [options]="{ type: 'textarea', rows: 2, maxLength: 500, label: ('AFFAIRES.billing.modes.rmb.commentaire' | translate), placeholder: ('AFFAIRES.billing.modes.rmb.commentaire_placeholder' | translate), fullWidth: true }"
            [value]="form.commentaire"
            (valueChange)="form.commentaire = $any($event ?? '')" />
        </div>
      </div>

      @if (submitError()) {
        <p class="text-xs text-[#dc2626] mt-3">{{ submitError() }}</p>
      }

      <div class="flex justify-end mt-4">
        <button (click)="doSubmit()" [disabled]="!canSubmit() || submitting()"
          [ngClass]="canSubmit() && !submitting()
            ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="flex items-center gap-1.5 px-5 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          @if (submitting()) {
            <span class="material-symbols-outlined text-base" style="animation: spin 1s linear infinite">progress_activity</span>
            {{ 'AFFAIRES.billing.modes.rmb.submitting' | translate }}
          } @else {
            <span class="material-symbols-outlined text-base">send</span>
            {{ 'AFFAIRES.billing.modes.rmb.submit' | translate }}
          }
        </button>
      </div>
    </div>
  }

  <!-- Expense list -->
  <div>
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-1.5">
        <span class="material-symbols-outlined text-base text-[#1a6b7c]">list_alt</span>
        {{ 'AFFAIRES.billing.modes.rmb.list_title' | translate }}
      </h4>
      <button (click)="loadExpenses()" class="text-xs text-[#1a6b7c] hover:underline flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">refresh</span>{{ 'AFFAIRES.billing.modes.rmb.refresh' | translate }}
      </button>
    </div>

    @if (expLoading()) {
      <div class="text-sm text-[#64748b] text-center py-6">{{ 'AFFAIRES.billing.modes.rmb.loading' | translate }}</div>
    } @else if (expenses().length === 0) {
      <div class="text-sm text-[#64748b] text-center py-6 border border-dashed border-[#eceef0] rounded-xl">
        {{ 'AFFAIRES.billing.modes.rmb.empty' | translate }}
      </div>
    } @else {
      <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
              <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.rmb.col_date' | translate }}</th>
              <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.rmb.col_categorie' | translate }}</th>
              <th class="px-4 py-3 text-right">{{ 'AFFAIRES.billing.modes.rmb.col_montant' | translate }}</th>
              <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.rmb.col_statut' | translate }}</th>
              <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.rmb.col_justificatif' | translate }}</th>
              @if (canRF()) {
                <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.rmb.col_actions' | translate }}</th>
              }
            </tr>
          </thead>
          <tbody class="divide-y divide-[#f1f5f9]">
            @for (exp of expenses(); track exp.id) {
              <tr class="hover:bg-[#f8fafc] transition-colors">
                <td class="px-4 py-3 text-[#44474c]">{{ fmtDate(exp.dateDepense) }}</td>
                <td class="px-4 py-3 text-[#44474c]">{{ catLabel(exp.categorie) }}</td>
                <td class="px-4 py-3 text-right font-medium text-[#1d2b3e]">
                  {{ fmtAmt(exp.montant, affaire.devise) }}
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                    [style.background]="expCfg(exp.statut).bg"
                    [style.color]="expCfg(exp.statut).color"
                    [style.borderColor]="expCfg(exp.statut).border">
                    {{ expCfg(exp.statut).label }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  @if (exp.justificatifUrl) {
                    <a [href]="exp.justificatifUrl" target="_blank" rel="noopener"
                      class="text-xs text-[#1a6b7c] hover:underline flex items-center gap-1">
                      <span class="material-symbols-outlined text-sm">open_in_new</span>{{ 'AFFAIRES.billing.modes.rmb.view' | translate }}
                    </a>
                  } @else {
                    <span class="text-xs text-[#64748b]">—</span>
                  }
                </td>
                @if (canRF()) {
                  <td class="px-4 py-3">
                    @if (exp.statut === 'EN_ATTENTE') {
                      <div class="flex gap-1.5">
                        <button (click)="doValidateExp(exp.id)"
                          class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                                 hover:bg-[#a7f3d0] transition-colors">
                          {{ 'AFFAIRES.billing.modes.rmb.validate' | translate }}
                        </button>
                        <button (click)="openRefuseExp(exp.id)"
                          class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                                 hover:bg-[#fecaca] transition-colors">
                          {{ 'AFFAIRES.billing.modes.rmb.refuse' | translate }}
                        </button>
                      </div>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>

  <app-billing-lines [affaireId]="affaire.id" [devise]="affaire.devise" />

</div>

<!-- Refuse expense modal -->
@if (showRefuseModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showRefuseModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">{{ 'AFFAIRES.billing.modes.rmb.modal_refuse_title' | translate }}</h3>
      <daf-form-field
        [options]="{ type: 'textarea', rows: 3, maxLength: 500, placeholder: ('AFFAIRES.billing.modes.rmb.modal_refuse_placeholder' | translate), fullWidth: true }"
        [value]="refuseMotif"
        (valueChange)="refuseMotif = $any($event ?? '')" />
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showRefuseModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          {{ 'AFFAIRES.billing.modes.rmb.modal_cancel' | translate }}
        </button>
        <button (click)="doRefuseExp()"
          [ngClass]="refuseMotif.trim()
            ? 'bg-[#dc2626] hover:bg-[#b91c1c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          {{ 'AFFAIRES.billing.modes.rmb.modal_refuse_btn' | translate }}
        </button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class BillingRmbComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc          = inject(BillingService);
  private readonly store        = inject(UserStore);
  private readonly factListSvc  = inject(FactListService);
  private readonly translate    = inject(TranslateService);

  categories  = signal<ListValueDto[]>([]);
  expenses    = signal<ExpenseDto[]>([]);
  expLoading  = signal(false);
  submitting  = signal(false);
  submitError = signal<string | null>(null);
  fileError   = signal<string | null>(null);
  selectedFile= signal<File | null>(null);

  showRefuseModal = signal(false);
  refuseMotif     = '';
  private refuseExpId = 0;

  form = {
    categorie:    '',
    montant:      0,
    dateDepense:  '',
    commentaire:  '',
  };

  readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.code, label: c.labelFr })),
  );

  readonly canCP = computed(() => this.store.hasPermission('FACT_CHEF_PROJET'));
  readonly canRF = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));

  readonly canSubmit = computed(() =>
    !!this.form.categorie &&
    this.form.montant > 0 &&
    !!this.form.dateDepense &&
    this.selectedFile() !== null &&
    !this.fileError()
  );

  ngOnInit(): void {
    this.factListSvc.getListValues('EXPENSE_CATEGORY', this.affaire.paysId).subscribe({
      next: vals => this.categories.set(vals.filter(v => v.isActive)),
    });
    this.loadExpenses();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    this.fileError.set(null);
    if (!file) { this.selectedFile.set(null); return; }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.fileError.set(this.translate.instant('AFFAIRES.billing.modes.rmb.err_format'));
      this.selectedFile.set(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.fileError.set(this.translate.instant('AFFAIRES.billing.modes.rmb.err_size'));
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
  }

  doSubmit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    const fd = new FormData();
    fd.append('categorie',   this.form.categorie);
    fd.append('montant',     String(this.form.montant));
    fd.append('dateDepense', this.form.dateDepense);
    if (this.form.commentaire.trim()) {
      fd.append('commentaire', this.form.commentaire.trim());
    }
    fd.append('justificatif', this.selectedFile()!);

    this.svc.submitExpense(this.affaire.id, fd).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form = { categorie: '', montant: 0, dateDepense: '', commentaire: '' };
        this.selectedFile.set(null);
        this.loadExpenses();
      },
      error: err => {
        this.submitting.set(false);
        this.submitError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.billing.modes.rmb.err_submit'));
      },
    });
  }

  loadExpenses(): void {
    this.expLoading.set(true);
    this.svc.getExpenses(this.affaire.id).subscribe({
      next:  e => { this.expenses.set(e); this.expLoading.set(false); },
      error: () => this.expLoading.set(false),
    });
  }

  doValidateExp(id: number): void {
    this.svc.validateExpense(id).subscribe({ next: () => this.loadExpenses() });
  }

  openRefuseExp(id: number): void {
    this.refuseExpId = id;
    this.refuseMotif = '';
    this.showRefuseModal.set(true);
  }

  doRefuseExp(): void {
    if (!this.refuseMotif.trim()) return;
    this.svc.refuseExpense(this.refuseExpId, this.refuseMotif.trim()).subscribe({
      next: () => { this.showRefuseModal.set(false); this.loadExpenses(); },
    });
  }

  catLabel(code: string): string {
    return this.categories().find(c => c.code === code)?.labelFr ?? code;
  }

  expCfg(statut: string) {
    const c = EXPENSE_STATUT[statut];
    if (!c) return { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
    return { ...c, label: this.translate.instant('AFFAIRES.billing.modes.rmb.status.' + statut) };
  }

  fmtAmt(v: number, devise = 'EUR'): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v) + ' ' + devise;
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
