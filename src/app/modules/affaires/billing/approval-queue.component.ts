import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink }                                   from '@angular/router';
import { NgClass }                                      from '@angular/common';
import { FormsModule }                                  from '@angular/forms';
import {
  BillingService,
  PendingTauxDto, PendingJalonDto, PendingBillingLineDto, AuditLogEntryDto,
} from './billing.service';

type ActiveTab = 'rf' | 'df' | 'history';

const TAUX_STATUT = {
  EN_ATTENTE: { label: 'En attente', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE:     { label: 'Validé',     bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  REFUSE:     { label: 'Refusé',     bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

const JALON_STATUT = {
  EN_ATTENTE_VALIDATION: { label: 'En attente RF', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
};

const LINE_STATUT: Record<string, { label: string; bg: string; color: string; border: string }> = {
  EN_ATTENTE_DF: { label: 'En attente DF', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE_DF:     { label: 'Validé DF',     bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  FACTURE:       { label: 'Facturé',       bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  RETOURNE:      { label: 'Retourné',      bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  ANNULE:        { label: 'Annulé',        bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

const TABS: { key: ActiveTab; label: string; icon: string }[] = [
  { key: 'rf',      label: 'En attente RF', icon: 'approval'    },
  { key: 'df',      label: 'En attente DF', icon: 'task_alt'    },
  { key: 'history', label: 'Historique',    icon: 'history'     },
];

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [RouterLink, NgClass, FormsModule],
  template: `
<div class="min-h-screen bg-[#f0f4f8] p-8">

  <!-- Header -->
  <div class="flex items-center gap-4 mb-6">
    <a routerLink="/fact/affaires"
      class="flex items-center gap-1 text-sm text-[#44474c] hover:text-[#1a6b7c] transition-colors">
      <span class="material-symbols-outlined text-base">arrow_back</span>
      Retour
    </a>
    <span class="text-[#c5c6cd]">/</span>
    <h1 class="text-xl font-semibold text-[#1d2b3e]">File d'approbation</h1>
  </div>

  <!-- Stats summary -->
  <div class="grid grid-cols-3 gap-4 mb-6">
    <div class="bg-white rounded-xl border border-[#eceef0] p-4 text-center">
      <p class="text-2xl font-bold text-[#f59e0b]">{{ pendingTaux().length + pendingJalons().length }}</p>
      <p class="text-xs text-[#64748b] mt-1">En attente RF</p>
    </div>
    <div class="bg-white rounded-xl border border-[#eceef0] p-4 text-center">
      <p class="text-2xl font-bold text-[#6366f1]">{{ pendingLines().length }}</p>
      <p class="text-xs text-[#64748b] mt-1">En attente DF</p>
    </div>
    <div class="bg-white rounded-xl border border-[#eceef0] p-4 text-center">
      <p class="text-2xl font-bold text-[#1a6b7c]">{{ auditLog().length }}</p>
      <p class="text-xs text-[#64748b] mt-1">Actions (historique)</p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="bg-white rounded-2xl border border-[#eceef0] overflow-hidden">

    <!-- Tab bar -->
    <div class="flex border-b border-[#eceef0]">
      @for (tab of tabs; track tab.key) {
        <button (click)="setTab(tab.key)"
          class="flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors relative"
          [ngClass]="activeTab() === tab.key
            ? 'text-[#1a6b7c] border-b-2 border-[#1a6b7c] -mb-px'
            : 'text-[#64748b] hover:text-[#44474c]'">
          <span class="material-symbols-outlined text-base">{{ tab.icon }}</span>
          {{ tab.label }}
          @if (tab.key === 'rf' && pendingTaux().length + pendingJalons().length > 0) {
            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#f59e0b] text-white text-xs font-bold">
              {{ pendingTaux().length + pendingJalons().length }}
            </span>
          }
          @if (tab.key === 'df' && pendingLines().length > 0) {
            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#6366f1] text-white text-xs font-bold">
              {{ pendingLines().length }}
            </span>
          }
        </button>
      }
    </div>

    <div class="p-6">

      <!-- ── RF Tab ─────────────────────────────────────────────── -->
      @if (activeTab() === 'rf') {
        @if (rfLoading()) {
          <div class="text-sm text-[#64748b] text-center py-10">Chargement…</div>
        } @else if (pendingTaux().length === 0 && pendingJalons().length === 0) {
          <div class="text-sm text-[#64748b] text-center py-10">
            <span class="material-symbols-outlined text-4xl text-[#c5c6cd] block mb-2">check_circle</span>
            Aucun élément en attente de validation RF.
          </div>
        } @else {

          <!-- Pending taux -->
          @if (pendingTaux().length > 0) {
            <h3 class="text-sm font-semibold text-[#1d2b3e] mb-3 flex items-center gap-2">
              <span class="material-symbols-outlined text-base text-[#1a6b7c]">trending_up</span>
              Taux d'avancement (AV) — {{ pendingTaux().length }}
            </h3>
            <div class="overflow-x-auto rounded-xl border border-[#eceef0] mb-6">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
                    <th class="px-4 py-3 text-left">Affaire</th>
                    <th class="px-4 py-3 text-right">Taux</th>
                    <th class="px-4 py-3 text-right">Valeur</th>
                    <th class="px-4 py-3 text-left">Soumis le</th>
                    <th class="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#f1f5f9]">
                  @for (t of pendingTaux(); track t.id) {
                    <tr class="hover:bg-[#f8fafc] transition-colors">
                      <td class="px-4 py-3">
                        <a [routerLink]="['/fact/affaires', t.affaireId]"
                          class="font-medium text-[#1a6b7c] hover:underline">
                          {{ t.affaireRef }}
                        </a>
                        <p class="text-xs text-[#64748b]">{{ t.affaireIntitule }}</p>
                      </td>
                      <td class="px-4 py-3 text-right font-bold text-[#1d2b3e]">{{ t.taux }}%</td>
                      <td class="px-4 py-3 text-right text-[#1d2b3e]">
                        {{ fmtAmt(t.valeurCalculee) }}
                      </td>
                      <td class="px-4 py-3 text-[#44474c]">{{ fmtDate(t.soumisAt) }}</td>
                      <td class="px-4 py-3">
                        <div class="flex gap-1.5">
                          <button (click)="doValidateTaux(t.id)"
                            class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                                   hover:bg-[#a7f3d0] transition-colors">
                            Valider
                          </button>
                          <button (click)="openRfRefuseModal(t.id, 'taux')"
                            class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                                   hover:bg-[#fecaca] transition-colors">
                            Refuser
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- Pending jalons -->
          @if (pendingJalons().length > 0) {
            <h3 class="text-sm font-semibold text-[#1d2b3e] mb-3 flex items-center gap-2">
              <span class="material-symbols-outlined text-base text-[#1a6b7c]">flag</span>
              Jalons (JAL) — {{ pendingJalons().length }}
            </h3>
            <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
                    <th class="px-4 py-3 text-left">Affaire</th>
                    <th class="px-4 py-3 text-left">Jalon</th>
                    <th class="px-4 py-3 text-right">Montant</th>
                    <th class="px-4 py-3 text-left">Échéance</th>
                    <th class="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#f1f5f9]">
                  @for (j of pendingJalons(); track j.id) {
                    <tr class="hover:bg-[#f8fafc] transition-colors">
                      <td class="px-4 py-3">
                        <a [routerLink]="['/fact/affaires', j.affaireId]"
                          class="font-medium text-[#1a6b7c] hover:underline">
                          {{ j.affaireRef }}
                        </a>
                        <p class="text-xs text-[#64748b]">{{ j.affaireIntitule }}</p>
                      </td>
                      <td class="px-4 py-3 text-[#1d2b3e]">{{ j.label }}</td>
                      <td class="px-4 py-3 text-right font-medium text-[#1d2b3e]">
                        {{ fmtAmt(j.montant) }}
                      </td>
                      <td class="px-4 py-3 text-[#44474c]">{{ fmtDate(j.echeance) }}</td>
                      <td class="px-4 py-3">
                        <div class="flex gap-1.5">
                          <button (click)="doValidateJalon(j.id)"
                            class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                                   hover:bg-[#a7f3d0] transition-colors">
                            Valider
                          </button>
                          <button (click)="openRfRefuseModal(j.id, 'jalon')"
                            class="px-2 py-1 text-xs rounded-lg font-medium bg-[#fee2e2] text-[#991b1b]
                                   hover:bg-[#fecaca] transition-colors">
                            Refuser
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }

      <!-- ── DF Tab ─────────────────────────────────────────────── -->
      @if (activeTab() === 'df') {
        @if (dfLoading()) {
          <div class="text-sm text-[#64748b] text-center py-10">Chargement…</div>
        } @else if (pendingLines().length === 0) {
          <div class="text-sm text-[#64748b] text-center py-10">
            <span class="material-symbols-outlined text-4xl text-[#c5c6cd] block mb-2">check_circle</span>
            Aucune ligne en attente de validation DF.
          </div>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
                  <th class="px-4 py-3 text-left">Affaire</th>
                  <th class="px-4 py-3 text-left">Référence</th>
                  <th class="px-4 py-3 text-left">Période</th>
                  <th class="px-4 py-3 text-right">Montant HT</th>
                  <th class="px-4 py-3 text-left">Mode</th>
                  <th class="px-4 py-3 text-left">Statut</th>
                  <th class="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#f1f5f9]">
                @for (line of pendingLines(); track line.id) {
                  <tr class="hover:bg-[#f8fafc] transition-colors">
                    <td class="px-4 py-3">
                      <a [routerLink]="['/fact/affaires', line.affaireId]"
                        class="font-medium text-[#1a6b7c] hover:underline">
                        {{ line.affaireRef }}
                      </a>
                      <p class="text-xs text-[#64748b]">{{ line.affaireIntitule }}</p>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-[#44474c]">{{ line.reference }}</td>
                    <td class="px-4 py-3 text-[#44474c]">{{ line.periode || '—' }}</td>
                    <td class="px-4 py-3 text-right font-medium text-[#1d2b3e]">{{ fmtAmt(line.montantHt) }}</td>
                    <td class="px-4 py-3 text-xs font-mono text-[#44474c]">{{ line.mode }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        [style.background]="lineCfg(line.statut).bg"
                        [style.color]="lineCfg(line.statut).color"
                        [style.borderColor]="lineCfg(line.statut).border">
                        {{ lineCfg(line.statut).label }}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex gap-1.5">
                        <button (click)="doValidateDF(line.id)"
                          class="px-2 py-1 text-xs rounded-lg font-medium bg-[#d1fae5] text-[#065f46]
                                 hover:bg-[#a7f3d0] transition-colors">
                          Valider
                        </button>
                        <button (click)="openDfRetourModal(line.id)"
                          class="px-2 py-1 text-xs rounded-lg font-medium bg-[#ffedd5] text-[#9a3412]
                                 hover:bg-[#fed7aa] transition-colors">
                          Retourner
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      <!-- ── History Tab ────────────────────────────────────────── -->
      @if (activeTab() === 'history') {
        @if (histLoading()) {
          <div class="text-sm text-[#64748b] text-center py-10">Chargement…</div>
        } @else if (auditLog().length === 0) {
          <div class="text-sm text-[#64748b] text-center py-10">Aucun historique disponible.</div>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-[#eceef0]">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-[#f8fafc] text-xs font-semibold text-[#64748b] uppercase tracking-wide">
                  <th class="px-4 py-3 text-left">Date</th>
                  <th class="px-4 py-3 text-left">Utilisateur</th>
                  <th class="px-4 py-3 text-left">Action</th>
                  <th class="px-4 py-3 text-left">Entité</th>
                  <th class="px-4 py-3 text-left">Commentaire</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#f1f5f9]">
                @for (entry of auditLog(); track entry.id) {
                  <tr class="hover:bg-[#f8fafc] transition-colors">
                    <td class="px-4 py-3 text-[#44474c] whitespace-nowrap">{{ fmtDateTime(entry.createdAt) }}</td>
                    <td class="px-4 py-3 text-[#1d2b3e] font-medium">{{ entry.userNom }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                   bg-[#f0f4f8] text-[#44474c] border border-[#eceef0]">
                        {{ entry.action }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-xs text-[#64748b]">{{ entry.entityType }} #{{ entry.entityId }}</td>
                    <td class="px-4 py-3 text-xs text-[#64748b] max-w-xs truncate">
                      {{ entry.commentaire || '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

    </div>
  </div>

</div>

<!-- RF Refuse modal -->
@if (showRfRefuseModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showRfRefuseModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">Motif de refus</h3>
      <textarea [(ngModel)]="rfRefuseMotif" rows="3" maxlength="500"
        class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm resize-none
               focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
        placeholder="Raison du refus…"></textarea>
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showRfRefuseModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          Annuler
        </button>
        <button (click)="submitRfRefuse()"
          [ngClass]="rfRefuseMotif.trim()
            ? 'bg-[#dc2626] hover:bg-[#b91c1c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          Refuser
        </button>
      </div>
    </div>
  </div>
}

<!-- DF Retour modal -->
@if (showDfRetourModal()) {
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    (click)="$event.target === $event.currentTarget && showDfRetourModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
      <h3 class="text-base font-semibold text-[#1d2b3e] mb-4">Motif de retour</h3>
      <textarea [(ngModel)]="dfRetourMotif" rows="3" maxlength="500"
        class="w-full border border-[#eceef0] rounded-xl px-3 py-2 text-sm resize-none
               focus:outline-none focus:ring-2 focus:ring-[#1a6b7c]/30"
        placeholder="Raison du retour…"></textarea>
      <div class="flex justify-end gap-3 mt-4">
        <button (click)="showDfRetourModal.set(false)"
          class="px-4 py-2 text-sm rounded-xl border border-[#eceef0] text-[#44474c] hover:bg-[#f8fafc]">
          Annuler
        </button>
        <button (click)="submitDfRetour()"
          [ngClass]="dfRetourMotif.trim()
            ? 'bg-[#1a6b7c] hover:bg-[#134f5c] cursor-pointer'
            : 'bg-[#c5c6cd] cursor-not-allowed'"
          class="px-4 py-2 text-sm rounded-xl text-white font-medium transition-colors">
          Confirmer
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc = inject(BillingService);

  readonly tabs = TABS;

  activeTab      = signal<ActiveTab>('rf');
  rfLoading      = signal(false);
  dfLoading      = signal(false);
  histLoading    = signal(false);

  pendingTaux    = signal<PendingTauxDto[]>([]);
  pendingJalons  = signal<PendingJalonDto[]>([]);
  pendingLines   = signal<PendingBillingLineDto[]>([]);
  auditLog       = signal<AuditLogEntryDto[]>([]);

  // RF refuse
  showRfRefuseModal = signal(false);
  rfRefuseMotif     = '';
  private rfRefuseId   = 0;
  private rfRefuseType: 'taux' | 'jalon' = 'taux';

  // DF retour
  showDfRetourModal = signal(false);
  dfRetourMotif     = '';
  private dfRetourLineId = 0;

  ngOnInit(): void { this.loadRF(); }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'rf')      this.loadRF();
    if (tab === 'df')      this.loadDF();
    if (tab === 'history') this.loadHistory();
  }

  private loadRF(): void {
    this.rfLoading.set(true);
    this.svc.getPendingTaux().subscribe({
      next:  t => { this.pendingTaux.set(t); this.rfLoading.set(false); },
      error: () => this.rfLoading.set(false),
    });
    this.svc.getPendingJalons().subscribe({
      next:  j => this.pendingJalons.set(j),
    });
  }

  private loadDF(): void {
    this.dfLoading.set(true);
    this.svc.getPendingDFLines().subscribe({
      next:  l => { this.pendingLines.set(l); this.dfLoading.set(false); },
      error: () => this.dfLoading.set(false),
    });
  }

  private loadHistory(): void {
    this.histLoading.set(true);
    this.svc.getAuditLog().subscribe({
      next:  a => { this.auditLog.set(a); this.histLoading.set(false); },
      error: () => this.histLoading.set(false),
    });
  }

  doValidateTaux(id: number): void {
    this.svc.validateTaux(id).subscribe({ next: () => this.loadRF() });
  }

  doValidateJalon(id: number): void {
    this.svc.validateJalon(id).subscribe({ next: () => this.loadRF() });
  }

  openRfRefuseModal(id: number, type: 'taux' | 'jalon'): void {
    this.rfRefuseId   = id;
    this.rfRefuseType = type;
    this.rfRefuseMotif = '';
    this.showRfRefuseModal.set(true);
  }

  submitRfRefuse(): void {
    if (!this.rfRefuseMotif.trim()) return;
    const motif = this.rfRefuseMotif.trim();
    if (this.rfRefuseType === 'taux') {
      this.svc.refuseTaux(this.rfRefuseId, motif).subscribe({
        next: () => { this.showRfRefuseModal.set(false); this.loadRF(); },
      });
    } else {
      this.svc.refuseJalon(this.rfRefuseId, motif).subscribe({
        next: () => { this.showRfRefuseModal.set(false); this.loadRF(); },
      });
    }
  }

  doValidateDF(lineId: number): void {
    this.svc.validateDF(lineId).subscribe({ next: () => this.loadDF() });
  }

  openDfRetourModal(lineId: number): void {
    this.dfRetourLineId = lineId;
    this.dfRetourMotif = '';
    this.showDfRetourModal.set(true);
  }

  submitDfRetour(): void {
    if (!this.dfRetourMotif.trim()) return;
    this.svc.returnDF(this.dfRetourLineId, this.dfRetourMotif.trim()).subscribe({
      next: () => { this.showDfRetourModal.set(false); this.loadDF(); },
    });
  }

  lineCfg(statut: string) {
    return LINE_STATUT[statut] ?? { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  }

  fmtAmt(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  fmtDateTime(d: string): string {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
