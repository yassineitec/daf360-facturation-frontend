import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { FormsModule }                                        from '@angular/forms';
import { TranslatePipe, TranslateService }                    from '@ngx-translate/core';
import { FormFieldComponent }                                 from '@khalilrebhiitec/daf360';
import { BillingService }                                     from '../billing.service';
import { BillingLinesComponent }                              from '../billing-lines.component';
import { AffaireDetail }                                      from '../../affaire.model';
import { UserStore }                                          from '../../../../core/user.store';

@Component({
  selector: 'app-billing-tm',
  standalone: true,
  imports: [NgClass, FormsModule, TranslatePipe, BillingLinesComponent, FormFieldComponent],
  template: `
<div class="space-y-5">

  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-2">
      <span class="material-symbols-outlined text-base text-[#1a6b7c]">schedule</span>
      {{ 'AFFAIRES.billing.modes.tm.title' | translate }}
    </h3>
    @if (canRF()) {
      <button (click)="openCreateModal()"
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-medium
               bg-[#1a6b7c] text-white hover:bg-[#134f5c] transition-colors">
        <span class="material-symbols-outlined text-sm">add</span>
        {{ 'AFFAIRES.billing.modes.tm.create_line' | translate }}
      </button>
    }
  </div>

  <div class="p-4 bg-[#f0f4f8] rounded-xl border border-[#eceef0] text-sm text-[#44474c]">
    <div class="flex items-start gap-2">
      <span class="material-symbols-outlined text-base text-[#1a6b7c] flex-shrink-0 mt-0.5">info</span>
      <div>
        <p class="font-medium text-[#1d2b3e] mb-1">{{ 'AFFAIRES.billing.modes.tm.info_title' | translate }}</p>
        <p class="text-xs">{{ 'AFFAIRES.billing.modes.tm.info_body' | translate }}</p>
      </div>
    </div>
  </div>

  @if (actionError()) {
    <p class="text-xs text-[#dc2626]">{{ actionError() }}</p>
  }

  <app-billing-lines [affaireId]="affaire.id" [devise]="affaire.devise" />

</div>

<!-- Create line modal -->
@if (showModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">{{ 'AFFAIRES.billing.modes.tm.modal_title' | translate }}</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">{{ 'AFFAIRES.billing.modes.tm.periode' | translate }}</label>
          <input type="month" [(ngModel)]="periode"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30" />
        </div>
        <div>
          <daf-form-field
            [options]="{ type: 'number', label: ('AFFAIRES.billing.modes.tm.montant_ht' | translate), placeholder: ('AFFAIRES.billing.modes.tm.montant_placeholder' | translate:{ devise: affaire.devise }), fullWidth: true }"
            [value]="montantHt"
            (valueChange)="montantHt = +($event ?? 0)" />
        </div>
        @if (modalError()) {
          <p class="text-xs text-[#dc2626]">{{ modalError() }}</p>
        }
      </div>
      <div class="flex justify-end gap-3 mt-5">
        <button (click)="showModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          {{ 'AFFAIRES.billing.modes.tm.modal_cancel' | translate }}
        </button>
        <button (click)="doCreate()" [disabled]="saving()"
          [ngClass]="canCreate() && !saving()
            ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-5 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          @if (saving()) { {{ 'AFFAIRES.billing.modes.tm.creating' | translate }} } @else { {{ 'AFFAIRES.billing.modes.tm.create' | translate }} }
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class BillingTmComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc       = inject(BillingService);
  private readonly store     = inject(UserStore);
  private readonly translate = inject(TranslateService);

  showModal   = signal(false);
  saving      = signal(false);
  actionError = signal<string | null>(null);
  modalError  = signal<string | null>(null);

  periode   = '';
  montantHt = 0;

  readonly canRF = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));
  readonly canCreate = computed(() => !!this.periode && this.montantHt > 0);

  ngOnInit(): void {}

  openCreateModal(): void {
    const now = new Date();
    this.periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.montantHt = 0;
    this.modalError.set(null);
    this.showModal.set(true);
  }

  doCreate(): void {
    if (!this.canCreate() || this.saving()) return;
    this.saving.set(true);
    this.modalError.set(null);
    this.svc.createBillingLineTM(this.affaire.id, {
      periode: this.periode,
      montantHt: this.montantHt,
    }).subscribe({
      next:  () => { this.saving.set(false); this.showModal.set(false); },
      error: err => { this.saving.set(false); this.modalError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.billing.modes.tm.err_generic')); },
    });
  }
}
