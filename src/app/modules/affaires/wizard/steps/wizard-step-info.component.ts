import {
  Component, Input, Output, EventEmitter, OnInit, DestroyRef, inject, signal, computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormFieldComponent, SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';

import { AffaireService }         from '../../affaire.service';
import { FactListService }        from '../../../../core/fact-list.service';
import { ClientService }          from '../../../clients/client.service';
import {
  AffaireDraftState, BillingMode, BILLING_MODES, BUDGET_LABEL, CONTRACTUAL_MODES,
} from '../../affaire-wizard.model';
import { ClientDropdownItemDto }  from '../../../clients/client.model';
import { PaysRefDto }             from '../../affaire.model';
import { ListValueDto }           from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-info',
  standalone: true,
  imports: [FormsModule, FormFieldComponent, SelectComponent, TranslatePipe],
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
    this.draft        = { ...this.draft, clientId: c.id, clientName: c.clientName, clientKycDone: c.isKycDone };
    this.clientInputValue.set(c.clientName);
    this.clientResults.set([]);
    this.emit();
  }

  emit(): void { this.draftChange.emit({ ...this.draft }); }
}
