import {
  Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, inject, signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ClientService }                from './client.service';
import { ClientDetailDto, CreateClientRequest } from './client.model';

const DEFAULT_SECTORS = [
  'Agriculture', 'Agroalimentaire', 'BTP & Construction', 'Commerce de détail',
  'Commerce de gros', 'Éducation & Formation', 'Énergie & Utilities',
  'Finance & Banque', 'Hôtellerie & Tourisme', 'Immobilier',
  'Industrie & Manufacture', 'Informatique & Tech', 'Logistique & Transport',
  'Médias & Communication', 'Santé & Pharmacie', 'Services aux entreprises',
  'Télécommunications', 'Textile & Mode',
];

@Component({
  selector: 'app-client-form',
  imports: [ReactiveFormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal-box" role="dialog" aria-modal="true"
           [attr.aria-label]="isEditMode ? 'Modifier le client' : 'Nouveau client'">

        <!-- Sticky header -->
        <div class="modal-header">
          <h2>{{ isEditMode ? 'Modifier ' + client!.clientName : 'Nouveau client' }}</h2>
          <button class="close-btn" (click)="cancel()" aria-label="Fermer">&times;</button>
        </div>

        <!-- Scrollable body -->
        <div class="modal-body">

          @if (serverError()) {
            <div class="server-error">{{ serverError() }}</div>
          }

          <form [formGroup]="form" (ngSubmit)="submit()" novalidate id="client-form">

            <!-- ── Section 1: Identification ──────────────────────────── -->
            <div class="form-section">
              <h3 class="section-title">Identification</h3>

              <div class="form-row">
                <div class="field">
                  <label for="clientName">Nom du client *</label>
                  <input id="clientName" type="text" formControlName="clientName"
                         placeholder="Raison sociale" maxlength="255" />
                  @if (f['clientName'].touched && f['clientName'].errors?.['required']) {
                    <span class="field-error">Champ requis.</span>
                  }
                  @if (f['clientName'].touched && f['clientName'].errors?.['minlength']) {
                    <span class="field-error">Minimum 2 caractères.</span>
                  }
                </div>
                <div class="field field--sm">
                  <label for="clientCode">
                    Code client
                    @if (!isEditMode) {
                      <span class="hint">(auto si vide)</span>
                    }
                  </label>
                  <input id="clientCode" type="text" formControlName="clientCode"
                         placeholder="TN-CLI-NNNN" maxlength="50"
                         style="font-family:'Courier New',monospace" />
                </div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label for="sector">Secteur d'activité</label>
                  @if (loadingSectors()) {
                    <select id="sector" disabled>
                      <option>Chargement…</option>
                    </select>
                  } @else {
                    <select id="sector" formControlName="sector">
                      <option value="">— Sélectionner un secteur —</option>
                      @for (s of sectors(); track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                  }
                </div>
                <div class="field">
                  <label for="taxId">N° fiscal / TVA</label>
                  <input id="taxId" type="text" formControlName="taxId"
                         placeholder="MF-XXXXXXX" maxlength="50"
                         style="font-family:'Courier New',monospace" />
                </div>
              </div>

              <div class="field field--half">
                <label for="country">Pays d'origine</label>
                <input id="country" type="text" formControlName="country"
                       placeholder="Ex : Tunisie, France…" maxlength="100" />
              </div>
            </div>

            <!-- ── Section 2: Contact & Coordonnées ───────────────────── -->
            <div class="form-section">
              <h3 class="section-title">Contact &amp; Coordonnées</h3>

              <div class="field">
                <label for="address">Adresse</label>
                <input id="address" type="text" formControlName="address"
                       placeholder="Rue, numéro…" maxlength="255" />
              </div>

              <div class="form-row">
                <div class="field">
                  <label for="city">Ville</label>
                  <input id="city" type="text" formControlName="city"
                         placeholder="Ville" maxlength="100" />
                </div>
                <div class="field field--sm">
                  <label for="postalCode">Code postal</label>
                  <input id="postalCode" type="text" formControlName="postalCode"
                         placeholder="1000" maxlength="20" />
                </div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label for="phone">Téléphone</label>
                  <input id="phone" type="tel" formControlName="phone"
                         placeholder="+216 XX XXX XXX" maxlength="30" />
                </div>
                <div class="field">
                  <label for="email">Email général</label>
                  <input id="email" type="email" formControlName="email"
                         placeholder="contact@société.com" maxlength="150" />
                  @if (f['email'].touched && f['email'].errors?.['email']) {
                    <span class="field-error">Email invalide.</span>
                  }
                </div>
              </div>

              <div class="field">
                <label for="website">Site web</label>
                <input id="website" type="url" formControlName="website"
                       placeholder="https://www.société.com" maxlength="200" />
              </div>

              <div class="field">
                <label for="contactName">Nom du contact principal</label>
                <input id="contactName" type="text" formControlName="contactName"
                       placeholder="Prénom Nom" maxlength="150" />
              </div>

              <div class="form-row">
                <div class="field">
                  <label for="contactEmail">Email contact</label>
                  <input id="contactEmail" type="email" formControlName="contactEmail"
                         placeholder="contact@société.com" maxlength="150" />
                  @if (f['contactEmail'].touched && f['contactEmail'].errors?.['email']) {
                    <span class="field-error">Email invalide.</span>
                  }
                </div>
                <div class="field">
                  <label for="contactPhone">Tél. contact</label>
                  <input id="contactPhone" type="tel" formControlName="contactPhone"
                         placeholder="+216 XX XXX XXX" maxlength="30" />
                </div>
              </div>
            </div>

            <!-- ── Section 3: Conditions commerciales ─────────────────── -->
            <div class="form-section">
              <h3 class="section-title">Conditions commerciales</h3>

              <div class="form-row">
                <div class="field field--sm">
                  <label for="paymentTermsDays">Délai de paiement (jours)</label>
                  <input id="paymentTermsDays" type="number"
                         formControlName="paymentTermsDays"
                         placeholder="30" min="0" max="365" step="1" />
                  @if (f['paymentTermsDays'].errors?.['min']) {
                    <span class="field-error">Minimum 0 jours.</span>
                  }
                  @if (f['paymentTermsDays'].errors?.['max']) {
                    <span class="field-error">Maximum 365 jours.</span>
                  }
                </div>
                <div class="field field--sm">
                  <label for="defaultCurrency">Devise par défaut</label>
                  <select id="defaultCurrency" formControlName="defaultCurrency">
                    <option value="TND">TND — Dinar tunisien</option>
                    <option value="EGP">EGP — Livre égyptienne</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — Dollar américain</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <label for="notes">Notes internes</label>
                <textarea id="notes" formControlName="notes" rows="3"
                          placeholder="Informations complémentaires…"
                          maxlength="1000"></textarea>
              </div>
            </div>

          </form>
        </div>

        <!-- Sticky footer -->
        <div class="modal-footer">
          <button type="button" class="btn-cancel" (click)="cancel()">Annuler</button>
          <button type="submit" form="client-form" class="btn-save" [disabled]="saving()">
            @if (saving()) { Enregistrement… } @else { {{ isEditMode ? 'Enregistrer' : 'Créer le client' }} }
          </button>
        </div>

      </div>
    </div>
  `,
  styleUrl: './client-form.component.scss',
})
export class ClientFormComponent implements OnInit, OnChanges {
  @Input() client?: ClientDetailDto;
  @Input() paysId!: number;
  @Output() saved  = new EventEmitter<ClientDetailDto>();
  @Output() closed = new EventEmitter<void>();

  private readonly svc = inject(ClientService);
  private readonly fb  = inject(FormBuilder);

  saving         = signal(false);
  serverError    = signal<string | null>(null);
  sectors        = signal<string[]>([]);
  loadingSectors = signal(false);

  form!: FormGroup;
  get f() { return this.form.controls; }

  get isEditMode(): boolean { return !!this.client; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['paysId']) {
      const effectiveId: number = this.client?.paysId ?? changes['paysId'].currentValue;
      if (effectiveId) {
        this.loadingSectors.set(true);
        this.svc.getSectors(effectiveId).subscribe({
          next:  s  => { this.sectors.set(s.length ? s : DEFAULT_SECTORS); this.loadingSectors.set(false); },
          error: () => { this.sectors.set(DEFAULT_SECTORS); this.loadingSectors.set(false); },
        });
      } else {
        this.sectors.set(DEFAULT_SECTORS);
      }
    }
  }

  ngOnInit(): void {
    const c = this.client;
    this.form = this.fb.group({
      clientName:        [c?.clientName ?? '',  [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
      clientCode:        [{ value: c?.clientCode ?? '', disabled: this.isEditMode }],
      sector:            [c?.sector ?? ''],
      taxId:             [c?.taxId ?? ''],
      country:           [c?.country ?? ''],
      address:           [c?.address ?? ''],
      city:              [c?.city ?? ''],
      postalCode:        [c?.postalCode ?? ''],
      phone:             [c?.phone ?? ''],
      email:             [c?.email ?? '',        [Validators.email]],
      website:           [c?.website ?? ''],
      contactName:       [c?.contactName ?? ''],
      contactEmail:      [c?.contactEmail ?? '', [Validators.email]],
      contactPhone:      [c?.contactPhone ?? ''],
      paymentTermsDays:  [c?.paymentTermsDays ?? 30, [Validators.min(0), Validators.max(365)]],
      defaultCurrency:   [c?.defaultCurrency ?? 'TND'],
      notes:             [c?.notes ?? ''],
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const dto: Partial<CreateClientRequest> = {
      clientName:       v.clientName.trim(),
      clientCode:       v.clientCode?.trim()     || null,
      sector:           v.sector?.trim()         || null,
      taxId:            v.taxId?.trim()          || null,
      country:          v.country?.trim()        || null,
      address:          v.address?.trim()        || null,
      city:             v.city?.trim()           || null,
      postalCode:       v.postalCode?.trim()     || null,
      phone:            v.phone?.trim()          || null,
      email:            v.email?.trim()          || null,
      website:          v.website?.trim()        || null,
      contactName:      v.contactName?.trim()    || null,
      contactEmail:     v.contactEmail?.trim()   || null,
      contactPhone:     v.contactPhone?.trim()   || null,
      paymentTermsDays: v.paymentTermsDays != null ? Number(v.paymentTermsDays) : null,
      defaultCurrency:  v.defaultCurrency        || null,
      notes:            v.notes?.trim()          || null,
    };

    const obs = this.isEditMode
      ? this.svc.updateClient(this.client!.id, dto)
      : this.svc.createClient({ ...dto, paysId: this.paysId } as CreateClientRequest);

    obs.subscribe({
      next: result => {
        this.saving.set(false);
        this.saved.emit(result);
      },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Une erreur est survenue. Veuillez réessayer.');
      },
    });
  }

  cancel(): void { this.closed.emit(); }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.cancel();
  }
}
