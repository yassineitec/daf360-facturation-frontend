import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass }     from '@angular/common';

import { AffaireService }     from '../../affaire.service';
import { ClientService }      from '../../../clients/client.service';
import { FactListService }    from '../../../../core/fact-list.service';
import { AffaireDraftState, BillingMode, BILLING_MODES } from '../../affaire-wizard.model';
import { ClientDropdownItemDto } from '../../../clients/client.model';
import { PaysRefDto, UserRefDto } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';

@Component({
  selector: 'app-wizard-step-info',
  standalone: true,
  imports: [FormsModule, NgClass],
  template: `
<div class="space-y-6">

  <div class="grid grid-cols-2 gap-6">

    <!-- Entité -->
    <div>
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
        Entité *
      </label>
      <select [(ngModel)]="draft.paysId" (ngModelChange)="onPaysChange()"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none
               focus:ring-2 focus:ring-[rgba(26,107,124,0.3)]">
        <option [value]="0">Sélectionner une entité...</option>
        @for (p of pays(); track p.id) {
          <option [value]="p.id">{{ p.frenchLabel }}</option>
        }
      </select>
    </div>

    <!-- Client (typeahead) -->
    <div class="relative">
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
        Client * <span class="text-[#92400e] bg-[#fef3c7] px-1 py-0.5 rounded text-[9px] font-bold ml-1">KYC requis</span>
      </label>
      <input type="text"
        [value]="draft.clientName ?? ''"
        (input)="searchClients($any($event.target).value)"
        (focus)="showAllClients()"
        (blur)="scheduleHideClients()"
        [placeholder]="clientPlaceholder()"
        [disabled]="!draft.paysId"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none
               focus:ring-2 focus:ring-[rgba(26,107,124,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"/>
      @if (clientResults().length > 0) {
        <div class="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#eceef0]
                    rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          @for (c of clientResults(); track c.id) {
            <button type="button" (click)="selectClient(c)"
              class="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f2f4f6]
                     flex items-center justify-between">
              <span class="font-medium">{{ c.clientName }}</span>
              @if (!c.isKycDone) {
                <span class="text-[10px] bg-[#fef3c7] text-[#92400e] px-1.5 py-0.5 rounded font-bold">
                  KYC requis
                </span>
              }
            </button>
          }
        </div>
      }
      @if (clientFocused && draft.paysId && allClients().length === 0) {
        <p class="text-xs text-[#75777d] mt-1">Aucun client disponible pour cette entité.</p>
      }
      @if (draft.clientId && !draft.clientKycDone) {
        <p class="text-xs text-[#92400e] mt-1 flex items-center gap-1">
          <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">warning</span>
          Ce client n'a pas de validation KYC. Aucune facture ne pourra être émise.
        </p>
      }
    </div>

    <!-- Intitulé -->
    <div class="col-span-2">
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
        Intitulé de l'affaire *
      </label>
      <input type="text" [(ngModel)]="draft.intitule" maxlength="255"
        placeholder="Ex : Développement plateforme RH..."
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none
               focus:ring-2 focus:ring-[rgba(26,107,124,0.3)]"/>
    </div>

    <!-- Référence + Doc360 -->
    <div>
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
        Référence <span class="text-[#75777d] font-normal normal-case">(auto si vide)</span>
      </label>
      <input type="text" [(ngModel)]="draft.reference" maxlength="30"
        placeholder="AFF-2026-0001"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm font-mono outline-none"/>
    </div>
    <div>
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
        Référence Doc360
      </label>
      <input type="text" [(ngModel)]="draft.doc360Ref" maxlength="100"
        placeholder="DOC-XXXX"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm font-mono outline-none"/>
    </div>

    <!-- Dates -->
    <div>
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">Date début</label>
      <input type="date" [(ngModel)]="draft.dateDebut"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none"/>
    </div>
    <div>
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">Date fin</label>
      <input type="date" [(ngModel)]="draft.dateFin"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none"/>
    </div>

  </div>

  <!-- BILLING MODE — card selector -->
  <div>
    <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide mb-3 block">
      Mode de facturation *
    </label>
    <div class="grid grid-cols-5 gap-3">
      @for (mode of BILLING_MODES; track mode.code) {
        <button type="button" (click)="selectMode(mode.code)"
          [ngClass]="draft.billingMode === mode.code
            ? 'border-[#1a6b7c] bg-[#e6f7f5]'
            : 'border-[#eceef0] hover:border-[#1a6b7c] hover:bg-[#f7fdfb]'"
          class="p-4 rounded-xl border-2 text-left transition-all cursor-pointer">
          <span class="material-symbols-outlined text-2xl block"
            [ngClass]="draft.billingMode === mode.code ? 'text-[#1a6b7c]' : 'text-[#c5c6cd]'"
            style="font-variation-settings:'FILL' 1">
            {{ mode.icon }}
          </span>
          <p class="text-xs font-bold text-[#1d2b3e] mt-2 leading-tight">{{ mode.labelFr }}</p>
          <p class="text-[10px] text-[#75777d] mt-1 leading-relaxed">{{ mode.description }}</p>
        </button>
      }
    </div>
  </div>

  <!-- Contract amount (AV and JAL only) -->
  @if (draft.billingMode === 'AV' || draft.billingMode === 'JAL') {
    <div class="grid grid-cols-2 gap-6 p-4 bg-[#f0fdf4] rounded-xl border border-[#a7f3d0]">
      <div>
        <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
          Montant du contrat *
        </label>
        <input type="number" step="0.001" min="0"
          [(ngModel)]="draft.contractAmount"
          class="w-full bg-white border-none rounded-lg py-2 px-3 text-sm outline-none
                 focus:ring-2 focus:ring-[rgba(26,107,124,0.3)]"/>
      </div>
      <div>
        <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
          Devise *
        </label>
        <select [(ngModel)]="draft.contractCurrency"
          class="w-full bg-white border-none rounded-lg py-2 px-3 text-sm outline-none">
          @for (c of currencies(); track c.id) {
            <option [value]="c.code">{{ c.code }} — {{ c.labelFr }}</option>
          }
          @if (!currencies().length) {
            <option value="EUR">EUR — Euro</option>
            <option value="TND">TND — Dinar tunisien</option>
          }
        </select>
      </div>
    </div>
  }

  <!-- Responsable(s) + Notes -->
  <div class="grid grid-cols-2 gap-6">

    <!-- Responsable(s) — multi-select typeahead -->
    <div class="relative">
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">
        Responsable(s) affaire
      </label>
      @if (draft.responsableUserIds.length > 0) {
        <div class="flex flex-wrap gap-1 mb-2">
          @for (uid of draft.responsableUserIds; track uid; let i = $index) {
            <span class="inline-flex items-center gap-1 bg-[#e6f7f5] text-[#1a6b7c] text-xs font-semibold px-2.5 py-1 rounded-full">
              @if (i === 0) {
                <span class="w-1.5 h-1.5 rounded-full bg-[#1a6b7c] inline-block flex-shrink-0"></span>
              }
              {{ getResponsableName(uid) }}
              <button type="button" (click)="removeResponsable(uid)"
                class="hover:text-red-500 font-bold ml-0.5 leading-none">×</button>
            </span>
          }
        </div>
      }
      <input type="text"
        [value]="responsableQuery"
        (input)="onResponsableInput($any($event.target).value)"
        (focus)="showAllResponsables()"
        (blur)="scheduleHideResponsables()"
        placeholder="Ajouter un responsable..."
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none
               focus:ring-2 focus:ring-[rgba(26,107,124,0.3)]"/>
      @if (responsableResults().length > 0) {
        <div class="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#eceef0]
                    rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          @for (u of responsableResults(); track u.id) {
            <button type="button" (click)="addResponsable(u)"
              class="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f2f4f6] flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-[#1a6b7c] text-white text-[10px] font-bold
                           flex items-center justify-center flex-shrink-0">
                {{ u.fullName.charAt(0).toUpperCase() }}
              </span>
              {{ u.fullName }}
            </button>
          }
        </div>
      }
    </div>

    <!-- Notes -->
    <div>
      <label class="text-xs font-semibold text-[#44474c] uppercase tracking-wide block mb-1">Notes</label>
      <textarea [(ngModel)]="draft.notes" rows="2" maxlength="1000"
        class="w-full bg-[#f2f4f6] border-none rounded-lg py-2 px-3 text-sm outline-none resize-none">
      </textarea>
    </div>
  </div>

</div>
  `,
})
export class WizardStepInfoComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  private readonly affaireSvc = inject(AffaireService);
  private readonly clientSvc  = inject(ClientService);
  private readonly listSvc    = inject(FactListService);

  readonly BILLING_MODES = BILLING_MODES;

  pays              = signal<PaysRefDto[]>([]);
  users             = signal<UserRefDto[]>([]);
  currencies        = signal<ListValueDto[]>([]);
  allClients        = signal<ClientDropdownItemDto[]>([]);
  clientResults     = signal<ClientDropdownItemDto[]>([]);
  responsableResults = signal<UserRefDto[]>([]);

  responsableQuery  = '';
  clientFocused     = false;
  private clientHideTimer?:      ReturnType<typeof setTimeout>;
  private responsableHideTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.affaireSvc.getPays().subscribe(p => this.pays.set(p));
    this.affaireSvc.getUsers().subscribe(u => this.users.set(u));
    if (this.draft.paysId) {
      this.loadPaysData(this.draft.paysId);
    }
  }

  onPaysChange(): void {
    const paysId = Number(this.draft.paysId);
    this.draft.clientId   = undefined;
    this.draft.clientName = undefined;
    this.allClients.set([]);
    this.clientResults.set([]);
    this.responsableResults.set([]);
    if (paysId) this.loadPaysData(paysId);
    this.emit();
  }

  private loadPaysData(paysId: number): void {
    this.listSvc.getListValues('CURRENCY', paysId).subscribe(c => this.currencies.set(c));
    this.clientSvc.getDropdown(paysId).subscribe(c => this.allClients.set(c));
  }

  // ── Client typeahead ──────────────────────────────────────────────────

  clientPlaceholder(): string {
    if (!this.draft.paysId) return 'Sélectionnez d\'abord une entité...';
    if (this.allClients().length === 0) return 'Aucun client pour cette entité';
    return 'Rechercher un client...';
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

  searchClients(query: string): void {
    if (this.clientHideTimer) { clearTimeout(this.clientHideTimer); this.clientHideTimer = undefined; }
    const list = this.allClients();
    if (!query.trim()) { this.clientResults.set(list.slice(0, 10)); return; }
    const q = query.toLowerCase();
    this.clientResults.set(list.filter(c => c.clientName.toLowerCase().includes(q)).slice(0, 8));
  }

  selectClient(c: ClientDropdownItemDto): void {
    if (this.clientHideTimer) { clearTimeout(this.clientHideTimer); this.clientHideTimer = undefined; }
    this.draft.clientId     = c.id;
    this.draft.clientName   = c.clientName;
    this.draft.clientKycDone = c.isKycDone;
    this.clientResults.set([]);
    this.emit();
  }

  // ── Responsable multi-select ──────────────────────────────────────────

  showAllResponsables(): void {
    if (this.responsableHideTimer) { clearTimeout(this.responsableHideTimer); this.responsableHideTimer = undefined; }
    const selected = new Set(this.draft.responsableUserIds);
    this.responsableResults.set(this.users().filter(u => !selected.has(u.id)).slice(0, 8));
  }

  scheduleHideResponsables(): void {
    this.responsableHideTimer = setTimeout(() => this.responsableResults.set([]), 150);
  }

  onResponsableInput(value: string): void {
    this.responsableQuery = value;
    if (this.responsableHideTimer) { clearTimeout(this.responsableHideTimer); this.responsableHideTimer = undefined; }
    const selected = new Set(this.draft.responsableUserIds);
    const list = this.users().filter(u => !selected.has(u.id));
    if (!value.trim()) { this.responsableResults.set(list.slice(0, 8)); return; }
    const q = value.toLowerCase();
    this.responsableResults.set(list.filter(u => u.fullName.toLowerCase().includes(q)).slice(0, 8));
  }

  addResponsable(user: UserRefDto): void {
    if (this.responsableHideTimer) { clearTimeout(this.responsableHideTimer); this.responsableHideTimer = undefined; }
    if (!this.draft.responsableUserIds.includes(user.id)) {
      this.draft.responsableUserIds = [...this.draft.responsableUserIds, user.id];
      this.draft.responsableNames   = [...this.draft.responsableNames, user.fullName];
      this.emit();
    }
    this.responsableQuery = '';
    this.responsableResults.set([]);
  }

  removeResponsable(userId: number): void {
    const updated = this.draft.responsableUserIds.filter(id => id !== userId);
    this.draft.responsableUserIds = updated;
    const allUsers = this.users();
    this.draft.responsableNames = updated.map(id => allUsers.find(u => u.id === id)?.fullName ?? '');
    this.emit();
  }

  getResponsableName(userId: number): string {
    return this.users().find(u => u.id === userId)?.fullName ?? `#${userId}`;
  }

  // ── Billing mode ─────────────────────────────────────────────────────

  selectMode(code: BillingMode): void {
    this.draft.billingMode = code;
    if (!BILLING_MODES.find(m => m.code === code)?.requiresContractAmount) {
      this.draft.contractAmount = undefined;
    }
    this.emit();
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft });
  }
}
