import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { FormFieldComponent } from '@khalilrebhiitec/daf360';

import { CostService }       from '../../../cost/cost.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { CostCategoryDto }   from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-cp',
  standalone: true,
  imports: [FormsModule, FormFieldComponent, TranslatePipe],
  templateUrl: './wizard-step-cp.component.html',
  styleUrl: './wizard-step-cp.component.scss',
})
export class WizardStepCpComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
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

  /** Called on margin-rate change so the parent draft signal (and step validation) updates. */
  emitChange(): void { this.emit(); }

  /** daf-form-field emits string | number | null; keep the numeric model then propagate. */
  onMarginChange(v: string | number | null): void {
    this.draft.marginRatePct = v === null || v === '' ? undefined : Number(v);
    this.emit();
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, eligibleCostCategoryIds: [...this.draft.eligibleCostCategoryIds] });
  }
}
