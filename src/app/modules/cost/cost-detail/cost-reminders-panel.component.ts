import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormFieldComponent } from '@khalilrebhiitec/daf360';
import { CostService } from '../cost.service';
import { CostReminderDto } from '../cost.model';
import { formatDate } from '../../payments/payments-display';

/**
 * "Relances" tab on the cost-invoice detail page. Mirrors RemindersPanelComponent
 * (client invoicing side), but derives the active/suspended badge from the reminder
 * rows themselves rather than trusting a boolean input — the client-side original's
 * `remindersActive` input doesn't actually come from anywhere real in that API
 * response (confirmed in this session's reminder-system research); this component
 * is written correctly from the start using the same derived pattern already proven
 * in recouvrement-detail.component.ts.
 */
@Component({
  selector: 'app-cost-reminders-panel',
  imports: [TranslatePipe, FormFieldComponent],
  template: `
<div class="reminders-panel">
  <div class="panel-header">
    <span class="panel-title">{{ 'COST.REMINDERS.TITLE' | translate }}</span>
    <span class="panel-badge" [class.badge-active]="remindersActive()" [class.badge-suspended]="!remindersActive()">
      {{ remindersActive() ? ('COST.REMINDERS.ACTIVE' | translate) : ('COST.REMINDERS.SUSPENDED' | translate) }}
    </span>

    @if (remindersActive()) {
      <button class="action-link action-link--warn" (click)="openSuspend()">
        {{ 'COST.REMINDERS.SUSPEND' | translate }}
      </button>
    } @else if (hasSuspended()) {
      <button class="action-link action-link--ok" (click)="reactivate()">
        {{ 'COST.REMINDERS.REACTIVATE' | translate }}
      </button>
    }
  </div>

  @if (loading()) {
    <div class="loading-text">{{ 'COST.REMINDERS.LOADING' | translate }}</div>
  } @else {
    <div class="reminders-list">
      @for (r of reminders(); track r.id) {
        <div class="reminder-row" [class.sent]="r.isSent" [class.suspended]="r.isSuspended">
          <span class="reminder-type">{{ reminderLabel(r) }}</span>
          <span class="reminder-date">{{ formatDate(r.scheduledDate) }}</span>
          <span class="reminder-status">
            @if (r.isSent) {
              <span class="badge-sent">{{ 'COST.REMINDERS.STATUS.SENT' | translate }}</span>
            } @else if (r.isSuspended) {
              <span class="badge-susp">{{ 'COST.REMINDERS.STATUS.SUSPENDED' | translate }}</span>
            } @else {
              <span class="badge-pending">{{ 'COST.REMINDERS.STATUS.PENDING' | translate }}</span>
            }
          </span>
        </div>
      }
      @empty {
        <div class="empty-reminders">{{ 'COST.REMINDERS.EMPTY' | translate }}</div>
      }
    </div>
  }

  @if (showSuspendForm()) {
    <div class="suspend-form">
      <daf-form-field
        [options]="{ label: ('COST.REMINDERS.SUSPEND_FORM.LABEL' | translate), placeholder: ('COST.REMINDERS.SUSPEND_FORM.PLACEHOLDER' | translate), maxLength: 200 }"
        [value]="suspendReason"
        (valueChange)="suspendReason = $any($event) ?? ''" />
      <div class="suspend-actions">
        <button class="btn-cancel" (click)="showSuspendForm.set(false)">
          {{ 'COST.REMINDERS.SUSPEND_FORM.CANCEL' | translate }}
        </button>
        <button class="btn-warn" (click)="confirmSuspend()">
          {{ 'COST.REMINDERS.SUSPEND_FORM.CONFIRM' | translate }}
        </button>
      </div>
    </div>
  }

  @if (error()) {
    <div class="error-msg">{{ error() }}</div>
  }
</div>
  `,
  styleUrl: './cost-reminders-panel.component.scss',
})
export class CostRemindersPanelComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly translate = inject(TranslateService);

  costInvoiceId = input.required<number>();

  reminders       = signal<CostReminderDto[]>([]);
  loading         = signal(false);
  error           = signal<string | null>(null);
  showSuspendForm = signal(false);
  suspendReason   = '';

  readonly remindersActive = computed(() =>
    this.reminders().some(r => !r.isSent && !r.isSuspended));

  readonly hasSuspended = computed(() =>
    this.reminders().some(r => !r.isSent && r.isSuspended));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getCostInvoiceReminders(this.costInvoiceId()).subscribe({
      next:  r => { this.reminders.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openSuspend(): void { this.showSuspendForm.set(true); this.suspendReason = ''; }

  confirmSuspend(): void {
    this.svc.suspendCostInvoiceReminders(this.costInvoiceId(), this.suspendReason.trim() || null).subscribe({
      next:  () => { this.showSuspendForm.set(false); this.load(); },
      error: err => this.error.set(err?.error?.detail ?? err?.error?.message ?? 'Erreur.'),
    });
  }

  reactivate(): void {
    this.svc.reactivateCostInvoiceReminders(this.costInvoiceId()).subscribe({
      next:  () => this.load(),
      error: err => this.error.set(err?.error?.detail ?? err?.error?.message ?? 'Erreur.'),
    });
  }

  reminderLabel(r: CostReminderDto): string {
    const label = this.translate.currentLang() === 'en' ? r.labelEn : r.labelFr;
    return label ?? r.reminderType;
  }

  formatDate(d: string | null): string {
    return formatDate(d, this.translate.currentLang());
  }
}
