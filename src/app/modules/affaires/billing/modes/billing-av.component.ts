import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { TranslatePipe, TranslateService }                    from '@ngx-translate/core';
import { FormFieldComponent }                                 from '@khalilrebhiitec/daf360';
import { BillingService, TauxAvancementDto }                  from '../billing.service';
import { BillingLinesComponent }                              from '../billing-lines.component';
import { AffaireDetail }                                      from '../../affaire.model';
import { UserStore }                                          from '../../../../core/user.store';

const TAUX_CFG: Record<string, { bg: string; color: string; border: string }> = {
  EN_ATTENTE: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE:     { bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  REFUSE:     { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

@Component({
  selector: 'app-billing-av',
  standalone: true,
  imports: [NgClass, TranslatePipe, BillingLinesComponent, FormFieldComponent],
  template: `
<div class="space-y-5">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-2">
      <span class="material-symbols-outlined text-base text-[#1a6b7c]">trending_up</span>
      {{ 'AFFAIRES.billing.modes.av.title' | translate }}
    </h3>
    @if (canCP()) {
      <button (click)="openSubmit()"
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-medium
               bg-[#1a6b7c] text-white hover:bg-[#134f5c] transition-colors">
        <span class="material-symbols-outlined text-sm">add</span>
        {{ 'AFFAIRES.billing.modes.av.submit_btn' | translate }}
      </button>
    }
  </div>

  @if (affaire.contractAmount) {
    <div class="inline-flex items-center gap-2 text-xs text-[#44474c] bg-[#f0f4f8] rounded-lg px-3 py-1.5">
      <span class="material-symbols-outlined text-sm text-[#1a6b7c]">info</span>
      {{ 'AFFAIRES.billing.modes.av.contract_amount' | translate }}
      <strong>{{ fmtAmt(affaire.contractAmount, affaire.devise) }}</strong>
      · {{ 'AFFAIRES.billing.modes.av.last_validated' | translate }}
      <strong>{{ lastValidated() }}%</strong>
    </div>
  }

  @if (loading()) {
    <div class="text-sm text-[#64748b] text-center py-8">{{ 'AFFAIRES.billing.modes.av.loading' | translate }}</div>
  } @else if (history().length === 0) {
    <div class="text-sm text-[#64748b] text-center py-8 border border-dashed border-[#eceef0] rounded-xl">
      {{ 'AFFAIRES.billing.modes.av.empty' | translate }}
    </div>
  } @else {
    <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
            <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.av.col_date' | translate }}</th>
            <th class="px-4 py-3 text-right">{{ 'AFFAIRES.billing.modes.av.col_taux' | translate }}</th>
            <th class="px-4 py-3 text-right">{{ 'AFFAIRES.billing.modes.av.col_valeur' | translate }}</th>
            <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.av.col_statut' | translate }}</th>
            <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.av.col_comment' | translate }}</th>
            @if (canRF()) {
              <th class="px-4 py-3 text-left">{{ 'AFFAIRES.billing.modes.av.col_actions_rf' | translate }}</th>
            }
          </tr>
        </thead>
        <tbody class="divide-y divide-[#f1f5f9]">
          @for (t of history(); track t.id) {
            <tr class="hover:bg-[#f8fafc] transition-colors">
              <td class="px-4 py-3 text-[#44474c]">{{ fmtDate(t.soumisAt) }}</td>
              <td class="px-4 py-3 text-right font-bold text-[#1d2b3e]">{{ t.taux }}%</td>
              <td class="px-4 py-3 text-right text-[#1d2b3e]">{{ fmtAmt(t.valeurCalculee, affaire.devise) }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                  [style.background]="tauxCfg(t.statut).bg"
                  [style.color]="tauxCfg(t.statut).color"
                  [style.borderColor]="tauxCfg(t.statut).border">
                  {{ tauxCfg(t.statut).label }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-[#64748b] max-w-xs truncate">
                {{ t.motifRefus ? '⚠ ' + t.motifRefus : (t.commentaire || '—') }}
              </td>
              @if (canRF()) {
                <td class="px-4 py-3">
                  @if (t.statut === 'EN_ATTENTE') {
                    <div class="flex gap-1.5">
                      <button (click)="doValidate(t)"
                        class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                               hover:bg-[#a7f3d0] transition-colors">
                        {{ 'AFFAIRES.billing.modes.av.validate' | translate }}
                      </button>
                      <button (click)="openRefuse(t)"
                        class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                               hover:bg-[#fecaca] transition-colors">
                        {{ 'AFFAIRES.billing.modes.av.refuse' | translate }}
                      </button>
                    </div>
                  } @else if (t.statut === 'VALIDE') {
                    <button (click)="doCreateLine(t.id)"
                      class="px-2 py-1 text-xs rounded-lg font-medium bg-[#e0e7ff] text-[#3730a3]
                             hover:bg-[#c7d2fe] transition-colors">
                      {{ 'AFFAIRES.billing.modes.av.create_line' | translate }}
                    </button>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <app-billing-lines [affaireId]="affaire.id" [devise]="affaire.devise" />

</div>

<!-- Submit modal -->
@if (showSubmitModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showSubmitModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">{{ 'AFFAIRES.billing.modes.av.modal_submit_title' | translate }}</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">{{ 'AFFAIRES.billing.modes.av.modal_last_validated' | translate }}</label>
          <div class="px-3 py-2 bg-[#f8fafc] border border-[#eceef0] rounded-xl text-sm text-[#64748b]">
            {{ lastValidated() }}%
          </div>
        </div>
        <div>
          <daf-form-field
            [options]="{ type: 'number', label: ('AFFAIRES.billing.modes.av.modal_new_taux' | translate), placeholder: ('AFFAIRES.billing.modes.av.modal_new_taux_placeholder' | translate), fullWidth: true }"
            [value]="newTaux"
            (valueChange)="newTaux = +($event ?? 0)" />
          @if (affaire.contractAmount && newTaux > lastValidated()) {
            <p class="text-xs text-[#1a6b7c] mt-1">
              {{ 'AFFAIRES.billing.modes.av.modal_incremental' | translate }}
              <strong>{{ fmtAmt((newTaux - lastValidated()) / 100 * affaire.contractAmount, affaire.devise) }}</strong>
            </p>
          }
        </div>
        <div>
          <daf-form-field
            [options]="{ type: 'textarea', rows: 2, maxLength: 500, label: ('AFFAIRES.billing.modes.av.modal_comment' | translate), placeholder: ('AFFAIRES.billing.modes.av.modal_comment_placeholder' | translate), fullWidth: true }"
            [value]="submitComment"
            (valueChange)="submitComment = $any($event ?? '')" />
        </div>
        @if (submitError()) {
          <p class="text-xs text-[#dc2626]">{{ submitError() }}</p>
        }
      </div>
      <div class="flex justify-end gap-3 mt-5">
        <button (click)="showSubmitModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          {{ 'AFFAIRES.billing.modes.av.modal_cancel' | translate }}
        </button>
        <button (click)="doSubmitTaux()" [disabled]="!canSubmit() || submitting()"
          [ngClass]="canSubmit() && !submitting()
            ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-5 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          @if (submitting()) { {{ 'AFFAIRES.billing.modes.av.modal_submitting' | translate }} } @else { {{ 'AFFAIRES.billing.modes.av.modal_submit' | translate }} }
        </button>
      </div>
    </div>
  </div>
}

<!-- Refuse modal -->
@if (showRefuseModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showRefuseModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">{{ 'AFFAIRES.billing.modes.av.modal_refuse_title' | translate }}</h3>
      <daf-form-field
        [options]="{ type: 'textarea', rows: 3, maxLength: 500, placeholder: ('AFFAIRES.billing.modes.av.modal_refuse_placeholder' | translate), fullWidth: true }"
        [value]="refuseMotif"
        (valueChange)="refuseMotif = $any($event ?? '')" />
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showRefuseModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          {{ 'AFFAIRES.billing.modes.av.modal_cancel' | translate }}
        </button>
        <button (click)="doRefuse()"
          [ngClass]="refuseMotif.trim()
            ? 'bg-[#dc2626] hover:bg-[#b91c1c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          {{ 'AFFAIRES.billing.modes.av.modal_refuse_btn' | translate }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class BillingAvComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc       = inject(BillingService);
  private readonly store     = inject(UserStore);
  private readonly translate = inject(TranslateService);

  history         = signal<TauxAvancementDto[]>([]);
  loading         = signal(false);
  showSubmitModal = signal(false);
  showRefuseModal = signal(false);
  submitting      = signal(false);
  submitError     = signal<string | null>(null);

  newTaux       = 0;
  submitComment = '';
  refuseMotif   = '';

  private refuseTarget: TauxAvancementDto | null = null;

  readonly canCP = computed(() => this.store.hasPermission('FACT_CHEF_PROJET'));
  readonly canRF = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));

  readonly lastValidated = computed(() => {
    const vals = this.history().filter(t => t.statut === 'VALIDE');
    return vals.length > 0 ? Math.max(...vals.map(t => t.taux)) : 0;
  });

  readonly canSubmit = computed(() =>
    this.newTaux > this.lastValidated() && this.newTaux <= 100
  );

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getTauxHistory(this.affaire.id).subscribe({
      next:  h => { this.history.set(h); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openSubmit(): void {
    const next = Math.min(this.lastValidated() + 10, 100);
    this.newTaux = next > this.lastValidated() ? next : this.lastValidated() + 1;
    this.submitComment = '';
    this.submitError.set(null);
    this.showSubmitModal.set(true);
  }

  doSubmitTaux(): void {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.svc.submitTaux(this.affaire.id, {
      taux: this.newTaux,
      commentaire: this.submitComment.trim() || null,
    }).subscribe({
      next:  () => { this.submitting.set(false); this.showSubmitModal.set(false); this.load(); },
      error: err => { this.submitting.set(false); this.submitError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.billing.modes.av.err_generic')); },
    });
  }

  doValidate(t: TauxAvancementDto): void {
    this.svc.validateTaux(t.id).subscribe({ next: () => this.load() });
  }

  openRefuse(t: TauxAvancementDto): void {
    this.refuseTarget = t;
    this.refuseMotif = '';
    this.showRefuseModal.set(true);
  }

  doRefuse(): void {
    if (!this.refuseTarget || !this.refuseMotif.trim()) return;
    this.svc.refuseTaux(this.refuseTarget.id, this.refuseMotif.trim()).subscribe({
      next: () => { this.showRefuseModal.set(false); this.load(); },
    });
  }

  doCreateLine(tauxId: number): void {
    this.svc.createBillingLineAV(this.affaire.id, tauxId).subscribe({ next: () => {} });
  }

  tauxCfg(statut: string) {
    const c = TAUX_CFG[statut];
    if (!c) return { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
    return { ...c, label: this.translate.instant('AFFAIRES.billing.modes.av.status.' + statut) };
  }

  fmtAmt(v: number | null | undefined, devise = 'EUR'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v) + ' ' + devise;
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
