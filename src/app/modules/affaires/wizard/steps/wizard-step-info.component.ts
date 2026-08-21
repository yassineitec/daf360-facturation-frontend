import {
  Component, Input, Output, EventEmitter, OnInit, DestroyRef, inject, signal, computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CheckboxComponent, FormFieldComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';

import { AffaireService }         from '../../affaire.service';
import { FactListService }        from '../../../../core/fact-list.service';
import { ClientService }          from '../../../clients/client.service';
import {
  AffaireDraftState, BillingMode, BILLING_MODES, BUDGET_LABEL, CONTRACTUAL_MODES,
} from '../../affaire-wizard.model';
import { ClientDropdownItemDto }  from '../../../clients/client.model';
import { ClientContactService }   from '../../../clients/contacts/client-contact.service';
import { ClientContactDto }       from '../../../clients/contacts/client-contact.model';
import { PaysRefDto }             from '../../affaire.model';
import { ListValueDto }           from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-info',
  standalone: true,
  imports: [FormsModule, FormFieldComponent, SelectComponent, CheckboxComponent,
            ButtonComponent, TranslatePipe],
  templateUrl: './wizard-step-info.component.html',
  styleUrl: './wizard-step-info.component.scss',
})
export class WizardStepInfoComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  /**
   * Le pays est figé dès que l'affaire existe : il porte la séquence de référence
   * (`AFF-<année>-<n>` comptée par pays) et l'unicité `(référence, pays)`. Le changer
   * après coup casserait les deux, donc l'assistant l'affiche en lecture seule en
   * mode édition plutôt que de laisser croire que c'est modifiable.
   */
  @Input() paysLocked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly clientSvc = inject(ClientService);
  private readonly contactSvc = inject(ClientContactService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly listSvc   = inject(FactListService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly BILLING_MODES = BILLING_MODES;

  allClients       = signal<ClientDropdownItemDto[]>([]);
  paysList         = signal<PaysRefDto[]>([]);
  clientResults    = signal<ClientDropdownItemDto[]>([]);
  clientInputValue = signal('');
  clientFocused    = false;

  // ── Contacts du client sélectionné ───────────────────────────────────────
  // Choisis ICI et non dans une étape à part : ils dépendent du client qu'on vient de
  // sélectionner juste au-dessus, et une étape séparée aurait permis d'y arriver sans
  // client. Une affaire ne peut plus être activée sans au moins un contact — ce sont
  // eux qui reçoivent les factures.

  clientContacts     = signal<ClientContactDto[]>([]);
  loadingContacts    = signal(false);

  newContactOpen     = signal(false);
  savingContact      = signal(false);
  newContactError    = signal<string | null>(null);
  newContactName     = signal('');
  newContactFonction = signal('');
  newContactEmail    = signal('');
  newContactPhone    = signal('');
  currencies       = signal<ListValueDto[]>([]);
  private clientHideTimer?: ReturnType<typeof setTimeout>;

  // ── daf-select currency options (list from backend, else hardcoded fallback) ──
  readonly currencyOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const list = this.currencies();
    if (list.length > 0) {
      return list.map(c => ({ value: c.code, label: `${c.code} — ${c.labelFr}` }));
    }
    return [
      { value: 'EUR', label: `EUR — ${this.translate.instant('AFFAIRES.wizard.info.cur_euro')}` },
      { value: 'USD', label: `USD — ${this.translate.instant('AFFAIRES.wizard.info.cur_dollar')}` },
      { value: 'TND', label: `TND — ${this.translate.instant('AFFAIRES.wizard.info.cur_tnd')}` },
      { value: 'MAD', label: `MAD — ${this.translate.instant('AFFAIRES.wizard.info.cur_mad')}` },
    ];
  });

  // ── daf-form-field two-way bridges ────────────────────────────
  get intitule(): string | number | null   { return this.draft.intitule ?? null; }
  set intitule(v: string | number | null)  { this.draft.intitule = (v as string) ?? ''; }

  get reference(): string | number | null  { return this.draft.reference ?? null; }
  set reference(v: string | number | null) { this.draft.reference = (v as string) || undefined; }

  get notes(): string | number | null      { return this.draft.notes ?? null; }
  set notes(v: string | number | null)     { this.draft.notes = (v as string) || undefined; }

  /** Pays d'origine de l'affaire — référentiel `/ref/pays`. */
  readonly paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.isoCode} — ${p.frenchLabel}` })));

  /** Ce que montre la ligne en lecture seule quand le pays est figé. */
  paysDisplay(): string {
    return this.draft.paysLabel
      ?? this.paysList().find(p => p.id === this.draft.paysId)?.frenchLabel
      ?? this.translate.instant('AFFAIRES.wizard.shell.dash');
  }

  /**
   * ⚠️ `takeUntilDestroyed` sur les trois appels, et c'est indispensable pour DEUX
   * d'entre eux : leurs réponses ne se contentent pas de remplir une liste, elles
   * **réémettent le brouillon** (`draftChange`).
   *
   * Sans cette garde, la réponse arrivée après un « Suivant » écrasait le brouillon du
   * parent avec l'instantané de l'étape 2 — celui d'AVANT la fusion des champs renvoyés
   * par la création (`id`, `paysId`, `budgetPrevisionnel` recalculés côté serveur). Le
   * budget de l'étape 2 semblait donc « changer » tout seul entre les étapes, et l'id du
   * brouillon pouvait repartir à `undefined`. Le composant est détruit par le `@if` de
   * l'étape, mais la souscription HTTP, elle, survivait.
   */
  ngOnInit(): void {
    this.clientInputValue.set(this.draft.clientName ?? '');

    this.listSvc.getListValues('CURRENCY', 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => this.currencies.set(c));

    this.affaireSvc.getPays()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => {
        this.paysList.set(list);
        // Le libellé sert au récapitulatif et à la ligne verrouillée : il est résolu ici
        // une fois la liste connue, que le pays vienne de la saisie ou du brouillon relu.
        const current = list.find(p => p.id === this.draft.paysId);
        if (current && this.draft.paysLabel !== current.frenchLabel) {
          this.draft = { ...this.draft, paysLabel: current.frenchLabel };
          this.draftChange.emit(this.draft);
        }
      });

    this.clientSvc.getDropdown(0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(clients => {
        this.allClients.set(clients);
        if (this.draft.doc360ClientName) {
          // Émet aussi le brouillon (préremplissage DOC360) — même exposition.
          this.prefillFromDoc360(clients);
        } else if (this.draft.clientId && this.draft.clientName) {
          this.clientInputValue.set(this.draft.clientName);
        }
        // Après le préremplissage DOC360, qui peut avoir résolu un client par son nom :
        // charger avant lui laisserait la liste des contacts vide sur une affaire dont
        // le client vient d'être deviné.
        if (this.draft.clientId) this.loadContacts(this.draft.clientId);
      });
  }

  // ── Billing mode & budget ───────────────────────────────────────

  selectMode(code: BillingMode): void {
    this.draft = { ...this.draft, billingMode: code };
    this.emit();
  }

  onBudgetChange(val: string | number | null): void {
    const amount = val === null || val === '' ? undefined : Number(val);
    this.draft = { ...this.draft, budgetPrevisionnel: amount };
    this.emit();
  }

  onCurrencyChange(val: string): void {
    this.draft = { ...this.draft, contractCurrency: val };
    this.emit();
  }

  onPaysChange(values: string[]): void {
    const id = Number(values[0]);
    const pays = this.paysList().find(p => p.id === id);
    this.draft = { ...this.draft, paysId: id || 0, paysLabel: pays?.frenchLabel };
    this.emit();
  }

  budgetLabel(): string {
    const mode = this.draft.billingMode;
    return mode && BUDGET_LABEL[mode]
      ? this.translate.instant(BUDGET_LABEL[mode].labelKey)
      : this.translate.instant('AFFAIRES.wizard.info.budget_fallback');
  }

  budgetHint(): string {
    const mode = this.draft.billingMode;
    return mode && BUDGET_LABEL[mode] ? this.translate.instant(BUDGET_LABEL[mode].hintKey) : '';
  }

  isContractualMode(): boolean {
    return !!this.draft.billingMode && CONTRACTUAL_MODES.has(this.draft.billingMode);
  }

  // ── DOC360 pre-fill ────────────────────────────────────────────

  private prefillFromDoc360(clients: ClientDropdownItemDto[]): void {
    let updated = { ...this.draft };
    let changed = false;

    // 1. Intitulé ← project_title
    if (updated.doc360ProjectName && !updated.intitule?.trim()) {
      updated = { ...updated, intitule: updated.doc360ProjectName };
      changed = true;
    }

    // 2. Reference ← server_reference (when pre-filled from DOC360)
    if (updated.doc360ServerReference && !updated.reference?.trim()) {
      updated = { ...updated, reference: updated.doc360ServerReference };
      changed = true;
    }

    // 3. Client ← client_name (best-effort name match)
    if (updated.doc360ClientName && !updated.clientId) {
      const raw   = updated.doc360ClientName.toLowerCase();
      const match = clients.find(c =>
        c.clientName.toLowerCase().includes(raw) ||
        raw.includes(c.clientName.toLowerCase())
      );

      if (match) {
        updated = { ...updated, clientId: match.id, clientName: match.clientName, clientKycDone: match.isKycDone };
        this.clientInputValue.set(match.clientName);
        changed = true;
      } else {
        this.clientInputValue.set(updated.doc360ClientName);
        this.searchClients(updated.doc360ClientName);
      }
    }

    if (changed) {
      this.draft = updated;
      this.draftChange.emit(this.draft);
    }
  }

  // ── Client typeahead ───────────────────────────────────────────

  clientPlaceholder(): string {
    return this.allClients().length === 0
      ? this.translate.instant('AFFAIRES.wizard.info.loading_clients')
      : this.translate.instant('AFFAIRES.wizard.info.search_client');
  }

  showAllClients(): void {
    if (this.clientHideTimer) { clearTimeout(this.clientHideTimer); this.clientHideTimer = undefined; }
    this.clientFocused = true;
    this.clientResults.set(this.allClients().slice(0, 10));
  }

  scheduleHideClients(): void {
    this.clientFocused = false;
    this.clientHideTimer = setTimeout(() => this.clientResults.set([]), 150);
  }

  onClientInput(value: string): void {
    this.clientInputValue.set(value);
    if (!value) {
      this.draft = { ...this.draft, clientId: undefined, clientName: undefined, clientKycDone: undefined };
      this.draftChange.emit(this.draft);
    }
    this.searchClients(value);
  }

  searchClients(query: string): void {
    if (this.clientHideTimer) { clearTimeout(this.clientHideTimer); this.clientHideTimer = undefined; }
    const list = this.allClients();
    if (!query.trim()) { this.clientResults.set(list.slice(0, 10)); return; }
    const q = query.toLowerCase();
    this.clientResults.set(list.filter(c => c.clientName.toLowerCase().includes(q)).slice(0, 8));
  }

  selectClient(c: ClientDropdownItemDto): void {
    if (this.clientHideTimer) { clearTimeout(this.clientHideTimer); this.clientHideTimer = undefined; }
    const clientChanged = this.draft.clientId !== c.id;
    this.draft = { ...this.draft, clientId: c.id, clientName: c.clientName, clientKycDone: c.isKycDone };
    // Changer de client invalide la sélection de contacts : ceux du client précédent
    // n'appartiennent pas à celui-ci, et le serveur refuse le rattachement (FK
    // composite). Les vider ici évite un refus incompréhensible au « Suivant ».
    if (clientChanged) {
      this.draft = { ...this.draft, contactIds: [], billingContactId: undefined };
      // Le formulaire de saisie appartenait au client précédent : ce qui y était tapé
      // n'a plus de destinataire. `loadContacts` le rouvrira si ce client-ci n'a
      // aucun contact.
      this.newContactOpen.set(false);
      this.newContactError.set(null);
      this.resetNewContact();
    }
    this.clientInputValue.set(c.clientName);
    this.clientResults.set([]);
    this.emit();
    this.loadContacts(c.id);
  }

  // ── Contacts du client ────────────────────────────────────────────────────

  /**
   * Charge les contacts du client ET décide de l'état du formulaire de saisie.
   *
   * C'est le résultat du chargement qui ouvre ou ferme le formulaire, jamais un état
   * laissé de côté : un client sans aucun contact ouvre directement la saisie (il n'y
   * a rien à choisir, demander un clic de plus sur « Nouveau contact » est une étape
   * pour rien), et un client qui en a referme le formulaire pour montrer la liste.
   * Sans ce `set` dans les deux sens, passer d'un client sans contact à un client qui
   * en a laissait le formulaire ouvert par-dessus la liste.
   */
  loadContacts(clientId: number): void {
    this.loadingContacts.set(true);
    this.contactSvc.getContacts(clientId).subscribe(list => {
      this.clientContacts.set(list);
      this.loadingContacts.set(false);
      this.newContactOpen.set(list.length === 0);
      this.newContactError.set(null);
      if (list.length > 0) this.resetNewContact();

      // Client à contact unique : le rattacher d'office. C'est le cas majoritaire, et
      // faire cocher une seule case n'est pas un choix, c'est une formalité.
      if (list.length === 1 && this.draft.contactIds.length === 0) {
        this.draft = {
          ...this.draft,
          contactIds: [list[0].id],
          billingContactId: list[0].id,
        };
        this.emit();
      }
    });
  }

  isContactSelected(id: number): boolean {
    return this.draft.contactIds.includes(id);
  }

  toggleContact(id: number): void {
    const selected = this.isContactSelected(id);
    const contactIds = selected
      ? this.draft.contactIds.filter(x => x !== id)
      : [...this.draft.contactIds, id];

    // `billingContactId` porte le nom de la COLONNE `affaire_contacts.is_billing`,
    // volontairement : le champ suit la base. Ce que l'écran en dit est « Référent »,
    // le contact imprimé sur la facture et mis en tête des destinataires — tous les
    // contacts rattachés la reçoivent.
    let billingContactId = this.draft.billingContactId;
    // Le référent doit rester dans la sélection : le retirer sans reprendre le drapeau
    // laisserait une affaire sans référent désigné.
    if (selected && billingContactId === id) billingContactId = contactIds[0];
    if (!selected && billingContactId == null) billingContactId = id;

    this.draft = { ...this.draft, contactIds, billingContactId };
    this.emit();
  }

  setReferentContact(id: number): void {
    if (!this.isContactSelected(id)) return;
    this.draft = { ...this.draft, billingContactId: id };
    this.emit();
  }

  // ── Création d'un contact sans quitter l'assistant ────────────────────────

  openNewContact(): void {
    this.newContactError.set(null);
    this.newContactOpen.set(true);
  }

  /**
   * Ne referme que s'il y a une liste vers laquelle revenir : sur un client sans
   * aucun contact, fermer le formulaire ne laisserait rien à l'écran et bloquerait
   * l'étape. Le gabarit masque d'ailleurs le bouton dans ce cas.
   */
  cancelNewContact(): void {
    if (this.clientContacts().length === 0) return;
    this.newContactOpen.set(false);
    this.newContactError.set(null);
    this.resetNewContact();
  }

  /**
   * Enregistre le contact tout de suite, et non à la fin de l'assistant : il doit
   * exister en base pour pouvoir être rattaché à l'affaire, et il appartient au client
   * — il reste donc utile même si la création d'affaire est abandonnée.
   */
  saveNewContact(): void {
    const clientId = this.draft.clientId;
    const name = this.newContactName().trim();
    if (!clientId || !name) {
      this.newContactError.set(this.translate.instant('CLIENTS.CONTACTS.NAME_REQUIRED'));
      return;
    }
    this.savingContact.set(true);
    this.newContactError.set(null);
    this.contactSvc.createContact(clientId, {
      fullName: name,
      fonction: this.newContactFonction().trim() || null,
      email:    this.newContactEmail().trim()    || null,
      phone:    this.newContactPhone().trim()    || null,
      isPrimary: null,
      notes:     null,
    }).subscribe({
      next: created => {
        this.savingContact.set(false);
        this.resetNewContact();
        this.clientContacts.update(list => [...list, created]);
        // La liste n'est plus vide : le formulaire se referme et laisse place aux
        // choix. C'est aussi la sortie du cas « client sans aucun contact », où il
        // s'était ouvert tout seul et où « Annuler » n'était pas proposé.
        this.newContactOpen.set(false);
        // Créé depuis cet écran = voulu sur cette affaire : on le coche.
        this.toggleContact(created.id);
      },
      error: err => {
        this.savingContact.set(false);
        this.newContactError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('CLIENTS.CONTACTS.SAVE_ERROR'));
      },
    });
  }

  private resetNewContact(): void {
    this.newContactName.set('');
    this.newContactFonction.set('');
    this.newContactEmail.set('');
    this.newContactPhone.set('');
  }

  asStr(v: string | number | null): string { return v != null ? String(v) : ''; }

  emit(): void { this.draftChange.emit({ ...this.draft }); }
}
