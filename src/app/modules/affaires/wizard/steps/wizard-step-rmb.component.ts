import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FactListService }   from '../../../../core/fact-list.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { ListValueDto }      from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-rmb',
  standalone: true,
  imports: [FormsModule],
  template: `
<div class="space-y-4">

  <div class="p-4 bg-[#f0f4ff] rounded-xl flex gap-2 text-sm">
    <span class="material-symbols-outlined text-[#4648d4] text-base flex-shrink-0">info</span>
    <p class="text-[#1d2b3e]">
      Seules les catégories cochées seront disponibles pour les collaborateurs
      lors de la saisie des frais. La liste est configurable via l'administration.
    </p>
  </div>

  <div class="space-y-2">
    @for (cat of expenseCategories(); track cat.id) {
      <label class="flex items-center gap-3 p-4 rounded-xl cursor-pointer
                     hover:bg-[#f7f9fb] border border-[#eceef0] transition-colors">
        <input type="checkbox"
          [checked]="draft.eligibleExpenseCategoryIds.includes(cat.id)"
          (change)="toggleCategory(cat.id, $any($event.target).checked)"
          class="w-4 h-4 accent-[#1a6b7c] flex-shrink-0"/>
        <div class="flex items-center gap-3 flex-1">
          <span class="material-symbols-outlined text-[#1a6b7c] text-base"
            style="font-variation-settings:'FILL' 1">
            {{ getCategoryIcon(cat.code) }}
          </span>
          <span class="text-sm font-medium text-[#1d2b3e]">{{ cat.labelFr }}</span>
        </div>
      </label>
    }
    @if (expenseCategories().length === 0) {
      <p class="text-sm text-[#75777d] py-4 text-center">Chargement des catégories...</p>
    }
  </div>

</div>
  `,
})
export class WizardStepRmbComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly listSvc = inject(FactListService);

  expenseCategories = signal<ListValueDto[]>([]);

  ngOnInit(): void {
    const paysId = Number(this.draft.paysId);
    if (paysId) {
      this.listSvc.getListValues('EXPENSE_CATEGORY', paysId)
        .subscribe(c => this.expenseCategories.set(c));
    }
  }

  toggleCategory(id: number, checked: boolean): void {
    if (checked) {
      this.draft.eligibleExpenseCategoryIds = [...new Set([...this.draft.eligibleExpenseCategoryIds, id])];
    } else {
      this.draft.eligibleExpenseCategoryIds = this.draft.eligibleExpenseCategoryIds.filter(x => x !== id);
    }
    this.emit();
  }

  getCategoryIcon(code: string): string {
    const icons: Record<string, string> = {
      TRANSPORT:    'flight',
      HOTEL:        'hotel',
      RESTAURATION: 'restaurant',
      DIVERS:       'receipt_long',
    };
    return icons[code] ?? 'category';
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, eligibleExpenseCategoryIds: [...this.draft.eligibleExpenseCategoryIds] });
  }
}
