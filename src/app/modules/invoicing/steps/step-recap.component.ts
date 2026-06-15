import { Component, inject, input, output, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { StepAffaireValue } from './step-affaire.component';
import { StepLinesValue } from './step-lines.component';
import { StepConditionsValue } from './step-conditions.component';

@Component({
  selector: 'app-step-recap',
  imports: [],
  template: `
<div class="step-recap">

  <!-- Summary header -->
  <div class="recap-section">
    <h3>Récapitulatif</h3>
    <div class="recap-grid">
      <div class="recap-row">
        <span class="recap-label">Type</span>
        <span class="recap-val">{{ affaireData().invoiceType }}</span>
      </div>
      @if (affaireData().affaireId) {
        <div class="recap-row">
          <span class="recap-label">Affaire</span>
          <span class="recap-val">ID {{ affaireData().affaireId }}</span>
        </div>
      }
      <div class="recap-row">
        <span class="recap-label">Conditions</span>
        <span class="recap-val">{{ conditionsData().conditionsPaiement }}</span>
      </div>
      <div class="recap-row">
        <span class="recap-label">Échéance</span>
        <span class="recap-val">{{ formatDate(conditionsData().dateEcheance) }}</span>
      </div>
      @if (conditionsData().bonDeCommande) {
        <div class="recap-row">
          <span class="recap-label">BDC</span>
          <span class="recap-val">{{ conditionsData().bonDeCommande }}</span>
        </div>
      }
    </div>
  </div>

  <!-- Lines table -->
  <div class="recap-section">
    <h3>Lignes</h3>
    <table class="recap-lines">
      <thead>
        <tr><th>Description</th><th>Qté</th><th>PU HT</th><th>TVA</th><th>Total HT</th><th>Total TTC</th></tr>
      </thead>
      <tbody>
        @for (l of linesData().lines; track $index) {
          <tr>
            <td>{{ l.description }}</td>
            <td class="num">{{ l.quantity }}</td>
            <td class="num">{{ formatAmount(l.unitRate) }}</td>
            <td class="num">{{ l.vatRatePct }}%</td>
            <td class="num">{{ formatAmount(l.quantity * l.unitRate) }}</td>
            <td class="num">{{ formatAmount(l.quantity * l.unitRate * (1 + l.vatRatePct / 100)) }}</td>
          </tr>
        }
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" class="total-label">Total</td>
          <td class="num total-ht">{{ formatAmount(totalHt()) }}</td>
          <td class="num total-ttc">{{ formatAmount(totalTtc()) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Reminder schedule preview -->
  <div class="recap-section">
    <h3>Rappels planifiés (aperçu)</h3>
    <div class="reminder-preview-list">
      @for (r of reminderPreview(); track r.label) {
        <div class="reminder-preview-row">
          <span class="rp-label">{{ r.label }}</span>
          <span class="rp-date">{{ r.date }}</span>
        </div>
      }
    </div>
  </div>

  @if (serverError()) {
    <div class="server-error">{{ serverError() }}</div>
  }

  <div class="step-actions">
    <button type="button" class="btn-back" (click)="prevStep.emit()">← Retour</button>
    <button type="button" class="btn-draft" [disabled]="saving()" (click)="saveDraft()">
      {{ saving() ? 'Enregistrement…' : 'Enregistrer en brouillon' }}
    </button>
    <button type="button" class="btn-submit" [disabled]="saving()" (click)="saveAndSubmit()">
      {{ saving() ? 'Envoi…' : 'Soumettre pour validation' }}
    </button>
  </div>
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepRecapComponent {
  private readonly svc    = inject(InvoiceService);
  private readonly router = inject(Router);

  affaireData   = input.required<StepAffaireValue>();
  linesData     = input.required<StepLinesValue>();
  conditionsData = input.required<StepConditionsValue>();
  prevStep      = output<void>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  readonly totalHt = computed(() =>
    this.linesData().lines.reduce((s, l) => s + l.quantity * l.unitRate, 0)
  );
  readonly totalTtc = computed(() =>
    this.linesData().lines.reduce((s, l) => s + l.quantity * l.unitRate * (1 + l.vatRatePct / 100), 0)
  );

  readonly reminderPreview = computed(() => {
    const echeance = this.conditionsData().dateEcheance;
    if (!echeance) return [];
    const due = new Date(echeance);
    const offsetDays = (d: number) => {
      const t = new Date(due); t.setDate(t.getDate() + d);
      return this.formatDate(t.toISOString().slice(0, 10));
    };
    return [
      { label: 'J-7 (avant échéance)',     date: offsetDays(-7)  },
      { label: 'J+0 (jour échéance)',       date: offsetDays(0)   },
      { label: 'J+7 (1re relance)',         date: offsetDays(7)   },
      { label: 'J+15 (2e relance)',         date: offsetDays(15)  },
      { label: 'J+30 (3e relance)',         date: offsetDays(30)  },
    ];
  });

  private buildRequest() {
    const a = this.affaireData(), l = this.linesData(), c = this.conditionsData();
    return {
      paysId:      a.paysId,
      affaireId:   a.affaireId,
      clientId:    a.clientId,
      billingMode: a.billingMode,
      currency:    a.currency,
      tsId:        a.tsId,
      dueDate:     c.dateEcheance,
      notes:       c.notes,
      lines:       l.lines,
    };
  }

  saveDraft(): void {
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.createDraft(this.buildRequest()).subscribe({
      next:  inv => { this.saving.set(false); this.router.navigate(['/fact/invoicing', inv.id]); },
      error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  saveAndSubmit(): void {
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.createDraft(this.buildRequest()).subscribe({
      next: inv => {
        this.svc.submit(inv.id).subscribe({
          next:  () => { this.saving.set(false); this.router.navigate(['/fact/invoicing', inv.id]); },
          error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? 'Erreur lors de la soumission.'); },
        });
      },
      error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'TND', minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v);
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
