import { Component, inject, input, output, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { InvoiceService } from '../../invoice.service';
import { CONDITIONS_PAIEMENT } from '../../invoice.model';
import { StepAffaireValue } from './step-affaire.component';
import { StepLinesValue } from './step-lines.component';
import { StepConditionsValue } from './step-conditions.component';

@Component({
  selector: 'app-step-recap',
  standalone: true,
  imports: [TranslatePipe],
  template: `
<div class="step-recap">

  <!-- Informations générales -->
  <div class="recap-section">
    <h3>{{ 'INVOICING.STEP_RECAP.INFO_TITLE' | translate }}</h3>
    <div class="recap-grid">
      <div class="recap-row">
        <span class="recap-label">{{ 'INVOICING.STEP_RECAP.TYPE' | translate }}</span>
        <span class="recap-val">{{ ('INVOICING.INVOICE_TYPE.' + affaireData().invoiceType) | translate }}</span>
      </div>
      @if (affaireData().affaireId) {
        <div class="recap-row">
          <span class="recap-label">{{ 'INVOICING.STEP_RECAP.AFFAIRE' | translate }}</span>
          <span class="recap-val">ID {{ affaireData().affaireId }}</span>
        </div>
      }
      <div class="recap-row">
        <span class="recap-label">{{ 'INVOICING.STEP_RECAP.CONDITIONS' | translate }}</span>
        <span class="recap-val">{{ conditionLabel(conditionsData().conditionsPaiement) | translate }}</span>
      </div>
      <div class="recap-row">
        <span class="recap-label">{{ 'INVOICING.STEP_RECAP.DUE_DATE' | translate }}</span>
        <span class="recap-val">{{ formatDate(conditionsData().dateEcheance) }}</span>
      </div>
      @if (conditionsData().bonDeCommande) {
        <div class="recap-row">
          <span class="recap-label">{{ 'INVOICING.STEP_RECAP.BDC' | translate }}</span>
          <span class="recap-val">{{ conditionsData().bonDeCommande }}</span>
        </div>
      }
    </div>
  </div>

  <!-- Lignes -->
  <div class="recap-section">
    <h3>{{ 'INVOICING.STEP_RECAP.LINES_TITLE' | translate }}</h3>
    <table class="recap-lines">
      <thead>
        <tr>
          <th>{{ 'INVOICING.STEP_RECAP.DESC' | translate }}</th>
          <th>{{ 'INVOICING.STEP_RECAP.QTY' | translate }}</th>
          <th>{{ 'INVOICING.STEP_RECAP.UNIT_PRICE' | translate }}</th>
          <th>{{ 'INVOICING.STEP_RECAP.VAT' | translate }}</th>
          <th>{{ 'INVOICING.STEP_RECAP.TOTAL_HT' | translate }}</th>
          <th>{{ 'INVOICING.STEP_RECAP.TOTAL_TTC' | translate }}</th>
        </tr>
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
          <td colspan="4" class="total-label">{{ 'INVOICING.STEP_RECAP.TOTAL' | translate }}</td>
          <td class="num total-ht">{{ formatAmount(totalHt()) }}</td>
          <td class="num total-ttc">{{ formatAmount(totalTtc()) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Rappels planifiés -->
  <div class="recap-section">
    <h3>{{ 'INVOICING.STEP_RECAP.REMINDERS_TITLE' | translate }}</h3>
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

  @if (showActions()) {
  <div class="step-actions">
    <button type="button" class="btn-back" (click)="prevStep.emit()">
      <span class="material-symbols-outlined">arrow_back</span>
      {{ 'INVOICING.STEP_RECAP.BACK' | translate }}
    </button>
    <div class="recap-actions">
      <button type="button" class="btn-draft" [disabled]="saving()" (click)="saveDraft()">
        <span class="material-symbols-outlined">save</span>
        {{ saving() ? ('INVOICING.STEP_RECAP.SAVING' | translate) : ('INVOICING.STEP_RECAP.DRAFT' | translate) }}
      </button>
      <button type="button" class="btn-submit" [disabled]="saving()" (click)="saveAndSubmit()">
        {{ saving() ? ('INVOICING.STEP_RECAP.SENDING' | translate) : ('INVOICING.STEP_RECAP.SUBMIT' | translate) }}
        <span class="material-symbols-outlined">send</span>
      </button>
    </div>
  </div>
  }
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepRecapComponent {
  private readonly svc       = inject(InvoiceService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  showActions    = input<boolean>(true);
  affaireData    = input.required<StepAffaireValue>();
  linesData      = input.required<StepLinesValue>();
  conditionsData = input.required<StepConditionsValue>();
  prevStep       = output<void>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  readonly totalHt = computed(() =>
    this.linesData().lines.reduce((s, l) => s + l.quantity * l.unitRate, 0)
  );
  readonly totalTtc = computed(() =>
    this.linesData().lines.reduce((s, l) => s + l.quantity * l.unitRate * (1 + l.vatRatePct / 100), 0)
  );

  readonly reminderPreview = computed(() => {
    this.translate.currentLang();
    const echeance = this.conditionsData().dateEcheance;
    if (!echeance) return [];
    const t = (k: string) => this.translate.instant(k);
    const due = new Date(echeance);
    const offsetDays = (d: number) => {
      const dt = new Date(due); dt.setDate(dt.getDate() + d);
      return this.formatDate(dt.toISOString().slice(0, 10));
    };
    return [
      { label: t('INVOICING.STEP_RECAP.REMINDERS.J_MINUS_7'), date: offsetDays(-7) },
      { label: t('INVOICING.STEP_RECAP.REMINDERS.J0'),        date: offsetDays(0)  },
      { label: t('INVOICING.STEP_RECAP.REMINDERS.J7'),        date: offsetDays(7)  },
      { label: t('INVOICING.STEP_RECAP.REMINDERS.J15'),       date: offsetDays(15) },
      { label: t('INVOICING.STEP_RECAP.REMINDERS.J30'),       date: offsetDays(30) },
    ];
  });

  conditionLabel(code: string): string {
    return CONDITIONS_PAIEMENT[code as keyof typeof CONDITIONS_PAIEMENT] ?? code;
  }

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
      next:  inv => { this.saving.set(false); this.router.navigate(['..', inv.id], { relativeTo: this.route }); },
      error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  saveAndSubmit(): void {
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.createDraft(this.buildRequest()).subscribe({
      next: inv => {
        this.svc.submit(inv.id).subscribe({
          next:  () => { this.saving.set(false); this.router.navigate(['..', inv.id], { relativeTo: this.route }); },
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
