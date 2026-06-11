import { Component, OnInit, Output, EventEmitter, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AffaireService } from './affaire.service';
import { ClientDto, UserRefDto, PaysRefDto, CreateAffaireRequest } from './affaire.model';

@Component({
  selector: 'app-affaire-form',
  imports: [ReactiveFormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal-box" role="dialog" aria-labelledby="form-title">
        <div class="modal-header">
          <h2 id="form-title">Nouvelle affaire</h2>
          <button class="close-btn" (click)="cancel()" aria-label="Fermer">&times;</button>
        </div>

        @if (serverError()) {
          <div class="server-error">{{ serverError() }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="modal-form" novalidate>

          <div class="form-row">
            <div class="field">
              <label for="intitule">Intitulé *</label>
              <input id="intitule" type="text" formControlName="intitule" placeholder="Libellé de l'affaire" maxlength="255" />
              @if (f['intitule'].touched && f['intitule'].errors?.['required']) {
                <span class="field-error">Champ requis.</span>
              }
            </div>
            <div class="field field--sm">
              <label for="reference">Référence <span class="hint">(auto si vide)</span></label>
              <input id="reference" type="text" formControlName="reference" placeholder="AFF-2026-NNNN" maxlength="30" />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="clientId">Client *</label>
              <select id="clientId" formControlName="clientId">
                <option value="">— Sélectionner —</option>
                @for (c of clients(); track c.id) {
                  <option [value]="c.id">{{ c.raisonSociale }}</option>
                }
              </select>
              @if (f['clientId'].touched && f['clientId'].errors?.['required']) {
                <span class="field-error">Champ requis.</span>
              }
            </div>
            <div class="field">
              <label for="responsableId">Responsable *</label>
              <select id="responsableId" formControlName="responsableId">
                <option value="">— Sélectionner —</option>
                @for (u of users(); track u.id) {
                  <option [value]="u.id">{{ u.fullName }}</option>
                }
              </select>
              @if (f['responsableId'].touched && f['responsableId'].errors?.['required']) {
                <span class="field-error">Champ requis.</span>
              }
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="type">Type *</label>
              <select id="type" formControlName="type">
                <option value="">— Sélectionner —</option>
                <option value="FORFAIT">Forfait</option>
                <option value="REGIE">Régie</option>
                <option value="LUMP_SUM">Lump Sum</option>
              </select>
              @if (f['type'].touched && f['type'].errors?.['required']) {
                <span class="field-error">Champ requis.</span>
              }
            </div>
            <div class="field">
              <label for="paysId">Entité (pays) *</label>
              <select id="paysId" formControlName="paysId">
                <option value="">— Sélectionner —</option>
                @for (p of pays(); track p.id) {
                  <option [value]="p.id">{{ p.frenchLabel }}</option>
                }
              </select>
              @if (f['paysId'].touched && f['paysId'].errors?.['required']) {
                <span class="field-error">Champ requis.</span>
              }
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="dateDebut">Date début</label>
              <input id="dateDebut" type="date" formControlName="dateDebut" />
            </div>
            <div class="field">
              <label for="dateFin">Date fin</label>
              <input id="dateFin" type="date" formControlName="dateFin" />
            </div>
            <div class="field">
              <label for="budget">Budget prévisionnel</label>
              <input id="budget" type="number" formControlName="budgetPrevisionnel" placeholder="0" min="0" step="100" />
              @if (f['budgetPrevisionnel'].errors?.['min']) {
                <span class="field-error">Valeur minimale: 0.</span>
              }
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="doc360Ref">Réf. Doc360</label>
              <input id="doc360Ref" type="text" formControlName="doc360Ref" placeholder="DOC-XXXX" maxlength="100" />
            </div>
          </div>

          <div class="field">
            <label for="notes">Notes</label>
            <textarea id="notes" formControlName="notes" rows="3" placeholder="Informations complémentaires…" maxlength="1000"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" (click)="cancel()">Annuler</button>
            <button type="submit" class="btn-save" [disabled]="saving()">
              @if (saving()) { Enregistrement… } @else { Créer l'affaire }
            </button>
          </div>

        </form>
      </div>
    </div>
  `,
  styleUrl: './affaire-form.component.scss',
})
export class AffaireFormComponent implements OnInit {
  @Output() closed = new EventEmitter<boolean>();

  private readonly svc = inject(AffaireService);
  private readonly fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);
  clients = signal<ClientDto[]>([]);
  users   = signal<UserRefDto[]>([]);
  pays    = signal<PaysRefDto[]>([]);

  form!: FormGroup;
  get f() { return this.form.controls; }

  ngOnInit(): void {
    this.form = this.fb.group({
      intitule:          ['', [Validators.required, Validators.maxLength(255)]],
      reference:         [''],
      clientId:          ['', Validators.required],
      responsableId:     ['', Validators.required],
      type:              ['', Validators.required],
      paysId:            ['', Validators.required],
      dateDebut:         [null],
      dateFin:           [null],
      budgetPrevisionnel:[null, Validators.min(0)],
      doc360Ref:         [''],
      notes:             [''],
    });

    this.svc.getClients().subscribe(r => this.clients.set(r));
    this.svc.getUsers().subscribe(r => this.users.set(r));
    this.svc.getPays().subscribe(r => this.pays.set(r));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const dto: CreateAffaireRequest = {
      intitule:          v.intitule.trim(),
      reference:         v.reference?.trim() || null,
      clientId:          Number(v.clientId),
      responsableId:     Number(v.responsableId),
      type:              v.type,
      paysId:            Number(v.paysId),
      dateDebut:         v.dateDebut || null,
      dateFin:           v.dateFin   || null,
      budgetPrevisionnel:v.budgetPrevisionnel != null ? Number(v.budgetPrevisionnel) : null,
      doc360Ref:         v.doc360Ref?.trim() || null,
      notes:             v.notes?.trim()     || null,
    };

    this.svc.createAffaire(dto).subscribe({
      next:  () => { this.saving.set(false); this.closed.emit(true); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Une erreur est survenue. Veuillez réessayer.');
      },
    });
  }

  cancel(): void { this.closed.emit(false); }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.cancel();
  }
}
