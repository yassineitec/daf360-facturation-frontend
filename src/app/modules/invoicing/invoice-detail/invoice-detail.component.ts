import { Component, OnInit, inject, input, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoiceService } from '../invoice.service';
import {
  InvoiceDetail, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS, InvoiceStatut, CONDITIONS_PAIEMENT,
} from '../invoice.model';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { PageHeaderComponent } from '../../../shared/page-header.component';
import { PaymentModalComponent } from '../payment-modal.component';
import { CreditNoteModalComponent } from './credit-note-modal.component';
import { RemindersPanelComponent } from './reminders-panel.component';
import { PermissionDirective } from '../../../shared/permission.directive';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  CardComponent, ButtonComponent,
  StepperComponent, StepperStep, StepperConfig,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, BadgeOptions,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-invoice-detail',
  imports: [
    RouterLink, FormsModule,
    StatusBadgeComponent,
    PageHeaderComponent,
    PaymentModalComponent,
    CreditNoteModalComponent,
    RemindersPanelComponent,
    PermissionDirective,
    CardComponent, ButtonComponent, StepperComponent, TranslatePipe,
    DataTableComponent, DafCellDirective,
  ],
  templateUrl: './invoice-detail.component.html',
  styleUrl:    './invoice-detail.component.scss',
})
export class InvoiceDetailComponent implements OnInit {
  private readonly svc       = inject(InvoiceService);
  private readonly translate = inject(TranslateService);

  id = input<string>();

  invoice       = signal<InvoiceDetail | null>(null);
  loading       = signal(false);
  error         = signal<string | null>(null);
  actionError   = signal<string | null>(null);
  saving        = signal(false);

  showPaymentModal   = signal(false);
  showCreditNote     = signal(false);
  showDisputeForm    = signal(false);
  disputeReason      = '';
  showResolveForm    = signal(false);
  resolveNotes       = '';
  approvalDecision: 'APPROVE' | 'RETURN' | 'REJECT' = 'APPROVE';
  approvalComment    = '';

  // ── Status computeds ──────────────────────────────────────────────────────

  readonly statut = computed(() => this.invoice()?.statut ?? '');

