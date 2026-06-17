import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CostService }       from '../../../cost/cost.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { CostCategoryDto }   from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-cp',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './wizard-step-cp.component.html',
  styleUrl: './wizard-step-cp.component.scss',
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
