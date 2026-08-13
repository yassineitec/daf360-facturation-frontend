import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { FormFieldComponent, MultiDatePickerComponent } from '@khalilrebhiitec/daf360';
import { AffaireDraftState } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-planning',
  standalone: true,
  imports: [DatePipe, FormFieldComponent, MultiDatePickerComponent, TranslatePipe],
  templateUrl: './wizard-step-planning.component.html',
  styleUrl: './wizard-step-planning.component.scss',
})
export class WizardStepPlanningComponent {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  // daf-multi-date-picker works with Date values; the draft stores ISO (yyyy-MM-dd)
  // strings, so each field bridges Date <-> ISO via these accessors.

  get dateDebutFacturation(): Date | null { return this.toDate(this.draft.dateDebutFacturation); }
  set dateDebutFacturation(v: Date | Date[] | null) {
    this.draft.dateDebutFacturation = this.toIso(v);
    this.recomputeEndDate();
    this.emit();
  }

  get dateFinContractuelle(): Date | null { return this.toDate(this.draft.dateFinContractuelle); }

  get datePremireEcheance(): Date | null { return this.toDate(this.draft.datePremireEcheance); }
  set datePremireEcheance(v: Date | Date[] | null) { this.draft.datePremireEcheance = this.toIso(v); this.emit(); }

  /** Durée en mois — c'est la saisie, la date de fin n'en est que la conséquence. */
  get dureeMois(): number | null { return this.draft.dureeMois ?? null; }

  onDureeChange(v: unknown): void {
    const n = Number(v);
    this.draft.dureeMois = Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
    this.recomputeEndDate();
    this.emit();
  }

  /** Ce qu'affiche le champ de fin, figé : la date calculée ou un tiret. */
  get dateFinDisplay(): string | null {
    return this.draft.dateFinContractuelle ?? null;
  }

  /**
   * Fin contractuelle = début de facturation + durée, moins un jour.
   *
   * Le « moins un jour » n'est pas un détail : un contrat de 12 mois démarré le 1er mars
   * court jusqu'au 28 février, pas jusqu'au 1er mars — sans quoi deux contrats consécutifs
   * se chevaucheraient d'une journée, et une durée de 12 mois en couvrirait 12 et 1 jour.
   *
   * `setMonth` sur un 31 dans un mois de 30 jours déborde sur le mois suivant (31 janvier
   * + 1 mois → 3 mars) : on replie donc explicitement sur le dernier jour du mois visé.
   */
  private recomputeEndDate(): void {
    const start = this.toDate(this.draft.dateDebutFacturation);
    const months = this.draft.dureeMois;
    if (!start || !months || months <= 0) {
      this.draft.dateFinContractuelle = undefined;
      return;
    }
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const targetMonth = end.getMonth() + months;
    end.setDate(1);
    end.setMonth(targetMonth);
    const lastDayOfTarget = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(start.getDate(), lastDayOfTarget));
    end.setDate(end.getDate() - 1);
    this.draft.dateFinContractuelle = this.toIso(end);
  }

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
