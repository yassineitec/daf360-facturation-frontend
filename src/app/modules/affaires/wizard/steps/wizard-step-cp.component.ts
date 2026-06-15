import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CostService }       from '../../../cost/cost.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { CostCategoryDto }   from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-cp',
  standalone: true,
  imports: [FormsModule],
  template: `
<div class="space-y-6">

  <!-- Margin rate -->
  <div class="p-5 bg-white rounded-xl border border-[#eceef0]">
    <h4 class="text-sm font-semibold text-[#1d2b3e] mb-4">Taux de marge contractuel *</h4>
    <div class="flex items-center gap-4">
      <input type="number" step="0.01" min="0" max="200"
        [(ngModel)]="draft.marginRatePct"
        class="w-28 bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-center
               text-xl font-bold outline-none focus:ring-2 focus:ring-[rgba(26,107,124,0.3)]"/>
      <span class="text-xl font-bold text-[#1d2b3e]">%</span>
      <p class="text-xs text-[#44474c] max-w-xs">
        Verrouillé après la première facturation.
        Formule : Coût réel × (1 + taux/100)
      </p>
    </div>
  </div>

  <!-- Eligible cost categories -->
  <div>
    <h4 class="text-sm font-semibold text-[#1d2b3e] mb-1">Types de coûts éligibles *</h4>
    <p class="text-xs text-[#44474c] mb-4">
      Seuls les coûts des catégories cochées seront intégrés dans le calcul mensuel de facturation.
    </p>
    <div class="space-y-2">
      @for (cat of categories(); track cat.id) {
        <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer
                       hover:bg-[#f7f9fb] border border-[#eceef0] transition-colors">
          <input type="checkbox"
            [checked]="draft.eligibleCostCategoryIds.includes(cat.id)"
            (change)="toggleCategory(cat.id, $any($event.target).checked)"
            class="w-4 h-4 accent-[#1a6b7c] flex-shrink-0"/>
          <div class="flex-1">
            <span class="text-sm font-medium text-[#1d2b3e]">
              {{ cat.categoryNumber.toString().padStart(2, '0') }} — {{ cat.labelFr }}
            </span>
            @if (cat.descriptionFr) {
              <p class="text-xs text-[#75777d] mt-0.5">{{ cat.descriptionFr }}</p>
            }
          </div>
          @if (cat.sourceType !== 'MANUAL' && cat.sourceType !== null) {
            <span class="text-[10px] bg-[#ede9fe] text-[#5b21b6] px-2 py-0.5 rounded-full font-bold flex-shrink-0">
              Auto
            </span>
          }
        </label>
      }
      @if (categories().length === 0) {
        <p class="text-sm text-[#75777d] py-4 text-center">Chargement des catégories...</p>
      }
    </div>
  </div>

</div>
  `,
})
export class WizardStepCpComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly costSvc = inject(CostService);

  categories = signal<CostCategoryDto[]>([]);

  ngOnInit(): void {
    const paysId = Number(this.draft.paysId);
    if (paysId) {
      this.costSvc.getCategories(paysId).subscribe(c => this.categories.set(c));
    }
  }

  toggleCategory(id: number, checked: boolean): void {
    if (checked) {
      this.draft.eligibleCostCategoryIds = [...new Set([...this.draft.eligibleCostCategoryIds, id])];
    } else {
      this.draft.eligibleCostCategoryIds = this.draft.eligibleCostCategoryIds.filter(x => x !== id);
    }
    this.emit();
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, eligibleCostCategoryIds: [...this.draft.eligibleCostCategoryIds] });
  }
}
