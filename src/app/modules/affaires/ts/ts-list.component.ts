import { Component, input, output, signal, computed, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TsDto, TS_STATUT_CONFIG } from '../affaire.model';
import { AffaireService } from '../affaire.service';
import { UserStore } from '../../../core/user.store';
import { TsValidationModalComponent, ValidationConfig } from './ts-validation-modal.component';
import { DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig } from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-ts-list',
  imports: [TsValidationModalComponent, TranslatePipe, DataTableComponent, DafCellDirective],
  template: `
    <div class="ts-list">

      @if (errorMsg()) {
        <div class="ts-error">{{ errorMsg() }}</div>
      }

      <daf-data-table [columns]="tableColumns()" [rows]="tableRows()" [config]="tableConfig()">

        <ng-template dafCell="reference" let-row>
          <span class="ref-badge">{{ row['_raw'].referenceTs }}</span>
        </ng-template>

        <ng-template dafCell="intitule" let-row>
          <span class="intitule-cell">{{ row['_raw'].intitule }}</span>
        </ng-template>

        <ng-template dafCell="montant" let-row>
          {{ formatAmount(row['_raw'].montantEstime, row['_raw'].devise) }}
        </ng-template>

        <ng-template dafCell="statut" let-row>
          <span class="ts-badge" [style.background]="tsConfig(row['_raw'].statut).bg" [style.color]="tsConfig(row['_raw'].statut).color" [style.border-color]="tsConfig(row['_raw'].statut).border">{{ tsConfig(row['_raw'].statut).label }}</span>
        </ng-template>

        <ng-template dafCell="integre" let-row>
          {{ formatDate(row['_raw'].integreAuBudgetAt) }}
        </ng-template>

        <ng-template dafCell="actions" let-row>
          <div class="actions-cell">
            @if (canValidateTechnique(row['_raw'])) {
              <button class="action-btn action-btn--blue" (click)="openValidation(row['_raw'], 'technique')" [disabled]="actionLoading()">
                {{ 'AFFAIRES.ts.list.validate_technique' | translate }}
              </button>
            }
            @if (canValidateCommerciale(row['_raw'])) {
              <button class="action-btn action-btn--indigo" (click)="openValidation(row['_raw'], 'commerciale')" [disabled]="actionLoading()">
                {{ 'AFFAIRES.ts.list.validate_commerciale' | translate }}
              </button>
            }
          </div>
        </ng-template>

      </daf-data-table>
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
  private readonly translate = inject(TranslateService);

  actionLoading    = signal(false);
  errorMsg         = signal<string | null>(null);
  validationTarget = signal<ValidationConfig | null>(null);

  // ── Data table ───────────────────────────────────────────────────────────
  readonly tableColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'reference', label: this.translate.instant('AFFAIRES.ts.list.headers.reference'), type: 'custom' },
      { key: 'intitule',  label: this.translate.instant('AFFAIRES.ts.list.headers.intitule'),  type: 'custom' },
      { key: 'montant',   label: this.translate.instant('AFFAIRES.ts.list.headers.montant'),   type: 'custom', align: 'right' },
      { key: 'statut',    label: this.translate.instant('AFFAIRES.ts.list.headers.statut'),    type: 'custom' },
      { key: 'integre',   label: this.translate.instant('AFFAIRES.ts.list.headers.integre'),   type: 'custom' },
      { key: 'actions',   label: this.translate.instant('AFFAIRES.ts.list.headers.actions'),   type: 'custom', align: 'right' },
    ];
  });

  readonly tableRows = computed<TableRow[]>(() =>
    this.list().map(ts => ({ id: ts.id, _raw: ts }))
  );

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.actionLoading(),
    emptyMessage: this.translate.instant('AFFAIRES.ts.list.empty'),
  }));

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
        this.errorMsg.set(err?.error?.message ?? this.translate.instant('AFFAIRES.ts.errors.validation'));
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
