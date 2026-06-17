import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState }  from '../../affaire-wizard.model';
import { ListValueDto }       from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-av',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ButtonComponent],
  templateUrl: './wizard-step-av.component.html',
  styleUrl: './wizard-step-av.component.scss',
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
