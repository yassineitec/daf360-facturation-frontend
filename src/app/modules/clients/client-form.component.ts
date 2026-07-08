import {
  Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed,
} from '@angular/core';
import { ClientService }        from './client.service';
import { ClientDetailDto, CreateClientRequest } from './client.model';
import { FormFieldComponent, SelectComponent, SelectOption, ButtonComponent } from '@khalilrebhiitec/daf360';

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
  imports: [FormFieldComponent, SelectComponent, ButtonComponent],
  templateUrl: './client-form.component.html',
  styleUrl: './client-form.component.scss',
})
export class ClientFormComponent implements OnInit, OnChanges {
  @Input() client?: ClientDetailDto;
  @Input() paysId!: number;
  @Input() activeSection: number = 0;
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
        this.svc.getSectors().subscribe({
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
