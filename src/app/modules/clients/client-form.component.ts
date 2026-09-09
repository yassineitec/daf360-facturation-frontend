import {
  Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed,
} from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { of, switchMap } from 'rxjs';
import { ClientService }        from './client.service';
import { ClientDetailDto, CreateClientRequest } from './client.model';
import { PaysRefDto } from '../affaires/affaire.model';
import { ContactEditorComponent } from './contacts/contact-editor.component';
import { ClientContactService }   from './contacts/client-contact.service';
import { ContactDraft, toContactDraft } from './contacts/client-contact.model';
import {
  ButtonComponent, FieldMessageComponent, FormFieldComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';

/**
 * Les secteurs proposés d'office, indépendamment de ce que contient la base.
 *
 * `GET /clients/sectors` ne renvoie QUE les secteurs déjà saisis sur des clients
 * existants : c'est un `distinct` sur une colonne libre, pas un référentiel. Seul,
 * il laisse la liste vide au premier client et n'offre jamais un secteur métier
 * tant que personne ne l'a tapé — d'où cette liste, fusionnée avec celle du back.
 */
const CURATED_SECTORS = [
  'Administrations et organismes publics',
  'Agriculture', 'Agroalimentaire',
  'Architectes et cabinets d’ingénierie',
  'BTP & Construction', 'Commerce de détail', 'Commerce de gros',
  'Éducation & Formation', 'Énergie & Utilities',
  'Entreprises de construction / EPC',
  'Entreprises de traitement de l’eau',
  'Entreprises de travaux publics',
  'Entreprises industrielles',
  'Finance & Banque', 'Hôtellerie & Tourisme', 'Immobilier',
  'Industrie & Manufacture', 'Informatique & Tech',
  'Investisseurs et développeurs de projets',
  'Logistique & Transport', 'Médias & Communication',
  'Opérateurs de transport', 'Opérateurs énergétiques', 'Opérateurs Oil & Gas',
  'Promoteurs immobiliers',
  'Santé & Pharmacie', 'Services aux entreprises',
  'Sociétés minières',
  'Télécommunications', 'Textile & Mode',
];

/**
 * Fusionne les secteurs du référentiel figé et ceux remontés de la base, sans doublon.
 *
 * Le dédoublonnage ignore la casse et les espaces de bord : un client enregistré avec
 * « immobilier » ne doit pas créer une seconde ligne à côté d'« Immobilier ». En cas de
 * collision, c'est l'orthographe de {@link CURATED_SECTORS} qui l'emporte, puisqu'elle
 * est passée en premier.
 */
function mergeSectors(...lists: (readonly (string | null | undefined)[])[]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const value = raw?.trim();
      if (!value) continue;
      const key = value.toLocaleLowerCase('fr');
      if (!seen.has(key)) seen.set(key, value);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CURRENCY_CODES = ['TND', 'EGP', 'EUR', 'USD'];

@Component({
  selector: 'app-client-form',
  imports: [
    FormFieldComponent, SelectComponent, ButtonComponent, FieldMessageComponent, TranslatePipe,
    ContactEditorComponent,
  ],
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
  private readonly contactSvc = inject(ClientContactService);
  private readonly translate = inject(TranslateService);

  // ── Form field signals ─────────────────────────────────────────────────────
  readonly clientName       = signal('');
  readonly clientCode       = signal('');
  readonly taxId            = signal('');
  /** L'identifiant du pays du client (`pays_ref.id`), en chaîne pour le `daf-select`. */
  readonly countryId        = signal('');
  readonly address          = signal('');
  readonly city             = signal('');
  readonly postalCode       = signal('');
  readonly website          = signal('');
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
  /** Référentiel des pays, pour la liste déroulante « Pays ». */
  readonly paysList       = signal<PaysRefDto[]>([]);

  // ── Contacts ───────────────────────────────────────────────────────────────
  // Les trois champs `contactName` / `contactEmail` / `contactPhone` ont disparu :
  // un client a plusieurs interlocuteurs (finance, ingénierie, administratif…) et
  // trois colonnes plates n'en tenaient qu'un — le second écrasait le premier.

  readonly contacts = signal<ContactDraft[]>([]);

  /**
   * L'état des contacts AU CHARGEMENT, en modification. C'est la comparaison avec
   * `contacts()` qui dit lesquels ont été retirés de la liste : sans cette photo, une
   * ligne supprimée à l'écran resterait en base.
   */
  private initialContacts: ContactDraft[] = [];

  // ── Select options ─────────────────────────────────────────────────────────
  readonly sectorSelectOptions = computed<SelectOption[]>(() =>
    this.sectors().map(s => ({ value: s, label: s }))
  );
  readonly currencyOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return CURRENCY_CODES.map(code => ({
      value: code,
      label: this.translate.instant(`CLIENTS.FORM.CURRENCY.${code}`),
    }));
  });

  // ── Select configs ─────────────────────────────────────────────────────────
  readonly sectorSelectConfig = computed(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('CLIENTS.FORM.SECTOR_LABEL'),
      placeholder: this.translate.instant('CLIENTS.FORM.SECTOR_PLACEHOLDER'),
      fullWidth: true,
      // Une trentaine d'entrées dans un panneau `max-h-52` : sans champ de recherche,
      // atteindre « Sociétés minières » demande de faire défiler à l'aveugle.
      searchable: true,
      error: (this.touched() && !this.selectedSector()[0]) ? this.translate.instant('CLIENTS.FORM.SECTOR_REQUIRED') : undefined,
    };
  });
  readonly currencySelectConfig = computed(() => {
    this.translate.currentLang();
    return { label: this.translate.instant('CLIENTS.FORM.CURRENCY_LABEL'), fullWidth: true };
  });
  /**
   * Pays du client, depuis `pays_ref` (`/ref/pays`), qui porte les 194 pays depuis V75.
   *
   * ⚠️ À ne pas confondre avec `paysId`, l'ENTITÉ ITEC propriétaire du client : un client
   * français peut très bien appartenir à l'entité tunisienne. Les deux restent distincts
   * en base (`clients.pays_id` et `clients.country_id`) et ce champ n'écrit que le second.
   *
   * La valeur est désormais l'IDENTIFIANT et non le libellé. La colonne était un
   * `VARCHAR(100)` de texte libre, et elle portait deux vocabulaires : des noms anglais
   * venus du seed (`China`, `UAE`) et des libellés français venus d'ici (`Chine`,
   * `Émirats Arabes Unis`). Même pays, deux orthographes, aucun regroupement fiable —
   * V76 l'a converti en référence.
   *
   * Le repli « ajouter la valeur courante en tête si elle est absente du référentiel »
   * a disparu avec le texte libre : un identifiant absent de `pays_ref` ne peut pas
   * exister, la clé étrangère l'interdit.
   */
  readonly countryOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({
      value: String(p.id),
      // Libellé ET code ISO : la recherche du composant filtre sur le libellé affiché,
      // donc « TN » comme « Tunisie » trouvent la Tunisie parmi 194 entrées.
      label: `${p.frenchLabel} (${p.isoCode})`,
    })));

  readonly countrySelectConfig = computed(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('CLIENTS.FORM.COUNTRY_LABEL'),
      placeholder: this.translate.instant('CLIENTS.FORM.COUNTRY_PLACEHOLDER'),
      searchable: true,
      fullWidth: true,
    };
  });

  // ── Computed errors ────────────────────────────────────────────────────────
  readonly clientNameError = computed(() => {
    if (!this.touched()) return '';
    this.translate.currentLang();
    const v = this.clientName().trim();
    if (!v) return this.translate.instant('CLIENTS.FORM.REQUIRED');
    if (v.length < 2) return this.translate.instant('CLIENTS.FORM.MIN_LENGTH');
    return '';
  });

  /**
   * Les contacts sont OBLIGATOIRES à la création : une affaire ne peut plus être
   * activée sans contact, alors autant l'exiger là où le client naît plutôt que de
   * laisser l'utilisateur le découvrir au bout de l'assistant d'affaire.
   *
   * En modification on ne l'exige pas : les clients d'avant V44 qui n'avaient aucune
   * coordonnée saisie n'ont hérité d'aucun contact au backfill, et il ne faut pas
   * bloquer la correction d'un secteur ou d'une adresse pour autant.
   */
  readonly contactsRequired = computed(() => !this.isEditMode);

  readonly contactsError = computed(() => {
    if (!this.touched()) return '';
    this.translate.currentLang();
    const rows = this.contacts();
    if (this.contactsRequired() && rows.length === 0) {
      return this.translate.instant('CLIENTS.CONTACTS.AT_LEAST_ONE');
    }
    if (rows.some(r => !r.fullName.trim())) {
      return this.translate.instant('CLIENTS.CONTACTS.NAME_REQUIRED');
    }
    if (rows.some(r => r.email.trim() && !EMAIL_RE.test(r.email.trim()))) {
      return this.translate.instant('CLIENTS.FORM.EMAIL_INVALID');
    }
    const emails = rows.map(r => r.email.trim().toLowerCase()).filter(Boolean);
    if (new Set(emails).size !== emails.length) {
      return this.translate.instant('CLIENTS.CONTACTS.EMAIL_DUPLICATE');
    }
    return '';
  });

  readonly paymentTermsError = computed(() => {
    if (!this.touched()) return '';
    this.translate.currentLang();
    const n = Number(this.paymentTermsDays());
    if (this.paymentTermsDays() !== '' && (n < 0 || n > 365)) return this.translate.instant('CLIENTS.FORM.PAYMENT_TERMS_RANGE');
    return '';
  });

  get isEditMode(): boolean { return !!this.client; }

  /**
   * Alimente la liste déroulante « Secteur » : référentiel figé + secteurs déjà en base,
   * plus celui du client édité. Ce dernier compte : s'il porte une valeur historique
   * absente des deux listes, l'omettre viderait en silence un champ obligatoire à
   * l'ouverture du formulaire.
   */
  private setSectors(fromBackend: readonly string[]): void {
    this.sectors.set(mergeSectors(CURATED_SECTORS, fromBackend, [this.client?.sector]));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['paysId']) {
      const effectiveId: number = this.client?.paysId ?? changes['paysId'].currentValue;
      if (effectiveId) {
        this.loadingSectors.set(true);
        this.svc.getSectors().subscribe({
          next:  s  => { this.setSectors(s);   this.loadingSectors.set(false); },
          error: () => { this.setSectors([]);  this.loadingSectors.set(false); },
        });
      } else {
        this.setSectors([]);
      }
    }

  }

  ngOnInit(): void {
    this.svc.getPays().subscribe(list => this.paysList.set(list));

    const c = this.client;
    if (c) {
      this.clientName.set(c.clientName ?? '');
      this.clientCode.set(c.clientCode ?? '');
      // Rogné comme dans `mergeSectors`, sinon la valeur sélectionnée ne retrouve pas
      // son option dans la liste et le `daf-select` s'affiche vide.
      this.selectedSector.set(c.sector?.trim() ? [c.sector.trim()] : []);
      this.taxId.set(c.taxId ?? '');
      this.countryId.set(c.countryId != null ? String(c.countryId) : '');
      this.address.set(c.address ?? '');
      this.city.set(c.city ?? '');
      this.postalCode.set(c.postalCode ?? '');
      this.website.set(c.website ?? '');
      this.paymentTermsDays.set(c.paymentTermsDays != null ? String(c.paymentTermsDays) : '30');
      this.selectedCurrency.set([c.defaultCurrency ?? 'TND']);
      this.notes.set(c.notes ?? '');

      // Actifs seulement : la réactivation d'un contact désactivé se fait depuis la
      // fiche client, pas au milieu d'un formulaire d'identification.
      this.contactSvc.getContacts(c.id).subscribe(list => {
        const drafts = list.map(toContactDraft);
        this.initialContacts = drafts;
        this.contacts.set(drafts.map(d => ({ ...d })));
      });
    }
  }

  submit(): void {
    this.touched.set(true);
    if (this.clientNameError() || this.contactsError() || this.paymentTermsError()
        || !this.selectedSector()[0]) return;

    this.saving.set(true);
    this.serverError.set(null);

    const days = this.paymentTermsDays();
    const dto: Partial<CreateClientRequest> = {
      clientName:       this.clientName().trim(),
      clientCode:       this.clientCode().trim()     || null,
      sector:           this.selectedSector()[0]     || null,
      taxId:            this.taxId().trim()           || null,
      countryId:        this.countryId() ? Number(this.countryId()) : null,
      address:          this.address().trim()         || null,
      city:             this.city().trim()            || null,
      postalCode:       this.postalCode().trim()      || null,
      website:          this.website().trim()         || null,
      paymentTermsDays: days !== '' ? Number(days) : null,
      defaultCurrency:  this.selectedCurrency()[0]   || null,
      notes:            this.notes().trim()           || null,
    };

    const obs = this.isEditMode
      // En modification, les contacts se rejouent contact par contact APRÈS le client :
      // ils ont leurs propres endpoints, et le PATCH client les ignore volontairement
      // (une liste absente ne peut pas vouloir dire à la fois « n'y touche pas » et
      // « supprime tout »).
      ? this.svc.updateClient(this.client!.id, dto).pipe(
          switchMap(saved => this.contactSvc
            .syncContacts(saved.id, this.contacts(), this.initialContacts)
            .pipe(switchMap(() => of(saved)))))
      // À la création, les contacts partent DANS la même requête : deux appels
      // enchaînés depuis le navigateur laisseraient un client sans contact dès que le
      // second échoue, et l'écran ne propose pas de reprise.
      : this.svc.createClient({
          ...dto,
          paysId: this.paysId,
          contacts: this.contacts()
            .filter(c => c.fullName.trim())
            .map(c => ({
              fullName:  c.fullName.trim(),
              fonction:  c.fonction.trim() || null,
              email:     c.email.trim()    || null,
              phone:     c.phone.trim()    || null,
              isPrimary: c.isPrimary,
            })),
        } as CreateClientRequest);

    obs.subscribe({
      next: result => { this.saving.set(false); this.saved.emit(result); },
      error: err   => {
        this.saving.set(false);
        this.serverError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('CLIENTS.FORM.SERVER_ERROR'));
      },
    });
  }

  cancel(): void { this.closed.emit(); }

  asStr(v: string | number | null): string { return v != null ? String(v) : ''; }
}
