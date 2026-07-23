import { Component, input, output, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AffaireService } from '../affaire.service';
import { CreateTsRequest } from '../affaire.model';

@Component({
  selector: 'app-ts-form',
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <div class="modal-overlay" (click)="onOverlay($event)">
      <div class="modal-box" role="dialog" aria-labelledby="ts-form-title">
        <div class="modal-header">
          <h2 id="ts-form-title">{{ 'AFFAIRES.ts.form.title' | translate }}</h2>
          <button class="close-btn" (click)="cancel()" [attr.aria-label]="'AFFAIRES.ts.close' | translate">&times;</button>
        </div>

        @if (serverError()) {
          <div class="server-error">{{ serverError() }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="modal-form" novalidate>
          <div class="field">
            <label for="ts-intitule">{{ 'AFFAIRES.ts.form.intitule' | translate }} *</label>
            <input id="ts-intitule" type="text" formControlName="intitule" [placeholder]="'AFFAIRES.ts.form.intitule_placeholder' | translate" maxlength="255" />
            @if (f['intitule'].touched && f['intitule'].errors?.['required']) {
              <span class="field-error">{{ 'AFFAIRES.ts.errors.required' | translate }}</span>
            }
          </div>

          <div class="form-row">
            <div class="field">
              <label for="ts-montant">{{ 'AFFAIRES.ts.form.montant' | translate }} *</label>
              <input id="ts-montant" type="number" formControlName="montantEstime" placeholder="0.00" min="0.01" step="0.01" />
              @if (f['montantEstime'].touched && f['montantEstime'].errors?.['required']) {
                <span class="field-error">{{ 'AFFAIRES.ts.errors.required' | translate }}</span>
              }
              @if (f['montantEstime'].touched && f['montantEstime'].errors?.['min']) {
                <span class="field-error">{{ 'AFFAIRES.ts.errors.min' | translate }}</span>
              }
            </div>
            <div class="field field--sm">
              <label for="ts-devise">{{ 'AFFAIRES.ts.form.devise' | translate }}</label>
              <select id="ts-devise" formControlName="devise">
                <option value="TND">TND</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="MAD">MAD</option>
                <option value="DZD">DZD</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label for="ts-perimetre">{{ 'AFFAIRES.ts.form.perimetre' | translate }}</label>
            <input id="ts-perimetre" type="text" formControlName="perimetre" [placeholder]="'AFFAIRES.ts.form.perimetre_placeholder' | translate" maxlength="500" />
          </div>

          <div class="field">
            <label for="ts-impact">{{ 'AFFAIRES.ts.form.impact' | translate }}</label>
            <input id="ts-impact" type="text" formControlName="impactBudgetaire" [placeholder]="'AFFAIRES.ts.form.impact_placeholder' | translate" maxlength="500" />
          </div>

          <div class="field">
            <label for="ts-description">{{ 'AFFAIRES.ts.form.description' | translate }}</label>
            <textarea id="ts-description" formControlName="description" rows="3" [placeholder]="'AFFAIRES.ts.form.description_placeholder' | translate" maxlength="2000"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" (click)="cancel()">{{ 'AFFAIRES.ts.actions.cancel' | translate }}</button>
            <button type="submit" class="btn-save" [disabled]="saving()">
              @if (saving()) { {{ 'AFFAIRES.ts.actions.saving' | translate }} } @else { {{ 'AFFAIRES.ts.form.create' | translate }} }
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styleUrl: './ts-form.component.scss',
})
export class TsFormComponent {
  affaireId   = input.required<number>();
  closed      = output<boolean>();

  private readonly svc = inject(AffaireService);
  private readonly fb  = inject(FormBuilder);
  private readonly translate = inject(TranslateService);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  form = this.fb.group({
    intitule:        ['', [Validators.required, Validators.maxLength(255)]],
    montantEstime:   [null as number | null, [Validators.required, Validators.min(0.01)]],
    devise:          ['TND'],
    perimetre:       [''],
    impactBudgetaire:[''],
    description:     [''],
  });

  get f() { return this.form.controls; }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const dto: CreateTsRequest = {
      intitule:         (v.intitule ?? '').trim(),
      montantEstime:    Number(v.montantEstime),
      devise:           v.devise ?? 'TND',
      perimetre:        v.perimetre?.trim()        || null,
      impactBudgetaire: v.impactBudgetaire?.trim() || null,
      description:      v.description?.trim()      || null,
    };

    this.svc.createTS(this.affaireId(), dto).subscribe({
      next:  () => { this.saving.set(false); this.closed.emit(true); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.ts.errors.create'));
      },
    });
  }

  cancel(): void { this.closed.emit(false); }

  onOverlay(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.cancel();
  }
}
