import { Component, input, output, signal, inject } from '@angular/core';
import { TsDto, TS_STATUT_CONFIG } from '../affaire.model';
import { AffaireService } from '../affaire.service';
import { UserStore } from '../../../core/user.store';
import { TsValidationModalComponent, ValidationConfig } from './ts-validation-modal.component';

@Component({
  selector: 'app-ts-list',
  imports: [TsValidationModalComponent],
  template: `
    <div class="ts-list">

      @if (errorMsg()) {
        <div class="ts-error">{{ errorMsg() }}</div>
      }

      @if (list().length === 0) {
        <div class="ts-empty">Aucun TS lié à cette affaire.</div>
      } @else {
        <div class="ts-table-wrap">
          <table class="ts-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Intitulé</th>
                <th class="num-col">Montant</th>
                <th>Statut</th>
                <th>Intégré le</th>
                <th class="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (ts of list(); track ts.id) {
                <tr>
                  <td><span class="ref-badge">{{ ts.referenceTs }}</span></td>
                  <td class="intitule-cell">{{ ts.intitule }}</td>
                  <td class="num-col">{{ formatAmount(ts.montantEstime, ts.devise) }}</td>
                  <td><span class="ts-badge" [style.background]="tsConfig(ts.statut).bg" [style.color]="tsConfig(ts.statut).color" [style.border-color]="tsConfig(ts.statut).border">{{ tsConfig(ts.statut).label }}</span></td>
                  <td>{{ formatDate(ts.integreAuBudgetAt) }}</td>
                  <td class="actions-cell">
                    @if (canValidateTechnique(ts)) {
                      <button class="action-btn action-btn--blue" (click)="openValidation(ts, 'technique')" [disabled]="actionLoading()">
                        Valider Techn.
                      </button>
                    }
                    @if (canValidateCommerciale(ts)) {
                      <button class="action-btn action-btn--indigo" (click)="openValidation(ts, 'commerciale')" [disabled]="actionLoading()">
                        Valider Comm.
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (validationTarget()) {
      <app-ts-validation-modal
        [config]="validationTarget()!"
        (confirmed)="onValidationConfirmed($event)"
        (cancelled)="validationTarget.set(null)" />
    }
  `,
  styleUrl: './ts-list.component.scss',
})
export class TsListComponent {
  affaireId   = input.required<number>();
  list        = input.required<TsDto[]>();
  updated     = output<void>();
  openNewForm = output<void>();

  private readonly svc   = inject(AffaireService);
  private readonly store = inject(UserStore);

  actionLoading    = signal(false);
  errorMsg         = signal<string | null>(null);
  validationTarget = signal<ValidationConfig | null>(null);

  tsConfig(statut: string) {
    return TS_STATUT_CONFIG[statut] ?? { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  }

  canValidateTechnique(ts: TsDto): boolean {
    return ts.statut === 'CREATED' && this.store.hasPermission('FACT_VALID_TECHNIQUE_TS');
  }

  canValidateCommerciale(ts: TsDto): boolean {
    return ts.statut === 'VALID_TECHNIQUE' && this.store.hasPermission('FACT_VALID_COMMERCIALE_TS');
  }

  openValidation(ts: TsDto, step: 'technique' | 'commerciale'): void {
    this.validationTarget.set({
      tsId:     ts.id,
      step,
      intitule: ts.intitule,
      montant:  ts.montantEstime,
      devise:   ts.devise,
    });
  }

  onValidationConfirmed(notes: string | null): void {
    const cfg = this.validationTarget();
    if (!cfg) return;
    this.actionLoading.set(true);
    this.errorMsg.set(null);

    const obs = cfg.step === 'technique'
      ? this.svc.validerTechnique(cfg.tsId, { notes })
      : this.svc.validerCommerciale(cfg.tsId, { notes });

    obs.subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.validationTarget.set(null);
        this.updated.emit();
      },
      error: err => {
        this.actionLoading.set(false);
        this.validationTarget.set(null);
        this.errorMsg.set(err?.error?.message ?? 'Erreur lors de la validation.');
      },
    });
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
