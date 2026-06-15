import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgClass } from '@angular/common';

import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState }  from '../../affaire-wizard.model';
import { ListValueDto }       from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-av',
  standalone: true,
  imports: [FormsModule, DecimalPipe, NgClass],
  template: `
<div class="space-y-4">

  <div class="p-4 bg-[#f0f4ff] rounded-xl flex gap-2 text-sm">
    <span class="material-symbols-outlined text-[#4648d4] text-base flex-shrink-0">info</span>
    <p class="text-[#1d2b3e]">
      La somme des pourcentages doit être égale à <strong>100 %</strong>.
      La liste des types de répartition est configurable via l'administration.
    </p>
  </div>

  <!-- Repartition rows -->
  @for (r of draft.repartitions; track $index; let i = $index) {
    <div class="flex items-center gap-4 p-4 bg-white rounded-xl border border-[#eceef0]">
      <select [(ngModel)]="r.repartitionTypeId"
        class="flex-1 bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none">
        <option [value]="0">Type de répartition *</option>
        @for (t of repartitionTypes(); track t.id) {
          <option [value]="t.id">{{ t.labelFr }}</option>
        }
      </select>
      <div class="flex items-center gap-2">
        <input type="number" [(ngModel)]="r.percentage" (ngModelChange)="updateTotal()"
          min="0" max="100" step="0.1"
          class="w-24 bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm
                 outline-none text-right"/>
        <span class="text-sm text-[#44474c] font-semibold">%</span>
      </div>
      <button type="button" (click)="removeRow(i)"
        class="p-2 hover:bg-[#fee2e2] rounded-lg text-[#ba1a1a] transition-colors">
        <span class="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  }

  <!-- Add row -->
  <button type="button" (click)="addRow()"
    class="w-full py-3 rounded-xl border-2 border-dashed border-[#c5c6cd] text-sm
           text-[#44474c] hover:border-[#1a6b7c] hover:text-[#1a6b7c] transition-colors
           flex items-center justify-center gap-2">
    <span class="material-symbols-outlined text-base">add</span>
    Ajouter un type de répartition
  </button>

  <!-- Total indicator -->
  @if (draft.repartitions.length > 0) {
    <div class="flex items-center justify-between p-4 rounded-xl"
      [ngClass]="draft.repartitionTotal === 100 ? 'bg-[#d1fae5]' : 'bg-[#fee2e2]'">
      <span class="text-sm font-semibold">Total</span>
      <span class="text-xl font-bold"
        [ngClass]="draft.repartitionTotal === 100 ? 'text-[#065f46]' : 'text-[#991b1b]'">
        {{ draft.repartitionTotal | number:'1.1-1' }} %
      </span>
    </div>

    @if (draft.repartitionTotal !== 100) {
      <p class="text-sm text-[#ba1a1a] flex items-center gap-1">
        <span class="material-symbols-outlined text-base">warning</span>
        La somme doit être exactement 100 %.
        @if (draft.repartitionTotal < 100) {
          Il manque {{ 100 - draft.repartitionTotal | number:'1.1-1' }} %.
        } @else {
          L'excédent est de {{ draft.repartitionTotal - 100 | number:'1.1-1' }} %.
        }
      </p>
    }
  }

</div>
  `,
})
export class WizardStepAvComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly listSvc = inject(FactListService);

  repartitionTypes = signal<ListValueDto[]>([]);

  ngOnInit(): void {
    const paysId = Number(this.draft.paysId);
    if (paysId) {
      this.listSvc.getListValues('AFFAIRE_REPARTITION_TYPE', paysId)
        .subscribe(t => this.repartitionTypes.set(t));
    }
    if (!this.draft.repartitions.length) {
      this.addRow();
    } else {
      this.updateTotal();
    }
  }

  addRow(): void {
    this.draft.repartitions = [...this.draft.repartitions, { repartitionTypeId: 0, percentage: 0 }];
    this.updateTotal();
  }

  removeRow(index: number): void {
    this.draft.repartitions = this.draft.repartitions.filter((_, i) => i !== index);
    this.updateTotal();
  }

  updateTotal(): void {
    this.draft.repartitionTotal = Math.round(
      this.draft.repartitions.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0) * 10,
    ) / 10;
    this.emit();
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, repartitions: [...this.draft.repartitions] });
  }
}
