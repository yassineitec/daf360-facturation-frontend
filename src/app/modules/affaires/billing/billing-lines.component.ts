import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { NgClass }                                             from '@angular/common';
import { FormsModule }                                        from '@angular/forms';
import { BillingService, BillingLineDto }                     from './billing.service';
import { UserStore }                                          from '../../../core/user.store';

const STATUT_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  EN_ATTENTE_DF: { label: 'En attente DF', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE_DF:     { label: 'Validé DF',     bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  FACTURE:       { label: 'Facturé',       bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  A_VERIFIER:    { label: 'À vérifier',    bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  RETOURNE:      { label: 'Retourné',      bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  ANNULE:        { label: 'Annulé',        bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

@Component({
  selector: 'app-billing-lines',
  standalone: true,
  imports: [NgClass, FormsModule],
  template: `
<div class="mt-6">
  <div class="flex items-center justify-between mb-3">
    <h4 class="text-sm font-semibold text-[#1d2b3e] flex items-center gap-1.5">
      <span class="material-symbols-outlined text-base text-[#1a6b7c]">receipt_long</span>
      Lignes de facturation
    </h4>
    <button (click)="load()" class="text-xs text-[#1a6b7c] hover:underline flex items-center gap-1">
      <span class="material-symbols-outlined text-sm">refresh</span>Actualiser
    </button>
  </div>

  @if (loading()) {
    <div class="text-sm text-[#64748b] text-center py-6">Chargement…</div>
  } @else if (lines().length === 0) {
    <div class="text-sm text-[#64748b] text-center py-6 border border-dashed border-[#eceef0] rounded-xl">
      Aucune ligne de facturation générée.
    </div>
  } @else {
    <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
            <th class="px-4 py-3 text-left">Référence</th>
            <th class="px-4 py-3 text-left">Période</th>
            <th class="px-4 py-3 text-left">Date facturation</th>
            <th class="px-4 py-3 text-right">Montant HT</th>
            <th class="px-4 py-3 text-right">WIP</th>
            <th class="px-4 py-3 text-left">Statut</th>
            <th class="px-4 py-3 text-left">Facture</th>
            @if (canDF()) {
              <th class="px-4 py-3 text-left">Actions DF</th>
            }
          </tr>
        </thead>
        <tbody class="divide-y divide-[#f1f5f9]">
          @for (line of lines(); track line.id) {
            <tr class="hover:bg-[#f8fafc] transition-colors">
              <td class="px-4 py-3 font-mono text-xs text-[#44474c]">{{ line.reference }}</td>
              <td class="px-4 py-3 text-[#44474c]">{{ line.periode || '—' }}</td>
              <td class="px-4 py-3 text-[#44474c]">{{ fmtDate(line.dateBilling) }}</td>
              <td class="px-4 py-3 text-right font-medium text-[#1d2b3e]">{{ fmtAmt(line.montantHt) }} {{ devise }}</td>
              <td class="px-4 py-3 text-right text-[#64748b]">{{ fmtAmt(line.wip) }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                  [style.background]="cfg(line.statut).bg"
                  [style.color]="cfg(line.statut).color"
                  [style.borderColor]="cfg(line.statut).border">
                  {{ cfg(line.statut).label }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-[#64748b] font-mono">{{ line.factureRef || '—' }}</td>
              @if (canDF()) {
                <td class="px-4 py-3">
                  @if (line.statut === 'EN_ATTENTE_DF' || line.statut === 'A_VERIFIER') {
                    <div class="flex gap-1.5">
                      <button (click)="doValidate(line.id)"
                        class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                               hover:bg-[#a7f3d0] transition-colors">
                        Valider
                      </button>
                      <button (click)="openModal(line.id, 'retour')"
                        class="px-2 py-1 text-xs rounded-lg font-medium bg-[#ffedd5] text-[#9a3412]
                               hover:bg-[#fed7aa] transition-colors">
                        Retourner
                      </button>
                      <button (click)="openModal(line.id, 'annuler')"
                        class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                               hover:bg-[#fecaca] transition-colors">
                        Annuler
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

@if (showModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">
        {{ modalMode() === 'retour' ? 'Motif de retour' : "Motif d'annulation" }}
      </h3>
      <textarea [(ngModel)]="motif" rows="3" maxlength="500"
        class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm resize-none
               focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
        placeholder="Motif obligatoire…"></textarea>
      @if (modalError()) {
        <p class="text-xs text-[#dc2626] mt-1">{{ modalError() }}</p>
      }
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          Annuler
        </button>
        <button (click)="submitModal()"
          [ngClass]="motif.trim() ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer' : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          Confirmer
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class BillingLinesComponent implements OnInit {
  @Input({ required: true }) affaireId!: number;
  @Input() devise = 'EUR';

  private readonly svc   = inject(BillingService);
  private readonly store = inject(UserStore);

  lines      = signal<BillingLineDto[]>([]);
  loading    = signal(false);
  showModal  = signal(false);
  modalMode  = signal<'retour' | 'annuler'>('retour');
  modalError = signal<string | null>(null);
  motif      = '';

  private activeLineId = 0;

  readonly canDF = computed(() => this.store.hasPermission('FACT_VALIDATE_DF'));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getBillingLines(this.affaireId).subscribe({
      next:  l => { this.lines.set(l); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  cfg(statut: string) {
    return STATUT_CFG[statut] ?? { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  }

  doValidate(lineId: number): void {
    this.svc.validateDF(lineId).subscribe({ next: () => this.load() });
  }

  openModal(lineId: number, mode: 'retour' | 'annuler'): void {
    this.activeLineId = lineId;
    this.motif = '';
    this.modalMode.set(mode);
    this.modalError.set(null);
    this.showModal.set(true);
  }

  submitModal(): void {
    if (!this.motif.trim()) { this.modalError.set('Le motif est obligatoire.'); return; }
    const obs$ = this.modalMode() === 'retour'
      ? this.svc.returnDF(this.activeLineId, this.motif.trim())
      : this.svc.cancelLine(this.activeLineId, this.motif.trim());
    obs$.subscribe({
      next:  () => { this.showModal.set(false); this.load(); },
      error: err => this.modalError.set(err?.error?.message ?? 'Erreur lors de l\'action.'),
    });
  }

  fmtAmt(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
