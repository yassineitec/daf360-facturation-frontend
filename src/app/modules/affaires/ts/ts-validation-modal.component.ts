import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ValidationConfig {
  tsId:     number;
  step:     'technique' | 'commerciale';
  intitule: string;
  montant:  number;
  devise:   string;
}

@Component({
  selector: 'app-ts-validation-modal',
  imports: [FormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlay($event)">
      <div class="modal-box" role="dialog" aria-labelledby="val-title">
        <div class="modal-header">
          <h2 id="val-title">
            @if (config().step === 'technique') { Validation technique }
            @else { Validation commerciale }
          </h2>
          <button class="close-btn" (click)="cancelled.emit()" aria-label="Fermer">&times;</button>
        </div>

        <div class="modal-body">
          @if (config().step === 'commerciale') {
            <div class="confirm-banner">
              Cette action intégrera <strong>{{ formatAmount(config().montant, config().devise) }}</strong>
              au budget de l'affaire et ne peut pas être annulée.
            </div>
          }

          <div class="ts-info">
            <span class="ts-ref">{{ config().intitule }}</span>
            <span class="ts-amount">{{ formatAmount(config().montant, config().devise) }}</span>
          </div>

          <div class="field">
            <label for="val-notes">
              @if (config().step === 'technique') { Notes techniques (optionnel) }
              @else { Notes commerciales (optionnel) }
            </label>
            <textarea
              id="val-notes"
              [(ngModel)]="notes"
              rows="3"
              maxlength="1000"
              placeholder="Commentaires de validation…">
            </textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" (click)="cancelled.emit()">Annuler</button>
          <button class="btn-confirm" [class.btn-confirm--commercial]="config().step === 'commerciale'" (click)="confirm()">
            @if (config().step === 'technique') { Valider techniquement }
            @else { Valider commercialement }
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './ts-validation-modal.component.scss',
})
export class TsValidationModalComponent {
  config    = input.required<ValidationConfig>();
  confirmed = output<string | null>();
  cancelled = output<void>();

  notes = '';

  confirm(): void { this.confirmed.emit(this.notes.trim() || null); }

  onOverlay(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.cancelled.emit();
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
