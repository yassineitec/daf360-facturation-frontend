import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FormFieldComponent } from '@khalilrebhiitec/daf360';

import { FactListService }        from '../../../../core/fact-list.service';
import { ClientService }          from '../../../clients/client.service';
import { AffaireDraftState, BillingMode, BILLING_MODES, BUDGET_LABEL } from '../../affaire-wizard.model';
import { ClientDropdownItemDto }  from '../../../clients/client.model';
import { ListValueDto }           from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-info',
  standalone: true,
  imports: [FormsModule, FormFieldComponent],
  templateUrl: './wizard-step-info.component.html',
  styleUrl: './wizard-step-info.component.scss',
})
export class WizardStepInfoComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly clientSvc = inject(ClientService);
  private readonly listSvc   = inject(FactListService);

  readonly BILLING_MODES = BILLING_MODES;

  allClients       = signal<ClientDropdownItemDto[]>([]);
  clientResults    = signal<ClientDropdownItemDto[]>([]);
  clientInputValue = signal('');
  clientFocused    = false;
  currencies       = signal<ListValueDto[]>([]);
  private clientHideTimer?: ReturnType<typeof setTimeout>;

  // ── daf-form-field two-way bridges ────────────────────────────
  get intitule(): string | number | null   { return this.draft.intitule ?? null; }
  set intitule(v: string | number | null)  { this.draft.intitule = (v as string) ?? ''; }

  get reference(): string | number | null  { return this.draft.reference ?? null; }
  set reference(v: string | number | null) { this.draft.reference = (v as string) || undefined; }

  get notes(): string | number | null      { return this.draft.notes ?? null; }
  set notes(v: string | number | null)     { this.draft.notes = (v as string) || undefined; }

  ngOnInit(): void {
    this.clientInputValue.set(this.draft.clientName ?? '');
    this.listSvc.getListValues('CURRENCY', 0).subscribe(c => this.currencies.set(c));
    this.clientSvc.getDropdown(0).subscribe(clients => {
      this.allClients.set(clients);
      if (this.draft.doc360ClientName) {
        this.prefillFromDoc360(clients);
      } else if (this.draft.clientId && this.draft.clientName) {
        // Edit mode: client already selected — show the name in the search input
        this.clientInputValue.set(this.draft.clientName);
      }
    });
  }

  // ── Billing mode & budget ───────────────────────────────────────

  selectMode(code: BillingMode): void {
    this.draft = { ...this.draft, billingMode: code };
    this.emit();
  }

  onBudgetChange(val: string): void {
    this.draft = { ...this.draft, budgetPrevisionnel: val ? Number(val) : undefined };
    this.emit();
  }

  onCurrencyChange(val: string): void {
    this.draft = { ...this.draft, contractCurrency: val };
    this.emit();
  }

  budgetLabel(): string {
    return this.draft.billingMode ? BUDGET_LABEL[this.draft.billingMode].label : 'Budget';
  }

  budgetHint(): string {
    return this.draft.billingMode ? BUDGET_LABEL[this.draft.billingMode].hint : '';
  }

  isContractualMode(): boolean {
    return this.draft.billingMode === 'AV' || this.draft.billingMode === 'JAL';
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
    return this.allClients().length === 0 ? 'Chargement des clients…' : 'Rechercher un client…';
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
