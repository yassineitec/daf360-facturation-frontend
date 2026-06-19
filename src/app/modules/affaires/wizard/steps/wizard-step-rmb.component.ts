import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FactListService }   from '../../../../core/fact-list.service';
import { AffaireDraftState } from '../../affaire-wizard.model';
import { ListValueDto }      from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-rmb',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './wizard-step-rmb.component.html',
  styleUrl: './wizard-step-rmb.component.scss',
})
export class WizardStepRmbComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
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