  readonly statutConfig = computed(() =>
    INVOICE_STATUT_CONFIG[this.statut()] ?? { label: this.statut(), bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
  );

  readonly isOverdue = computed(() => {
    const inv = this.invoice();
    if (!inv || !OVERDUE_STATUTS.has(inv.statut)) return false;
    if (!inv.dateEcheance) return false;
    return new Date(inv.dateEcheance) < new Date();
  });

  readonly billingProgress = computed(() => {
    const map: Record<string, number> = {
      DRAFT: 5, SUBMITTED: 15, RETURNED: 10, APPROVED: 30,
      EMITTED: 50, SENT: 65, PARTIALLY_PAID: 75, PAID: 100,
      DISPUTED: 40, CANCELLED: 0, CREDIT_NOTED: 80,
    };
    return map[this.statut()] ?? 0;
  });

  readonly montantRestant = computed(() => {
    const inv = this.invoice();
    if (!inv) return 0;
    if (inv.statut === 'PAID') return 0;
    if (inv.statut === 'PARTIALLY_PAID') return inv.montantTtc / 2;
    return inv.montantTtc;
  });

  // ── Billing lines table ───────────────────────────────────────────────────

  readonly lineTableColumns = computed((): TableColumn[] => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'description', label: t('INVOICING.DETAIL.LINES.DESC'),        type: 'custom' },
      { key: 'status',      label: t('INVOICING.DETAIL.LINES.STATUS_COL'),  type: 'badge'  },
      { key: 'quantity',    label: t('INVOICING.DETAIL.LINES.QTY'),         type: 'number', align: 'right' },
      { key: 'unitRate',    label: t('INVOICING.DETAIL.LINES.UNIT_PRICE'),  type: 'custom', align: 'right' },
      { key: 'vatRatePct',  label: t('INVOICING.DETAIL.LINES.VAT'),         type: 'custom', align: 'right' },
      { key: 'lineTotal',   label: t('INVOICING.DETAIL.LINES.TOTAL_HT'),    type: 'custom', align: 'right' },
      { key: 'lineTtc',     label: t('INVOICING.DETAIL.LINES.TOTAL_TTC'),   type: 'custom', align: 'right' },
      { key: '_actions',    label: '',                                     type: 'custom', align: 'right', width: '56px' },
    ];
  });

  readonly lineTableConfig = computed((): TableConfig => ({
    hoverable:    true,
    emptyMessage: this.translate.instant('INVOICING.DETAIL.LINES.EMPTY'),
  }));

  readonly lineTableRows = computed(() => {
    this.translate.currentLang();
    const inv = this.invoice();
    if (!inv) return [];
    const activeLabel: string = this.translate.instant('INVOICING.DETAIL.LINES.ACTIVE');
    const statusOptions: BadgeOptions = { variant: 'success', pill: true };
    return inv.lines.map((line, idx) => ({
      id:          line.id ?? idx,
      description: line.description,
      status:      { label: activeLabel, options: statusOptions },
      quantity:    line.quantity,
      unitRate:    line.unitRate,
      vatRatePct:  line.vatRatePct,
      lineTotal:   line.lineTotal,
      lineTtc:     this.lineTtc(line),
      _raw:        line,
    }));
  });

  // ── Lifecycle stepper ─────────────────────────────────────────────────────

  readonly lifecycleSteps = computed((): StepperStep[] => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { title: t('INVOICING.LIFECYCLE.DRAFT')          },
      { title: t('INVOICING.LIFECYCLE.SUBMITTED')      },
      { title: t('INVOICING.LIFECYCLE.APPROVED')       },
      { title: t('INVOICING.LIFECYCLE.EMITTED')        },
      { title: t('INVOICING.LIFECYCLE.SENT')           },
      { title: t('INVOICING.LIFECYCLE.PARTIALLY_PAID') },
      { title: t('INVOICING.LIFECYCLE.DONE')           },
    ];
  });

  readonly detailStep = computed(() => {
    const map: Record<string, number> = {
      DRAFT: 1, RETURNED: 1,
      SUBMITTED: 2,
      APPROVED: 3,
      EMITTED: 4,
      SENT: 5, DISPUTED: 5,
      PARTIALLY_PAID: 6,
      PAID: 7, CREDIT_NOTED: 7, CANCELLED: 7,
    };
    return map[this.statut()] ?? 1;
  });

  readonly lifecycleConfig = computed((): StepperConfig => {
    this.translate.currentLang();
    const s = this.statut();
    const t = (k: string) => this.translate.instant(k);
    const cfgMap: Partial<Record<string, StepperConfig>> = {
      DRAFT:          { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.SUBMIT'),         showCancel: false },
      RETURNED:       { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.RESUBMIT'),       showCancel: false },
      SUBMITTED:      { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.CONFIRM'),        prevLabel: t('INVOICING.LIFECYCLE.ACTIONS.CANCEL'), showCancel: false },
      APPROVED:       { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.EMIT'),           showCancel: false },
      EMITTED:        { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.MARK_SENT'),      showCancel: false },
      SENT:           { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.RECORD_PAYMENT'), showCancel: false },
      PARTIALLY_PAID: { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.RECORD_PAYMENT'), showCancel: false },
      PAID:           { finishLabel: t('INVOICING.LIFECYCLE.ACTIONS.EMIT_CREDIT'),   showCancel: false },
      CREDIT_NOTED:   { finishLabel: t('INVOICING.LIFECYCLE.ACTIONS.CREDIT_DONE'),   showCancel: false },
      DISPUTED:       { nextLabel:   t('INVOICING.LIFECYCLE.ACTIONS.RESOLVE'),        showCancel: false },
      CANCELLED:      { finishLabel: t('INVOICING.LIFECYCLE.ACTIONS.CANCELLED'),      showCancel: false },
    };
    return cfgMap[s] ?? { showCancel: false };
  });

  readonly lifecycleStepValid = computed(() => !this.saving());

  onStepperNext(): void {
    switch (this.statut()) {
      case 'DRAFT':
      case 'RETURNED':       this.submitForReview(); break;
      case 'SUBMITTED':      this.approve();         break;
      case 'APPROVED':       this.emit();            break;
      case 'EMITTED':        this.markSent();        break;
      case 'SENT':
      case 'PARTIALLY_PAID': this.showPaymentModal.set(true); break;
      case 'DISPUTED':       this.showResolveForm.set(true);  break;
    }
  }

  onStepperPrev(): void {
    if (this.statut() === 'SUBMITTED') {
      this.approvalDecision = 'RETURN';
      this.approvalComment  = '';
    }
  }

  onStepperFinish(): void {
    if (this.statut() === 'PAID') this.showCreditNote.set(true);
  }

  // ── CRUD actions ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    const numId = Number(this.id());
    if (!numId) return;
    this.load(numId);
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getInvoice(id).subscribe({
      next:  inv => { this.invoice.set(inv); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger la facture.'); this.loading.set(false); },
    });
  }

  refresh(): void {
    const numId = Number(this.id());
    if (numId) this.load(numId);
  }

  submitForReview(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.submit(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  approve(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.approve(inv.id, { decision: this.approvalDecision, comment: this.approvalComment.trim() || null }).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  emit(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.emit(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  markSent(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.markSent(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  submitDispute(): void {
    const inv = this.invoice(); if (!inv || !this.disputeReason.trim()) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.openDispute(inv.id, { reason: this.disputeReason.trim() }).subscribe({
      next:  () => { this.saving.set(false); this.showDisputeForm.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  submitResolve(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.resolveDispute(inv.id, this.resolveNotes.trim() || null).subscribe({
      next:  () => { this.saving.set(false); this.showResolveForm.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  onPaymentClosed(saved: boolean): void   { this.showPaymentModal.set(false); if (saved) this.refresh(); }
  onCreditNoteClosed(saved: boolean): void { this.showCreditNote.set(false);  if (saved) this.refresh(); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  lineTtc(l: { quantity: number; unitRate: number; vatRatePct: number }): number {
    return l.quantity * l.unitRate * (1 + l.vatRatePct / 100);
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  conditionLabel(code: string): string {
    return CONDITIONS_PAIEMENT[code as keyof typeof CONDITIONS_PAIEMENT] ?? code;
  }
}
