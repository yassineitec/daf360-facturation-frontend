import { Component, OnInit, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FormFieldComponent } from '@khalilrebhiitec/daf360';
import { InvoiceService } from '../invoice.service';
import { ReminderDto } from '../invoice.model';

@Component({
  selector: 'app-reminders-panel',
  imports: [TranslatePipe, FormFieldComponent],
  template: `
<div class="reminders-panel">
  <div class="panel-header">
    <span class="panel-title">{{ 'INVOICING.REMINDERS.TITLE' | translate }}</span>
    <span class="panel-badge" [class.badge-active]="remindersActive()" [class.badge-suspended]="!remindersActive()">
      {{ remindersActive() ? ('INVOICING.REMINDERS.ACTIVE' | translate) : ('INVOICING.REMINDERS.SUSPENDED' | translate) }}
    </span>

    @if (remindersActive()) {
      <button class="action-link action-link--warn" (click)="openSuspend()">
        {{ 'INVOICING.REMINDERS.SUSPEND' | translate }}
      </button>
    } @else {
      <button class="action-link action-link--ok" (click)="reactivate()">
        {{ 'INVOICING.REMINDERS.REACTIVATE' | translate }}
      </button>
    }
  </div>

  @if (loading()) {
    <div class="loading-text">{{ 'INVOICING.REMINDERS.LOADING' | translate }}</div>
  } @else {
    <div class="reminders-list">
      @for (r of reminders(); track r.id) {
        <div class="reminder-row" [class.sent]="r.isSent" [class.suspended]="r.isSuspended">
          <span class="reminder-type">{{ reminderLabel(r.reminderType) | translate }}</span>
          <span class="reminder-date">{{ formatDate(r.scheduledDate) }}</span>
          <span class="reminder-status">
            @if (r.isSent) {
              <span class="badge-sent">{{ 'INVOICING.REMINDERS.STATUS.SENT' | translate }}</span>
            } @else if (r.isSuspended) {
              <span class="badge-susp">{{ 'INVOICING.REMINDERS.STATUS.SUSPENDED' | translate }}</span>
            } @else {
              <span class="badge-pending">{{ 'INVOICING.REMINDERS.STATUS.PENDING' | translate }}</span>
            }
          </span>
        </div>
      }
      @empty {
        <div class="empty-reminders">{{ 'INVOICING.REMINDERS.EMPTY' | translate }}</div>
      }
    </div>
  }

  @if (showSuspendForm()) {
    <div class="suspend-form">
      <daf-form-field
        [options]="{ label: ('INVOICING.REMINDERS.SUSPEND_FORM.LABEL' | translate), placeholder: ('INVOICING.REMINDERS.SUSPEND_FORM.PLACEHOLDER' | translate), maxLength: 200 }"
        [value]="suspendReason"
        (valueChange)="suspendReason = $any($event) ?? ''" />
      <div class="suspend-actions">
        <button class="btn-cancel" (click)="showSuspendForm.set(false)">
          {{ 'INVOICING.REMINDERS.SUSPEND_FORM.CANCEL' | translate }}
        </button>
        <button class="btn-warn" (click)="confirmSuspend()">
          {{ 'INVOICING.REMINDERS.SUSPEND_FORM.CONFIRM' | translate }}
        </button>
      </div>
    </div>
  }

  @if (error()) {
    <div class="error-msg">{{ error() }}</div>
  }
</div>
  `,
  styleUrl: './reminders-panel.component.scss',
})
export class RemindersPanelComponent implements OnInit {
  private readonly svc = inject(InvoiceService);

  invoiceId       = input.required<number>();
  remindersActive = input.required<boolean>();

  reminders       = signal<ReminderDto[]>([]);
  loading         = signal(false);
  error           = signal<string | null>(null);
  showSuspendForm = signal(false);
  suspendReason   = '';

  /**
   * Les types que le backend écrit réellement (`InvoiceService.createReminderSchedule`).
   * Les clés précédentes (`J0`, `J_7`, `J0_ECH`, `J7`, `J15`, `J30`) n'existaient dans
   * aucune ligne de `payment_reminders` : chaque relance s'affichait avec son code brut.
   */
  private readonly REMINDER_LABELS: Record<string, string> = {
    J_MINUS_7: 'INVOICING.REMINDER_TYPE.J_MINUS_7',
    ECHEANCE:  'INVOICING.REMINDER_TYPE.ECHEANCE',
    J_PLUS_7:  'INVOICING.REMINDER_TYPE.J_PLUS_7',
    J_PLUS_30: 'INVOICING.REMINDER_TYPE.J_PLUS_30',
    J_PLUS_60: 'INVOICING.REMINDER_TYPE.J_PLUS_60',
  };

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getReminders(this.invoiceId()).subscribe({
      next:  r => { this.reminders.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openSuspend(): void { this.showSuspendForm.set(true); this.suspendReason = ''; }

  confirmSuspend(): void {
    this.svc.suspendReminders(this.invoiceId(), this.suspendReason.trim() || null).subscribe({
      next:  () => { this.showSuspendForm.set(false); this.load(); },
      error: err => this.error.set(err?.error?.message ?? 'Erreur.'),
    });
  }

  reactivate(): void {
    this.svc.reactivateReminders(this.invoiceId()).subscribe({
      next:  () => this.load(),
      error: err => this.error.set(err?.error?.message ?? 'Erreur.'),
    });
  }

  reminderLabel(t: string): string {
    return this.REMINDER_LABELS[t] ?? t;
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
