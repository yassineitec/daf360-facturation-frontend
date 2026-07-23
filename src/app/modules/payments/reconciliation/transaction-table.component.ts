import { Component, inject, input, output, signal, computed } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction, MATCH_STATUT_CONFIG } from '../payment.model';
import { ConfirmMatchModalComponent } from './confirm-match-modal.component';
import { ManualMatchModalComponent } from './manual-match-modal.component';
import { PartialMatchModalComponent } from './partial-match-modal.component';
import { AcompteModalComponent } from './acompte-modal.component';
import { TableColumn, TableRow, TableConfig, DataTableComponent, DafCellDirective } from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-transaction-table',
  imports: [ConfirmMatchModalComponent, ManualMatchModalComponent, PartialMatchModalComponent, AcompteModalComponent, TranslatePipe, DataTableComponent, DafCellDirective],
  template: `
<div class="tx-table-wrap">
  <daf-data-table
    [columns]="tableColumns()"
    [rows]="tableRows()"
    [config]="tableConfig()">

    <ng-template dafCell="date" let-row>
      <span class="date-cell">{{ formatDate(row['_raw'].transactionDate) }}</span>
    </ng-template>

    <ng-template dafCell="ref" let-row>
      <span class="ref-cell">{{ row['_raw'].reference ?? '—' }}</span>
    </ng-template>

    <ng-template dafCell="desc" let-row>
      <span class="desc-cell">{{ row['_raw'].description ?? '—' }}</span>
    </ng-template>

    <ng-template dafCell="amount" let-row>
      <span class="amount-cell">{{ formatAmount(row['_raw'].montant, row['_raw'].devise) }}</span>
    </ng-template>

    <ng-template dafCell="status" let-row>
      <span class="statut-cell">
        <span class="statut-badge"
          [style.background]="statutConfig(row['_raw'].statut).bg"
          [style.color]="statutConfig(row['_raw'].statut).color"
          [style.border-color]="statutConfig(row['_raw'].statut).border">
          {{ statutLabelKey(row['_raw'].statut) | translate }}
        </span>
        @if (row['_raw'].statut === 'PROPOSED' && row['_raw'].confidence !== null) {
          <span class="confidence">{{ row['_raw'].confidence }}%</span>
        }
      </span>
    </ng-template>

    <ng-template dafCell="invoice" let-row>
      <span class="invoice-cell">
        @if (row['_raw'].proposedInvoiceNumber) {
          <span class="prop-num">{{ row['_raw'].proposedInvoiceNumber }}</span>
          @if (row['_raw'].proposedClientNom) {
            <span class="prop-client">{{ row['_raw'].proposedClientNom }}</span>
          }
        } @else {
          <span class="no-proposal">—</span>
        }
      </span>
    </ng-template>

    <ng-template dafCell="actions" let-row>
      <div class="action-col" (click)="$event.stopPropagation()">
        @switch (row['_raw'].statut) {
          @case ('PROPOSED') {
            <div class="action-btns">
              <button class="btn-accept"  (click)="openConfirm(row['_raw'])">{{ 'PAYMENTS.TX_TABLE.BTN.CONFIRM' | translate }}</button>
              <button class="btn-partial" (click)="openPartial(row['_raw'])">{{ 'PAYMENTS.TX_TABLE.BTN.PARTIAL' | translate }}</button>
              <button class="btn-reject"  (click)="rejectTx(row['_raw'])">{{ 'PAYMENTS.TX_TABLE.BTN.REJECT' | translate }}</button>
            </div>
          }
          @case ('UNMATCHED') {
            <div class="action-btns">
              <button class="btn-manual"  (click)="openManual(row['_raw'])">{{ 'PAYMENTS.TX_TABLE.BTN.MATCH' | translate }}</button>
              <button class="btn-partial" (click)="openPartial(row['_raw'])">{{ 'PAYMENTS.TX_TABLE.BTN.PARTIAL' | translate }}</button>
              <button class="btn-acompte" (click)="openAcompte(row['_raw'])">{{ 'PAYMENTS.TX_TABLE.BTN.ACOMPTE' | translate }}</button>
            </div>
          }
          @default {}
        }
      </div>
    </ng-template>

  </daf-data-table>
</div>

@if (actionError()) {
  <div class="action-error">{{ actionError() }}</div>
}

@if (confirmTarget()) {
  <app-confirm-match-modal
    [tx]="confirmTarget()!"
    (dismissed)="confirmTarget.set(null)"
    (confirmed)="onConfirmed()" />
}

@if (manualTarget()) {
  <app-manual-match-modal
    [tx]="manualTarget()!"
    (dismissed)="manualTarget.set(null)"
    (confirmed)="onConfirmed()" />
}

@if (partialTarget()) {
  <app-partial-match-modal
    [tx]="partialTarget()!"
    (dismissed)="partialTarget.set(null)"
    (confirmed)="onPartialConfirmed()" />
}

@if (acompteTarget()) {
  <app-acompte-modal
    [tx]="acompteTarget()!"
    (dismissed)="acompteTarget.set(null)"
    (confirmed)="onAcompteConfirmed()" />
}
  `,
  styles: [`
    .tx-table-wrap {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
      overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .tx-table {
      width: 100%; border-collapse: collapse; font-size: 0.875rem;

      thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
      th {
        padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem;
        font-weight: 600; color: #64748b; text-transform: uppercase;
        letter-spacing: 0.04em; white-space: nowrap;
      }
      tbody tr.tx-row {
        border-bottom: 1px solid #f1f5f9;
        &:last-child { border-bottom: none; }
        &.tx-confirmed { background: #f0fdf4; }
        &.tx-rejected  { background: #fafafa; opacity: 0.75; }
        &.tx-partial   { background: #f0f9ff; }
        &.tx-acompte   { background: #faf5ff; }
      }
      td { padding: 0.75rem 1rem; color: #374151; vertical-align: middle; }
    }
    .num-col  { text-align: right; }
    .action-col { text-align: center; width: 210px; }
    .amount-cell { font-weight: 600; }
    .date-cell   { white-space: nowrap; }
    .ref-cell    { font-family: monospace; font-size: 0.8rem; color: #475569; }
    .desc-cell   { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .statut-cell { white-space: nowrap; }
    .statut-badge {
      display: inline-block; padding: 0.15rem 0.625rem; border-radius: 12px;
      font-size: 0.75rem; font-weight: 600; border: 1px solid;
    }
    .confidence {
      font-size: 0.75rem; color: #92400e; font-weight: 600; margin-left: 0.375rem;
    }
    .invoice-cell { display: flex; flex-direction: column; gap: 0.125rem; }
    .prop-num    { font-weight: 600; color: #0f172a; }
    .prop-client { font-size: 0.75rem; color: #64748b; }
    .no-proposal { color: #94a3b8; }
    .action-btns { display: flex; gap: 0.375rem; justify-content: center; }
    .btn-accept, .btn-reject, .btn-manual, .btn-partial, .btn-acompte {
      padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.775rem;
      font-weight: 500; cursor: pointer; border: 1px solid transparent; white-space: nowrap;
    }
    .btn-accept {
      background: #d1fae5; color: #065f46; border-color: #6ee7b7;
      &:hover { background: #a7f3d0; }
    }
    .btn-reject {
      background: #fee2e2; color: #991b1b; border-color: #fca5a5;
      &:hover { background: #fecaca; }
    }
    .btn-manual {
      background: #eff6ff; color: #1e40af; border-color: #93c5fd;
      &:hover { background: #dbeafe; }
    }
    .btn-partial {
      background: #e0f2fe; color: #0369a1; border-color: #7dd3fc;
      &:hover { background: #bae6fd; }
    }
    .btn-acompte {
      background: #faf5ff; color: #7c3aed; border-color: #c4b5fd;
      &:hover { background: #ede9fe; }
    }
    .empty-cell {
      text-align: center; color: #94a3b8; padding: 3rem 1rem; font-style: italic;
    }
    .action-error {
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; padding: 0.625rem 0.875rem; font-size: 0.875rem; margin-top: 0.5rem;
    }
  `],
})
export class TransactionTableComponent {
  private readonly svc       = inject(ReconciliationService);
  private readonly translate = inject(TranslateService);

