import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { ButtonComponent, SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState }  from '../../affaire-wizard.model';
import { ListValueDto }       from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-av',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ButtonComponent, SelectComponent, FormFieldComponent, TranslatePipe],
  templateUrl: './wizard-step-av.component.html',
  styleUrl: './wizard-step-av.component.scss',
})
export class WizardStepAvComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly listSvc = inject(FactListService);

  repartitionTypes = signal<ListValueDto[]>([]);

  // daf-select option list for the repartition type picker.
  readonly repartitionTypeOptions = computed<SelectOption[]>(() =>
    this.repartitionTypes().map(t => ({ value: String(t.id), label: t.labelFr })));

  // daf-select emits string[]; bridge back to the numeric model + total recompute.
  onTypeChange(r: AffaireDraftState['repartitions'][0], values: string[]): void {
    r.repartitionTypeId = values[0] ? Number(values[0]) : 0;
    // Le libellé est mémorisé avec l'id : le récapitulatif n'a pas le référentiel sous la
    // main et affichait « Type #3 » à la place de « CTR ». En relecture d'un brouillon il
    // arrive déjà résolu par le backend (AffaireDraftDto.CtrBpeTqcDto.label) — ici on
    // couvre le cas création.
    r.label = this.repartitionTypes().find(t => t.id === r.repartitionTypeId)?.labelFr;
    this.updateTotal();
  }

  // daf-form-field emits string | number | null; keep the numeric model + total recompute.
  onPercentageChange(r: AffaireDraftState['repartitions'][0], v: string | number | null): void {
    r.percentage = v === null || v === '' ? 0 : Number(v);
    this.updateTotal();
  }

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
