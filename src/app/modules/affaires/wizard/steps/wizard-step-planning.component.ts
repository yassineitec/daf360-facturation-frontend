import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AffaireDraftState } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-planning',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './wizard-step-planning.component.html',
  styleUrl: './wizard-step-planning.component.scss',
})
export class WizardStepPlanningComponent {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  get dateDebutFacturation(): string | number | null { return this.draft.dateDebutFacturation ?? null; }
  set dateDebutFacturation(v: string | number | null) { this.draft.dateDebutFacturation = (v as string) || undefined; }

  get dateFinContractuelle(): string | number | null { return this.draft.dateFinContractuelle ?? null; }
  set dateFinContractuelle(v: string | number | null) { this.draft.dateFinContractuelle = (v as string) || undefined; }

  get datePremireEcheance(): string | number | null { return this.draft.datePremireEcheance ?? null; }
  set datePremireEcheance(v: string | number | null) { this.draft.datePremireEcheance = (v as string) || undefined; }

  emit(): void { this.draftChange.emit({ ...this.draft }); }
}
