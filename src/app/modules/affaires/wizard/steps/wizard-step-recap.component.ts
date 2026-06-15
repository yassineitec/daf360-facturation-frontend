import { Component, Input } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';

import { AffaireDraftState, BILLING_MODES } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-recap',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  template: `
<div class="space-y-6">

  <div class="p-4 bg-[#e6f7f5] rounded-xl flex gap-2 text-sm border border-[#a7f3d0]">
    <span class="material-symbols-outlined text-[#1a6b7c] text-base flex-shrink-0"
      style="font-variation-settings:'FILL' 1">check_circle</span>
    <p class="text-[#1d2b3e]">
      Vérifiez les informations ci-dessous avant d'activer l'affaire.
      Une fois activée, le mode de facturation sera verrouillé.
    </p>
  </div>

  <!-- Section A: Informations générales -->
  <div class="bg-white rounded-xl border border-[#eceef0] overflow-hidden">
    <div class="px-5 py-3 bg-[#f7f9fb] border-b border-[#eceef0]">
      <h4 class="text-sm font-bold text-[#1d2b3e] uppercase tracking-wide">
        A — Informations générales
      </h4>
    </div>
    <div class="p-5 grid grid-cols-2 gap-x-8 gap-y-4">

      <div>
        <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Client</p>
        <p class="text-sm font-medium text-[#1d2b3e] mt-0.5">{{ draft.clientName ?? '—' }}</p>
      </div>

      <div>
        <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Intitulé</p>
        <p class="text-sm font-medium text-[#1d2b3e] mt-0.5">{{ draft.intitule }}</p>
      </div>

      <div>
        <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Mode de facturation</p>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="material-symbols-outlined text-[#1a6b7c] text-base"
            style="font-variation-settings:'FILL' 1">{{ getModeIcon() }}</span>
          <p class="text-sm font-medium text-[#1d2b3e]">{{ getModeLabelFr() }}</p>
        </div>
      </div>

      <div>
        <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Responsable(s)</p>
        <p class="text-sm font-medium text-[#1d2b3e] mt-0.5">{{ draft.responsableNames.join(' / ') || '—' }}</p>
      </div>

      @if (draft.dateDebut || draft.dateFin) {
        <div>
          <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Période</p>
          <p class="text-sm font-medium text-[#1d2b3e] mt-0.5">
            {{ draft.dateDebut | date:'dd/MM/yyyy' }} →
            {{ draft.dateFin  | date:'dd/MM/yyyy' }}
          </p>
        </div>
      }

      @if (draft.contractAmount) {
        <div>
          <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Montant du contrat</p>
          <p class="text-sm font-bold text-[#1a6b7c] mt-0.5">
            {{ draft.contractAmount | number:'1.3-3' }} {{ draft.contractCurrency }}
          </p>
        </div>
      }

      @if (draft.reference) {
        <div>
          <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Référence</p>
          <p class="text-sm font-mono text-[#1d2b3e] mt-0.5">{{ draft.reference }}</p>
        </div>
      }

      @if (draft.doc360Ref) {
        <div>
          <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Référence Doc360</p>
          <p class="text-sm font-mono text-[#1d2b3e] mt-0.5">{{ draft.doc360Ref }}</p>
        </div>
      }

      @if (draft.notes) {
        <div class="col-span-2">
          <p class="text-xs text-[#75777d] uppercase tracking-wide font-semibold">Notes</p>
          <p class="text-sm text-[#44474c] mt-0.5">{{ draft.notes }}</p>
        </div>
      }

    </div>
  </div>

  <!-- Section B: Configuration spécifique -->
  <div class="bg-white rounded-xl border border-[#eceef0] overflow-hidden">
    <div class="px-5 py-3 bg-[#f7f9fb] border-b border-[#eceef0]">
      <h4 class="text-sm font-bold text-[#1d2b3e] uppercase tracking-wide">
        B — Configuration spécifique ({{ draft.billingMode }})
      </h4>
    </div>
    <div class="p-5">

      @if (draft.billingMode === 'AV') {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-[#75777d] uppercase border-b border-[#eceef0]">
              <th class="pb-2 text-left font-semibold">Type de répartition</th>
              <th class="pb-2 text-right font-semibold">Pourcentage</th>
            </tr>
          </thead>
          <tbody>
            @for (r of draft.repartitions; track $index) {
              <tr class="border-b border-[#f2f4f6]">
                <td class="py-2 text-[#1d2b3e]">Type ID #{{ r.repartitionTypeId }}</td>
                <td class="py-2 text-right font-bold text-[#1a6b7c]">
                  {{ r.percentage | number:'1.1-1' }} %
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td class="pt-2 text-xs font-bold text-[#44474c] uppercase">Total</td>
              <td class="pt-2 text-right font-bold text-[#1d2b3e]">
                {{ draft.repartitionTotal | number:'1.1-1' }} %
              </td>
            </tr>
          </tfoot>
        </table>
      }

      @if (draft.billingMode === 'JAL') {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-[#75777d] uppercase border-b border-[#eceef0]">
              <th class="pb-2 text-left font-semibold">Jalon</th>
              <th class="pb-2 text-left font-semibold">Date prévisionnelle</th>
              <th class="pb-2 text-right font-semibold">Montant</th>
            </tr>
          </thead>
          <tbody>
            @for (j of draft.jalons; track $index; let i = $index) {
              <tr class="border-b border-[#f2f4f6]">
                <td class="py-2">
                  <span class="font-medium text-[#1d2b3e]">{{ i + 1 }}. {{ j.label }}</span>
                  @if (j.description) {
                    <p class="text-xs text-[#75777d]">{{ j.description }}</p>
                  }
                </td>
                <td class="py-2 text-[#44474c]">
                  {{ j.datePrevisionnelle ? (j.datePrevisionnelle | date:'dd/MM/yyyy') : '—' }}
                </td>
                <td class="py-2 text-right font-bold text-[#1a6b7c]">
                  {{ j.montant | number:'1.3-3' }} {{ draft.contractCurrency }}
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="pt-2 text-xs font-bold text-[#44474c] uppercase">Total</td>
              <td class="pt-2 text-right font-bold text-[#1d2b3e]">
                {{ draft.jalonTotal | number:'1.3-3' }} {{ draft.contractCurrency }}
              </td>
            </tr>
          </tfoot>
        </table>
      }

      @if (draft.billingMode === 'TM') {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-[#75777d] uppercase border-b border-[#eceef0]">
              <th class="pb-2 text-left font-semibold">Collaborateur</th>
              <th class="pb-2 text-left font-semibold">Type taux</th>
              <th class="pb-2 text-right font-semibold">Taux</th>
              <th class="pb-2 text-right font-semibold">Coût interne</th>
            </tr>
          </thead>
          <tbody>
            @for (r of draft.ressources; track $index) {
              <tr class="border-b border-[#f2f4f6]">
                <td class="py-2">
                  <span class="font-medium text-[#1d2b3e]">{{ r.userName ?? 'User #' + r.userId }}</span>
                  <span class="ml-2 text-[10px] bg-[#f2f4f6] text-[#44474c] px-1.5 py-0.5 rounded">
                    {{ r.resourceType === 'INTERNAL' ? 'Interne' : 'Externe' }}
                  </span>
                </td>
                <td class="py-2 text-[#44474c]">{{ r.rateType === 'DAILY' ? 'JH' : 'H' }}</td>
                <td class="py-2 text-right font-bold text-[#1a6b7c]">
                  {{ r.rateAmount | number:'1.2-2' }} {{ r.rateCurrency }}
                </td>
                <td class="py-2 text-right text-[#75777d]">
                  {{ r.costAmount ? (r.costAmount | number:'1.2-2') + ' ' + r.rateCurrency : '—' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (draft.billingMode === 'CP') {
        <div class="space-y-3">
          <div class="flex items-center gap-3 p-3 bg-[#f7f9fb] rounded-lg">
            <span class="material-symbols-outlined text-[#1a6b7c] text-base">percent</span>
            <div>
              <p class="text-xs text-[#75777d] uppercase font-semibold">Taux de marge</p>
              <p class="text-lg font-bold text-[#1a6b7c]">{{ draft.marginRatePct | number:'1.2-2' }} %</p>
            </div>
          </div>
          <p class="text-xs text-[#44474c] font-semibold uppercase">
            {{ draft.eligibleCostCategoryIds.length }} catégorie(s) de coûts sélectionnée(s)
          </p>
          <div class="flex flex-wrap gap-2">
            @for (id of draft.eligibleCostCategoryIds; track id) {
              <span class="bg-[#e6f7f5] text-[#1a6b7c] px-2.5 py-1 rounded-full text-xs font-semibold">
                Catégorie #{{ id }}
              </span>
            }
          </div>
        </div>
      }

      @if (draft.billingMode === 'RMB') {
        <div class="space-y-3">
          <p class="text-xs text-[#44474c] font-semibold uppercase">
            {{ draft.eligibleExpenseCategoryIds.length }} catégorie(s) de frais sélectionnée(s)
          </p>
          <div class="flex flex-wrap gap-2">
            @for (id of draft.eligibleExpenseCategoryIds; track id) {
              <span class="bg-[#e6f7f5] text-[#1a6b7c] px-2.5 py-1 rounded-full text-xs font-semibold">
                Catégorie #{{ id }}
              </span>
            }
          </div>
        </div>
      }

    </div>
  </div>

</div>
  `,
})
export class WizardStepRecapComponent {
  @Input() draft!: AffaireDraftState;
  @Input() draftId!: number | null;

  getModeOption() { return BILLING_MODES.find(m => m.code === this.draft.billingMode); }
  getModeLabelFr() { return this.getModeOption()?.labelFr ?? this.draft.billingMode ?? '—'; }
  getModeIcon()   { return this.getModeOption()?.icon ?? 'receipt'; }
}
