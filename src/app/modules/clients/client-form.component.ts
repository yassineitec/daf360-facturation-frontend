import {
  Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed,
} from '@angular/core';
import { ClientService }        from './client.service';
import { ClientDetailDto, CreateClientRequest } from './client.model';
import { FormFieldComponent, SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';

const DEFAULT_SECTORS = [
  'Agriculture', 'Agroalimentaire', 'BTP & Construction', 'Commerce de détail',
  'Commerce de gros', 'Éducation & Formation', 'Énergie & Utilities',
  'Finance & Banque', 'Hôtellerie & Tourisme', 'Immobilier',
  'Industrie & Manufacture', 'Informatique & Tech', 'Logistique & Transport',
  'Médias & Communication', 'Santé & Pharmacie', 'Services aux entreprises',
  'Télécommunications', 'Textile & Mode',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'TND', label: 'TND — Dinar tunisien' },
  { value: 'EGP', label: 'EGP — Livre égyptienne' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dollar américain' },
];

@Component({
  selector: 'app-client-form',
  imports: [FormFieldComponent, SelectComponent],
  template: `
    @if (serverError()) {
      <div class="px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 mb-4"
           style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c">
        <span class="material-symbols-outlined" style="font-size:1rem">error</span>
        {{ serverError() }}
      </div>
    }

    <!-- ── Section 1 : Identification ──────────────────────────────────────── -->
    <div class="form-section">
      <p class="section-label">Identification</p>

      <div class="flex flex-col gap-4">

        <div class="grid grid-cols-2 gap-4">
          <daf-form-field
            [value]="clientName()"
            (valueChange)="clientName.set(asStr($event))"
            [options]="{
              label: 'Nom du client',
              type: 'text',
              placeholder: 'Raison sociale',
              required: true,
              maxLength: 255,
              error: clientNameError()
            }" />

          <daf-form-field
            [value]="clientCode()"
            (valueChange)="clientCode.set(asStr($event))"
            [options]="{
              label: 'Code client',
              type: 'text',
              placeholder: 'TN-CLI-NNNN',
              hint: !isEditMode ? '(auto si vide)' : undefined,
              disabled: isEditMode,
              maxLength: 50
            }" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <daf-select
            [options]="sectorSelectOptions()"
            [(selected)]="selectedSector"
            [config]="sectorSelectConfig()" />

          <daf-form-field
            [value]="taxId()"
            (valueChange)="taxId.set(asStr($event))"
            [options]="{ label: 'N° fiscal / TVA', type: 'text', placeholder: 'MF-XXXXXXX', maxLength: 50 }" />
        </div>

        <div class="w-1/2">
          <daf-form-field
            [value]="country()"
            (valueChange)="country.set(asStr($event))"
            [options]="countryFieldOpts" />
        </div>

      </div>
    </div>

    <!-- ── Section 2 : Contact & Coordonnées ───────────────────────────────── -->
    <div class="form-section">
      <p class="section-label">Contact &amp; Coordonnées</p>

      <div class="flex flex-col gap-4">

        <daf-form-field
          [value]="address()"
          (valueChange)="address.set(asStr($event))"
          [options]="{ label: 'Adresse', type: 'text', placeholder: 'Rue, numéro…', maxLength: 255 }" />

        <div class="grid grid-cols-2 gap-4">
          <daf-form-field
            [value]="city()"
            (valueChange)="city.set(asStr($event))"
            [options]="{ label: 'Ville', type: 'text', placeholder: 'Ville', maxLength: 100 }" />

          <daf-form-field
            [value]="postalCode()"
            (valueChange)="postalCode.set(asStr($event))"
            [options]="{ label: 'Code postal', type: 'text', placeholder: '1000', maxLength: 20 }" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <daf-form-field
            [value]="phone()"
            (valueChange)="phone.set(asStr($event))"
            [options]="{ label: 'Téléphone', type: 'text', placeholder: '+216 XX XXX XXX', maxLength: 30 }" />

          <daf-form-field
            [value]="email()"
            (valueChange)="email.set(asStr($event))"
            [options]="{
              label: 'Email général',
              type: 'email',
              placeholder: 'contact@société.com',
              maxLength: 150,
              error: emailError()
            }" />
        </div>

        <daf-form-field
          [value]="website()"
          (valueChange)="website.set(asStr($event))"
          [options]="{ label: 'Site web', type: 'text', placeholder: 'https://www.société.com', maxLength: 200 }" />

        <daf-form-field
          [value]="contactName()"
          (valueChange)="contactName.set(asStr($event))"
          [options]="{ label: 'Nom du contact principal', type: 'text', placeholder: 'Prénom Nom', maxLength: 150 }" />

        <div class="grid grid-cols-2 gap-4">
          <daf-form-field
            [value]="contactEmail()"
            (valueChange)="contactEmail.set(asStr($event))"
            [options]="{
              label: 'Email contact',
              type: 'email',
              placeholder: 'contact@société.com',
              maxLength: 150,
              error: contactEmailError()
            }" />

          <daf-form-field
            [value]="contactPhone()"
            (valueChange)="contactPhone.set(asStr($event))"
            [options]="{ label: 'Tél. contact', type: 'text', placeholder: '+216 XX XXX XXX', maxLength: 30 }" />
        </div>

      </div>
    </div>

    <!-- ── Section 3 : Conditions commerciales ─────────────────────────────── -->
    <div class="form-section">
      <p class="section-label">Conditions commerciales</p>

      <div class="flex flex-col gap-4">

        <div class="grid grid-cols-2 gap-4">
          <daf-form-field
            [value]="paymentTermsDays()"
            (valueChange)="paymentTermsDays.set(asStr($event))"
            [options]="{
              label: 'Délai de paiement (jours)',
              type: 'number',
              placeholder: '30',
              error: paymentTermsError()
            }" />

          <daf-select
            [options]="currencyOptions"
            [(selected)]="selectedCurrency"
            [config]="currencySelectConfig" />
        </div>

        <daf-form-field
          [value]="notes()"
          (valueChange)="notes.set(asStr($event))"
          [options]="{ label: 'Notes internes', type: 'textarea', placeholder: 'Informations complémentaires…', maxLength: 1000, rows: 3 }" />

      </div>
    </div>

    <!-- ── Actions ─────────────────────────────────────────────────────────── -->
    <div class="flex items-center justify-end gap-3 pt-5">
      <button type="button"
        class="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer hover:bg-surface-container"
        style="background:none;border:none;color:var(--color-on-surface-variant)"
        (click)="cancel()">
        Annuler
      </button>
      <button type="button"
        class="inline-flex items-center gap-2 px-8 py-3 rounded-full text-base font-bold text-white transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        style="background:var(--color-secondary);box-shadow:0 4px 14px rgba(0,108,73,0.35)"
        [disabled]="saving()"
        (click)="submit()">
        @if (saving()) {
          <span class="material-symbols-outlined animate-spin" style="font-size:18px">progress_activity</span>
        }
        {{ isEditMode ? 'Enregistrer' : 'Créer le client' }}
      </button>
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

  // ── Form field signals ─────────────────────────────────────────────────────
  readonly clientName       = signal('');
  readonly clientCode       = signal('');
  readonly taxId            = signal('');
  readonly country          = signal('');
  readonly address          = signal('');
  readonly city             = signal('');
  readonly postalCode       = signal('');
  readonly phone            = signal('');
  readonly email            = signal('');
  readonly website          = signal('');
  readonly contactName      = signal('');
  readonly contactEmail     = signal('');
  readonly contactPhone     = signal('');
  readonly paymentTermsDays = signal('30');
  readonly notes            = signal('');

  // daf-select signals (always string[])
  readonly selectedSector   = signal<string[]>([]);
  readonly selectedCurrency = signal<string[]>(['TND']);

  // ── UI state ───────────────────────────────────────────────────────────────
  readonly saving         = signal(false);
  readonly serverError    = signal<string | null>(null);
  readonly sectors        = signal<string[]>([]);
  readonly loadingSectors = signal(false);
  readonly touched        = signal(false);

  // ── Select options ─────────────────────────────────────────────────────────
  readonly sectorSelectOptions = computed<SelectOption[]>(() =>
    this.sectors().map(s => ({ value: s, label: s }))
  );
  readonly currencyOptions: SelectOption[] = CURRENCY_OPTIONS;

  // ── Select configs ─────────────────────────────────────────────────────────
  readonly sectorSelectConfig = computed(() => ({
    label: "Secteur d'activité",
    placeholder: '— Sélectionner —',
    fullWidth: true,
    error: (this.touched() && !this.selectedSector()[0]) ? "Veuillez sélectionner un secteur d'activité." : undefined,
  }));
  readonly currencySelectConfig = { label: 'Devise par défaut', fullWidth: true };
  readonly countryFieldOpts     = { label: "Pays d'origine", type: 'text' as const, placeholder: 'Ex : Tunisie, France…', maxLength: 100 };

  // ── Computed errors ────────────────────────────────────────────────────────
  readonly clientNameError = computed(() => {
    if (!this.touched()) return '';
    const v = this.clientName().trim();
    if (!v) return 'Champ requis.';
    if (v.length < 2) return 'Minimum 2 caractères.';
    return '';
  });

  readonly emailError = computed(() => {
    if (!this.touched()) return '';
    const v = this.email();
    if (v && !EMAIL_RE.test(v)) return 'Email invalide.';
    return '';
  });

  readonly contactEmailError = computed(() => {
    if (!this.touched()) return '';
    const v = this.contactEmail();
    if (v && !EMAIL_RE.test(v)) return 'Email invalide.';
    return '';
  });

  readonly paymentTermsError = computed(() => {
    if (!this.touched()) return '';
    const n = Number(this.paymentTermsDays());
    if (this.paymentTermsDays() !== '' && (n < 0 || n > 365)) return 'Entre 0 et 365 jours.';
    return '';
  });

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
    if (c) {
      this.clientName.set(c.clientName ?? '');
      this.clientCode.set(c.clientCode ?? '');
      this.selectedSector.set(c.sector ? [c.sector] : []);
      this.taxId.set(c.taxId ?? '');
      this.country.set(c.country ?? '');
      this.address.set(c.address ?? '');
      this.city.set(c.city ?? '');
      this.postalCode.set(c.postalCode ?? '');
      this.phone.set(c.phone ?? '');
      this.email.set(c.email ?? '');
      this.website.set(c.website ?? '');
      this.contactName.set(c.contactName ?? '');
      this.contactEmail.set(c.contactEmail ?? '');
      this.contactPhone.set(c.contactPhone ?? '');
      this.paymentTermsDays.set(c.paymentTermsDays != null ? String(c.paymentTermsDays) : '30');
      this.selectedCurrency.set([c.defaultCurrency ?? 'TND']);
      this.notes.set(c.notes ?? '');
    }
  }

  submit(): void {
    this.touched.set(true);
    if (this.clientNameError() || this.emailError() || this.contactEmailError() || this.paymentTermsError()
        || !this.selectedSector()[0]) return;

    this.saving.set(true);
    this.serverError.set(null);

    const days = this.paymentTermsDays();
    const dto: Partial<CreateClientRequest> = {
      clientName:       this.clientName().trim(),
      clientCode:       this.clientCode().trim()     || null,
      sector:           this.selectedSector()[0]     || null,
      taxId:            this.taxId().trim()           || null,
      country:          this.country().trim()         || null,
      address:          this.address().trim()         || null,
      city:             this.city().trim()            || null,
      postalCode:       this.postalCode().trim()      || null,
      phone:            this.phone().trim()           || null,
      email:            this.email().trim()           || null,
      website:          this.website().trim()         || null,
      contactName:      this.contactName().trim()     || null,
      contactEmail:     this.contactEmail().trim()    || null,
      contactPhone:     this.contactPhone().trim()    || null,
      paymentTermsDays: days !== '' ? Number(days) : null,
      defaultCurrency:  this.selectedCurrency()[0]   || null,
      notes:            this.notes().trim()           || null,
    };

    const obs = this.isEditMode
      ? this.svc.updateClient(this.client!.id, dto)
      : this.svc.createClient({ ...dto, paysId: this.paysId } as CreateClientRequest);

    obs.subscribe({
      next: result => { this.saving.set(false); this.saved.emit(result); },
      error: err   => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Une erreur est survenue. Veuillez réessayer.');
      },
    });
  }

  cancel(): void { this.closed.emit(); }

  asStr(v: string | number | null): string { return v != null ? String(v) : ''; }
}
