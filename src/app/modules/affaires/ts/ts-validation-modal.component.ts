import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { BodyPortalDirective } from '../../../shared/body-portal.directive';

export interface ValidationConfig {
  tsId:     number;
  step:     'technique' | 'commerciale';
  intitule: string;
  montant:  number;
  devise:   string;
}

@Component({
  selector: 'app-ts-validation-modal',
  imports: [FormsModule, BodyPortalDirective, TranslatePipe],
  template: `
    <div class="modal-overlay" appBodyPortal (click)="onOverlay($event)">
      <div class="modal-box" role="dialog" aria-labelledby="val-title">
        <div class="modal-header">
          <h2 id="val-title">
            @if (config().step === 'technique') { {{ 'AFFAIRES.ts.validation.title_technique' | translate }} }
            @else { {{ 'AFFAIRES.ts.validation.title_commerciale' | translate }} }
          </h2>
          <button class="close-btn" (click)="cancelled.emit()" [attr.aria-label]="'AFFAIRES.ts.close' | translate">&times;</button>
        </div>

        <div class="modal-body">
          @if (config().step === 'commerciale') {
            <div class="confirm-banner">
              {{ 'AFFAIRES.ts.validation.banner_before' | translate }} <strong>{{ formatAmount(config().montant, config().devise) }}</strong>
              {{ 'AFFAIRES.ts.validation.banner_after' | translate }}
            </div>
          }

          <div class="ts-info">
            <span class="ts-ref">{{ config().intitule }}</span>
            <span class="ts-amount">{{ formatAmount(config().montant, config().devise) }}</span>
          </div>

          <div class="field">
            <label for="val-notes">
              @if (config().step === 'technique') { {{ 'AFFAIRES.ts.validation.notes_technique' | translate }} }
              @else { {{ 'AFFAIRES.ts.validation.notes_commerciale' | translate }} }
            </label>
            <textarea
              id="val-notes"
              [(ngModel)]="notes"
              rows="3"
              maxlength="1000"
              [placeholder]="'AFFAIRES.ts.validation.notes_placeholder' | translate">
            </textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" (click)="cancelled.emit()">{{ 'AFFAIRES.ts.actions.cancel' | translate }}</button>
          <button class="btn-confirm" [class.btn-confirm--commercial]="config().step === 'commerciale'" (click)="confirm()">
            @if (config().step === 'technique') { {{ 'AFFAIRES.ts.validation.confirm_technique' | translate }} }
            @else { {{ 'AFFAIRES.ts.validation.confirm_commerciale' | translate }} }
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
