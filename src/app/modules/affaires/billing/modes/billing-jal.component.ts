import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { FormFieldComponent }                                 from '@khalilrebhiitec/daf360';
import { TranslatePipe, TranslateService }                    from '@ngx-translate/core';
import { BillingService, JalonDto }                           from '../billing.service';
import { BillingLinesComponent }                              from '../billing-lines.component';
import { AffaireDetail }                                      from '../../affaire.model';
import { UserStore }                                          from '../../../../core/user.store';

const JALON_CFG: Record<string, { bg: string; color: string; border: string }> = {
  A_FACTURER:           { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  EN_ATTENTE_VALIDATION:{ bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  FACTURE:              { bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  ANNULE:               { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

@Component({
  selector: 'app-billing-jal',
  standalone: true,
  imports: [NgClass, FormFieldComponent, TranslatePipe, BillingLinesComponent],
  template: `
<div class="space-y-5">

  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-2">
      <span class="material-symbols-outlined text-base text-[#1a6b7c]">flag</span>
      {{ 'AFFAIRES.billing.modes.jal.title' | translate }}
    </h3>
    <button (click)="load()" class="text-xs text-[#1a6b7c] hover:underline flex items-center gap-1">
      <span class="material-symbols-outlined text-sm">refresh</span>{{ 'AFFAIRES.billing.modes.jal.refresh' | translate }}
    </button>
  </div>

  @if (loading()) {
    <div class="text-sm text-[#64748b] text-center py-8">{{ 'AFFAIRES.billing.modes.jal.loading' | translate }}</div>
  } @else if (jalons().length === 0) {
    <div class="text-sm text-[#64748b] text-center py-8 border border-dashed border-[#eceef0] rounded-xl">
      {{ 'AFFAIRES.billing.modes.jal.empty' | translate }}
    </div>
  } @else {
    <div class="space-y-2">
      @for (j of jalons(); track j.id) {
        <div class="flex items-center gap-4 p-4 bg-white border border-[#eceef0] rounded-xl hover:shadow-sm transition-shadow">

          <!-- Ordre indicator -->
          <div class="w-7 h-7 rounded-full bg-[#f0f4f8] border border-[#eceef0] flex items-center justify-center
                      text-xs font-bold text-[#44474c] flex-shrink-0">
            {{ j.ordre }}
          </div>

          <!-- Label + date -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-[#1d2b3e] truncate">{{ j.label }}</p>
            @if (j.echeance) {
              <p class="text-xs text-[#64748b]">{{ 'AFFAIRES.billing.modes.jal.echeance' | translate }} {{ fmtDate(j.echeance) }}</p>
            }
          </div>

          <!-- Amount -->
          <div class="text-right flex-shrink-0">
            <p class="text-sm font-semibold text-[#1d2b3e]">
              {{ fmtAmt(j.montant, affaire.devise) }}
            </p>
          </div>

          <!-- Status badge -->
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0"
            [style.background]="jalCfg(j.statut).bg"
            [style.color]="jalCfg(j.statut).color"
            [style.borderColor]="jalCfg(j.statut).border">
            {{ jalCfg(j.statut).label }}
          </span>

          <!-- Actions -->
          <div class="flex gap-1.5 flex-shrink-0">
            @if (j.statut === 'A_FACTURER' && canCP()) {
              <button (click)="doSubmit(j)"
                class="px-2 py-1 text-xs rounded-lg font-medium bg-[#dbeafe] text-[#1e40af]
                       hover:bg-[#bfdbfe] transition-colors">
                {{ 'AFFAIRES.billing.modes.jal.submit' | translate }}
              </button>
            }
            @if (j.statut === 'EN_ATTENTE_VALIDATION' && canRF()) {
              <button (click)="doValidate(j)"
                class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                       hover:bg-[#a7f3d0] transition-colors">
                {{ 'AFFAIRES.billing.modes.jal.validate' | translate }}
              </button>
              <button (click)="openRefuse(j)"
                class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                       hover:bg-[#fecaca] transition-colors">
                {{ 'AFFAIRES.billing.modes.jal.refuse' | translate }}
              </button>
            }
          </div>

        </div>
      }
    </div>

    <!-- Progress bar -->
    <div class="flex items-center gap-3 text-xs text-[#64748b] pt-1">
      <div class="flex-1 bg-[#f1f5f9] rounded-full h-1.5 overflow-hidden">
        <div class="h-full rounded-full bg-[#1a6b7c] transition-all"
          [style.width]="progressPct() + '%'"></div>
      </div>
      <span>{{ 'AFFAIRES.billing.modes.jal.progress' | translate:{ count: factures(), total: jalons().length } }}</span>
    </div>
  }

  @if (actionError()) {
    <p class="text-xs text-[#dc2626]">{{ actionError() }}</p>
  }

  <app-billing-lines [affaireId]="affaire.id" [devise]="affaire.devise" />

</div>

<!-- Refuse modal -->
@if (showRefuseModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showRefuseModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">{{ 'AFFAIRES.billing.modes.jal.modal_refuse_title' | translate }}</h3>
      <daf-form-field
        [options]="{ type: 'textarea', rows: 3, maxLength: 500, fullWidth: true, placeholder: ('AFFAIRES.billing.modes.jal.modal_refuse_placeholder' | translate) }"
        [value]="refuseMotif"
        (valueChange)="refuseMotif = $any($event) ?? ''" />
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showRefuseModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          {{ 'AFFAIRES.billing.modes.jal.modal_cancel' | translate }}
        </button>
        <button (click)="doRefuse()"
          [ngClass]="refuseMotif.trim()
            ? 'bg-[#dc2626] hover:bg-[#b91c1c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          {{ 'AFFAIRES.billing.modes.jal.modal_refuse_btn' | translate }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class BillingJalComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc       = inject(BillingService);
  private readonly store     = inject(UserStore);
  private readonly translate = inject(TranslateService);

  jalons      = signal<JalonDto[]>([]);
  loading     = signal(false);
  actionError = signal<string | null>(null);

  showRefuseModal = signal(false);
  refuseMotif     = '';

  private refuseTarget: JalonDto | null = null;

  readonly canCP = computed(() => this.store.hasPermission('FACT_CHEF_PROJET'));
  readonly canRF = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));

  readonly factures   = computed(() => this.jalons().filter(j => j.statut === 'FACTURE').length);
  readonly progressPct= computed(() => {
    const total = this.jalons().length;
    return total > 0 ? (this.factures() / total) * 100 : 0;
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getJalons(this.affaire.id).subscribe({
      next:  j => { this.jalons.set(j); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  doSubmit(j: JalonDto): void {
    this.actionError.set(null);
    this.svc.submitJalon(j.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.billing.modes.jal.err_submit')),
    });
  }

  doValidate(j: JalonDto): void {
    this.actionError.set(null);
    this.svc.validateJalon(j.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.billing.modes.jal.err_validate')),
    });
  }

  openRefuse(j: JalonDto): void {
    this.refuseTarget = j;
    this.refuseMotif = '';
    this.showRefuseModal.set(true);
  }

  doRefuse(): void {
    if (!this.refuseTarget || !this.refuseMotif.trim()) return;
    this.svc.refuseJalon(this.refuseTarget.id, this.refuseMotif.trim()).subscribe({
      next: () => { this.showRefuseModal.set(false); this.load(); },
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.billing.modes.jal.err_generic')),
    });
  }

  jalCfg(statut: string) {
    const c = JALON_CFG[statut];
    if (!c) return { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
    return { ...c, label: this.translate.instant('AFFAIRES.billing.modes.jal.status.' + statut) };
  }

  fmtAmt(v: number | null | undefined, devise = 'EUR'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' ' + devise;
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