  transactions = input.required<BankTransaction[]>();
  refreshNeeded = output<void>();

  // ── Data table ───────────────────────────────────────────────────────────
  readonly tableColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'date',    label: this.translate.instant('PAYMENTS.TX_TABLE.COL.DATE'),             type: 'custom' },
      { key: 'ref',     label: this.translate.instant('PAYMENTS.TX_TABLE.COL.REF'),              type: 'custom' },
      { key: 'desc',    label: this.translate.instant('PAYMENTS.TX_TABLE.COL.DESC'),             type: 'custom' },
      { key: 'amount',  label: this.translate.instant('PAYMENTS.TX_TABLE.COL.AMOUNT'),           type: 'custom', align: 'right' },
      { key: 'status',  label: this.translate.instant('PAYMENTS.TX_TABLE.COL.STATUS'),           type: 'custom' },
      { key: 'invoice', label: this.translate.instant('PAYMENTS.TX_TABLE.COL.PROPOSED_INVOICE'), type: 'custom' },
      { key: 'actions', label: this.translate.instant('PAYMENTS.TX_TABLE.COL.ACTIONS'),          type: 'custom', align: 'center', width: '210px' },
    ];
  });

  readonly tableRows = computed<TableRow[]>(() =>
    this.transactions().map(tx => ({ id: tx.id, _raw: tx }))
  );

  readonly tableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable:    true,
      emptyMessage: this.translate.instant('PAYMENTS.TX_TABLE.EMPTY'),
    };
  });

  confirmTarget  = signal<BankTransaction | null>(null);
  manualTarget   = signal<BankTransaction | null>(null);
  partialTarget  = signal<BankTransaction | null>(null);
  acompteTarget  = signal<BankTransaction | null>(null);
  actionError    = signal<string | null>(null);

  openConfirm(tx: BankTransaction): void {
    this.actionError.set(null);
    this.confirmTarget.set(tx);
  }

  openManual(tx: BankTransaction): void {
    this.actionError.set(null);
    this.manualTarget.set(tx);
  }

  openPartial(tx: BankTransaction): void {
    this.actionError.set(null);
    this.partialTarget.set(tx);
  }

  openAcompte(tx: BankTransaction): void {
    this.actionError.set(null);
    this.acompteTarget.set(tx);
  }

  rejectTx(tx: BankTransaction): void {
    this.actionError.set(null);
    this.svc.rejectMatch(tx.id).subscribe({
      next:  () => this.refreshNeeded.emit(),
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('PAYMENTS.TX_TABLE.ERROR_REJECT')),
    });
  }

  onConfirmed(): void {
    this.confirmTarget.set(null);
    this.manualTarget.set(null);
    this.refreshNeeded.emit();
  }

  onPartialConfirmed(): void {
    this.partialTarget.set(null);
    this.refreshNeeded.emit();
  }

  onAcompteConfirmed(): void {
    this.acompteTarget.set(null);
    this.refreshNeeded.emit();
  }

  statutConfig(statut: string) {
    return MATCH_STATUT_CONFIG[statut] ?? MATCH_STATUT_CONFIG['UNMATCHED'];
  }

  statutLabelKey(statut: string): string {
    return 'PAYMENTS.STATUT.' + (MATCH_STATUT_CONFIG[statut] ? statut : 'UNMATCHED');
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
}
