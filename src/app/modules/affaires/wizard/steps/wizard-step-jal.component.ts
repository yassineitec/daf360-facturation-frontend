import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgClass } from '@angular/common';

import { AffaireDraftState } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-jal',
  standalone: true,
  imports: [FormsModule, DecimalPipe, NgClass],
  template: `
<div class="space-y-4">

  <div class="p-4 bg-[#f0f4ff] rounded-xl flex gap-2 text-sm">
    <span class="material-symbols-outlined text-[#4648d4] text-base flex-shrink-0">info</span>
    <p class="text-[#1d2b3e]">
      La somme des montants des jalons doit être égale au
      <strong>montant du contrat
        ({{ draft.contractAmount | number:'1.3-3' }} {{ draft.contractCurrency }})
      </strong>.
    </p>
  </div>

  <!-- Milestone rows -->
  @for (j of draft.jalons; track $index; let i = $index) {
    <div class="p-4 bg-white rounded-xl border border-[#eceef0] space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-[#1a6b7c] uppercase tracking-wide">
          Jalon {{ i + 1 }}
        </span>
        <button type="button" (click)="removeJalon(i)"
          class="p-1.5 hover:bg-[#fee2e2] rounded-lg text-[#ba1a1a] transition-colors">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">
          <input type="text" [(ngModel)]="j.label" maxlength="255"
            placeholder="Libellé du jalon *"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none"/>
        </div>
        <div>
          <input type="number" step="0.001" min="0"
            [(ngModel)]="j.montant" (ngModelChange)="updateJalonTotal()"
            placeholder="Montant *"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none"/>
        </div>
        <div>
          <input type="date" [(ngModel)]="j.datePrevisionnelle"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none"/>
        </div>
        <div class="col-span-2">
          <textarea [(ngModel)]="j.description" rows="2" maxlength="500"
            placeholder="Description (optionnel)"
            class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm
                   outline-none resize-none">
          </textarea>
        </div>
      </div>
    </div>
  }

  <!-- Add jalon -->
  <button type="button" (click)="addJalon()"
    class="w-full py-3 rounded-xl border-2 border-dashed border-[#c5c6cd] text-sm
           text-[#44474c] hover:border-[#1a6b7c] hover:text-[#1a6b7c] transition-colors
           flex items-center justify-center gap-2">
    <span class="material-symbols-outlined text-base">add</span>
    Ajouter un jalon
  </button>

  <!-- Total vs contract -->
  @if (draft.jalons.length > 0) {
    <div class="flex items-center justify-between p-4 rounded-xl"
      [ngClass]="isBalanced() ? 'bg-[#d1fae5]' : 'bg-[#fee2e2]'">
      <div>
        <p class="text-xs text-[#44474c]">Total jalons</p>
        <p class="text-xl font-bold" [ngClass]="isBalanced() ? 'text-[#065f46]' : 'text-[#991b1b]'">
          {{ draft.jalonTotal | number:'1.3-3' }} {{ draft.contractCurrency }}
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs text-[#44474c]">Montant contrat</p>
        <p class="text-lg font-semibold text-[#1d2b3e]">
          {{ draft.contractAmount | number:'1.3-3' }} {{ draft.contractCurrency }}
        </p>
      </div>
    </div>

    @if (!isBalanced()) {
      <p class="text-sm text-[#ba1a1a] flex items-center gap-1">
        <span class="material-symbols-outlined text-base">warning</span>
        La somme des jalons doit être égale au montant du contrat.
      </p>
    }
  }

</div>
  `,
})
export class WizardStepJalComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  ngOnInit(): void {
    if (!this.draft.jalons.length) this.addJalon();
    else this.updateJalonTotal();
  }

  addJalon(): void {
    const nextOrdre = this.draft.jalons.length + 1;
    this.draft.jalons = [...this.draft.jalons, { label: '', montant: 0, ordre: nextOrdre }];
    this.updateJalonTotal();
  }

  removeJalon(index: number): void {
    this.draft.jalons = this.draft.jalons
      .filter((_, i) => i !== index)
      .map((j, i) => ({ ...j, ordre: i + 1 }));
    this.updateJalonTotal();
  }

  updateJalonTotal(): void {
    this.draft.jalonTotal = Math.round(
      this.draft.jalons.reduce((sum, j) => sum + (Number(j.montant) || 0), 0) * 1000,
    ) / 1000;
    this.emit();
  }

  isBalanced(): boolean {
    if (!this.draft.contractAmount) return false;
    return Math.abs(this.draft.jalonTotal - this.draft.contractAmount) < 0.001;
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, jalons: [...this.draft.jalons] });
  }
}
