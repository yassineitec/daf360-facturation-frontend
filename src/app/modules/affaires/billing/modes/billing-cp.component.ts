import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { FormsModule }                                        from '@angular/forms';
import { BillingService }                                     from '../billing.service';
import { BillingLinesComponent }                              from '../billing-lines.component';
import { AffaireDetail }                                      from '../../affaire.model';
import { UserStore }                                          from '../../../../core/user.store';

@Component({
  selector: 'app-billing-cp',
  standalone: true,
  imports: [NgClass, FormsModule, BillingLinesComponent],
  template: `
<div class="space-y-5">

  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-2">
      <span class="material-symbols-outlined text-base text-[#1a6b7c]">calculate</span>
      Facturation Cost-Plus (CP)
    </h3>
    @if (canRF()) {
      <button (click)="openCreateModal()"
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-medium
               bg-[#1a6b7c] text-white hover:bg-[#134f5c] transition-colors">
        <span class="material-symbols-outlined text-sm">add</span>
        Créer une ligne
      </button>
    }
  </div>

  <div class="p-4 bg-[#f0f4f8] rounded-xl border border-[#eceef0] text-sm text-[#44474c]">
    <div class="flex items-start gap-2">
      <span class="material-symbols-outlined text-base text-[#1a6b7c] flex-shrink-0 mt-0.5">info</span>
      <div>
        <p class="font-medium text-[#1d2b3e] mb-1">Mode Cost-Plus — facturation sur coûts réels + marge</p>
        @if (affaire.cpMarginRatePct != null) {
          <p class="text-xs">Taux de marge configuré : <strong>{{ affaire.cpMarginRatePct }}%</strong></p>
        }
        <p class="text-xs mt-1">Créez une ligne de facturation mensuelle sur la base des coûts imputés
          aux catégories éligibles de l'affaire, majorés du taux de marge défini.</p>
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
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">Créer une ligne de facturation CP</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">Période *</label>
          <input type="month" [(ngModel)]="periode"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">Montant coûts HT *</label>
          <input type="number" [(ngModel)]="montantHt" min="0.01" step="0.01"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
            placeholder="Coûts de la période en {{ affaire.devise }}" />
          @if (affaire.cpMarginRatePct != null && montantHt > 0) {
            <p class="text-xs text-[#1a6b7c] mt-1">
              Montant facturé (avec marge {{ affaire.cpMarginRatePct }}%) :
              <strong>{{ fmtAmt(montantHt * (1 + affaire.cpMarginRatePct / 100), affaire.devise) }}</strong>
            </p>
          }
        </div>
        <div>
          <label class="block text-xs font-medium text-[#44474c] mb-1">Note</label>
          <textarea [(ngModel)]="note" rows="2" maxlength="500"
            class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm resize-none
                   focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
            placeholder="Commentaire optionnel…"></textarea>
        </div>
        @if (modalError()) {
          <p class="text-xs text-[#dc2626]">{{ modalError() }}</p>
        }
      </div>
      <div class="flex justify-end gap-3 mt-5">
        <button (click)="showModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          Annuler
        </button>
        <button (click)="doCreate()" [disabled]="saving()"
          [ngClass]="canCreate() && !saving()
            ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-5 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          @if (saving()) { Création… } @else { Créer }
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class BillingCpComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc   = inject(BillingService);
  private readonly store = inject(UserStore);

  showModal   = signal(false);
  saving      = signal(false);
  actionError = signal<string | null>(null);
  modalError  = signal<string | null>(null);

  periode   = '';
  montantHt = 0;
  note      = '';

  readonly canRF = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));
  readonly canCreate = computed(() => !!this.periode && this.montantHt > 0);

  ngOnInit(): void {}

  openCreateModal(): void {
    const now = new Date();
    this.periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.montantHt = 0;
    this.note = '';
    this.modalError.set(null);
    this.showModal.set(true);
  }

  doCreate(): void {
    if (!this.canCreate() || this.saving()) return;
    this.saving.set(true);
    this.modalError.set(null);
    this.svc.createBillingLineCP(this.affaire.id, {
      periode: this.periode,
      montantHt: this.montantHt,
      note: this.note.trim() || null,
    }).subscribe({
      next:  () => { this.saving.set(false); this.showModal.set(false); },
      error: err => { this.saving.set(false); this.modalError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  fmtAmt(v: number, devise = 'EUR'): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' ' + devise;
  }
}
