import { Component, OnInit, inject, input, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InvoiceService } from './invoice.service';
import { ReminderDto } from './invoice.model';

@Component({
  selector: 'app-reminders-panel',
  imports: [FormsModule],
  template: `
<div class="reminders-panel">
  <div class="panel-header">
    <span class="panel-title">Rappels de paiement</span>
    <span class="panel-badge" [class.badge-active]="remindersActive()" [class.badge-suspended]="!remindersActive()">
      {{ remindersActive() ? 'Actifs' : 'Suspendus' }}
    </span>

    @if (remindersActive()) {
      <button class="action-link action-link--warn" (click)="openSuspend()">Suspendre</button>
    } @else {
      <button class="action-link action-link--ok" (click)="reactivate()">Réactiver</button>
    }
  </div>

  @if (loading()) {
    <div class="loading-text">Chargement des rappels…</div>
  } @else {
    <div class="reminders-list">
      @for (r of reminders(); track r.id) {
        <div class="reminder-row" [class.sent]="!!r.sentAt" [class.suspended]="r.suspended">
          <span class="reminder-type">{{ reminderLabel(r.reminderType) }}</span>
          <span class="reminder-date">{{ formatDate(r.scheduledAt) }}</span>
          <span class="reminder-status">
            @if (r.sentAt) { <span class="badge-sent">Envoyé</span> }
            @else if (r.suspended) { <span class="badge-susp">Suspendu</span> }
            @else { <span class="badge-pending">En attente</span> }
          </span>
        </div>
      }
      @empty {
        <div class="empty-reminders">Aucun rappel planifié.</div>
      }
    </div>
  }

  @if (showSuspendForm()) {
    <div class="suspend-form">
      <label>Motif de suspension</label>
      <input type="text" [(ngModel)]="suspendReason" maxlength="200" placeholder="Optionnel" class="suspend-input" />
      <div class="suspend-actions">
        <button class="btn-cancel" (click)="showSuspendForm.set(false)">Annuler</button>
        <button class="btn-warn" (click)="confirmSuspend()">Confirmer</button>
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

  invoiceId      = input.required<number>();
  remindersActive = input.required<boolean>();

  reminders      = signal<ReminderDto[]>([]);
  loading        = signal(false);
  error          = signal<string | null>(null);
  showSuspendForm = signal(false);
  suspendReason  = '';

  private readonly REMINDER_LABELS: Record<string, string> = {
    J0:     'Émission',
    J_7:    'J-7 échéance',
    J0_ECH: 'Jour échéance',
    J7:     'J+7 relance',
    J15:    'J+15 relance',
    J30:    'J+30 relance',
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
