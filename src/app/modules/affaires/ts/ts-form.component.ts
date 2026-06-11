import { Component, OnInit, input, output, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AffaireService } from '../affaire.service';
import { CreateTsRequest } from '../affaire.model';

@Component({
  selector: 'app-ts-form',
  imports: [ReactiveFormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlay($event)">
      <div class="modal-box" role="dialog" aria-labelledby="ts-form-title">
        <div class="modal-header">
          <h2 id="ts-form-title">Nouveau travail supplémentaire</h2>
          <button class="close-btn" (click)="cancel()" aria-label="Fermer">&times;</button>
        </div>

        @if (serverError()) {
          <div class="server-error">{{ serverError() }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="modal-form" novalidate>
          <div class="field">
            <label for="ts-intitule">Intitulé *</label>
            <input id="ts-intitule" type="text" formControlName="intitule" placeholder="Description du TS" maxlength="255" />
            @if (f['intitule'].touched && f['intitule'].errors?.['required']) {
              <span class="field-error">Champ requis.</span>
            }
          </div>

          <div class="form-row">
            <div class="field">
              <label for="ts-montant">Montant *</label>
              <input id="ts-montant" type="number" formControlName="montant" placeholder="0.00" min="0.01" step="0.01" />
              @if (f['montant'].touched && f['montant'].errors?.['required']) {
                <span class="field-error">Champ requis.</span>
              }
              @if (f['montant'].touched && f['montant'].errors?.['min']) {
                <span class="field-error">Doit être supérieur à 0.</span>
              }
            </div>
            <div class="field field--sm">
              <label for="ts-devise">Devise</label>
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
            <label for="ts-perimetre">Périmètre</label>
            <input id="ts-perimetre" type="text" formControlName="perimetre" placeholder="Périmètre d'intervention" maxlength="500" />
          </div>

          <div class="field">
            <label for="ts-impact">Impact budgétaire</label>
            <input id="ts-impact" type="text" formControlName="impactBudgetaire" placeholder="Impact sur le budget de l'affaire" maxlength="500" />
          </div>

          <div class="field">
            <label for="ts-description">Description</label>
            <textarea id="ts-description" formControlName="description" rows="3" placeholder="Détails complémentaires…" maxlength="2000"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" (click)="cancel()">Annuler</button>
            <button type="submit" class="btn-save" [disabled]="saving()">
              @if (saving()) { Enregistrement… } @else { Créer le TS }
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styleUrl: './ts-form.component.scss',
})
export class TsFormComponent implements OnInit {
  affaireId   = input.required<number>();
  closed      = output<boolean>();

  private readonly svc = inject(AffaireService);
  private readonly fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);
  form!: FormGroup;
  get f() { return this.form.controls; }

  ngOnInit(): void {
    this.form = this.fb.group({
      intitule:        ['', [Validators.required, Validators.maxLength(255)]],
      montant:         [null, [Validators.required, Validators.min(0.01)]],
      devise:          ['TND'],
      perimetre:       [''],
      impactBudgetaire:[''],
      description:     [''],
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const dto: CreateTsRequest = {
      intitule:         v.intitule.trim(),
      montant:          Number(v.montant),
      devise:           v.devise,
      perimetre:        v.perimetre?.trim()        || null,
      impactBudgetaire: v.impactBudgetaire?.trim() || null,
      description:      v.description?.trim()      || null,
    };

    this.svc.createTS(this.affaireId(), dto).subscribe({
      next:  () => { this.saving.set(false); this.closed.emit(true); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Erreur lors de la création.');
      },
    });
  }

  cancel(): void { this.closed.emit(false); }

  onOverlay(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.cancel();
  }
}
