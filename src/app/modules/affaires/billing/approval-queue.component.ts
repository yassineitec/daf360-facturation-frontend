import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink }                         from '@angular/router';
import { FormsModule }                        from '@angular/forms';
import {
  BillingService,
  PendingTauxDto, PendingJalonDto, PendingBillingLineDto, AuditLogEntryDto,
} from './billing.service';

type ActiveTab = 'rf' | 'df' | 'history';

const LINE_STATUT: Record<string, { label: string; bg: string; color: string; border: string }> = {
  EN_ATTENTE_DF: { label: 'En attente DF', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE_DF:     { label: 'Validé DF',     bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  FACTURE:       { label: 'Facturé',       bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  RETOURNE:      { label: 'Retourné',      bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  ANNULE:        { label: 'Annulé',        bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

const TABS: { key: ActiveTab; label: string; icon: string }[] = [
  { key: 'rf',      label: 'En attente RF', icon: 'approval' },
  { key: 'df',      label: 'En attente DF', icon: 'task_alt' },
  { key: 'history', label: 'Historique',    icon: 'history'  },
];

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc = inject(BillingService);

  readonly tabs = TABS;

  activeTab   = signal<ActiveTab>('rf');
  rfLoading   = signal(false);
  dfLoading   = signal(false);
  histLoading = signal(false);

  pendingTaux   = signal<PendingTauxDto[]>([]);
  pendingJalons = signal<PendingJalonDto[]>([]);
  pendingLines  = signal<PendingBillingLineDto[]>([]);
  auditLog      = signal<AuditLogEntryDto[]>([]);

  showRfRefuseModal = signal(false);
  rfRefuseMotif     = '';
  private rfRefuseId   = 0;
  private rfRefuseType: 'taux' | 'jalon' = 'taux';

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
      next: j => this.pendingJalons.set(j),
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
