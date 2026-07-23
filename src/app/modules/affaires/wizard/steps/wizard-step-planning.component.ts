import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { MultiDatePickerComponent } from '@khalilrebhiitec/daf360';
import { AffaireDraftState } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-planning',
  standalone: true,
  imports: [DatePipe, MultiDatePickerComponent, TranslatePipe],
  templateUrl: './wizard-step-planning.component.html',
  styleUrl: './wizard-step-planning.component.scss',
})
export class WizardStepPlanningComponent {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  // daf-multi-date-picker works with Date values; the draft stores ISO (yyyy-MM-dd)
  // strings, so each field bridges Date <-> ISO via these accessors.

  get dateDebutFacturation(): Date | null { return this.toDate(this.draft.dateDebutFacturation); }
  set dateDebutFacturation(v: Date | Date[] | null) { this.draft.dateDebutFacturation = this.toIso(v); this.emit(); }

  get dateFinContractuelle(): Date | null { return this.toDate(this.draft.dateFinContractuelle); }
  set dateFinContractuelle(v: Date | Date[] | null) { this.draft.dateFinContractuelle = this.toIso(v); this.emit(); }

  get datePremireEcheance(): Date | null { return this.toDate(this.draft.datePremireEcheance); }
  set datePremireEcheance(v: Date | Date[] | null) { this.draft.datePremireEcheance = this.toIso(v); this.emit(); }

  private toDate(iso?: string | null): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  private toIso(v: Date | Date[] | null): string | undefined {
    const d = Array.isArray(v) ? v[0] : v;
    if (!d) return undefined;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  emit(): void { this.draftChange.emit({ ...this.draft }); }
}
