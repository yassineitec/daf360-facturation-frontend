import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction, ImportSummary, UnmatchedSummaryDto } from '../payment.model';
import { ImportDropzoneComponent } from './import-dropzone.component';
import { TransactionTableComponent } from './transaction-table.component';
import { PermissionDirective } from '../../../shared/permission.directive';

@Component({
  selector: 'app-reconciliation',
  imports: [ImportDropzoneComponent, TransactionTableComponent, PermissionDirective],
  templateUrl: './reconciliation.component.html',
  styleUrl:    './reconciliation.component.scss',
})
export class ReconciliationComponent implements OnInit {
  private readonly svc = inject(ReconciliationService);

  imports            = signal<ImportSummary[]>([]);
  selectedImportId   = signal<number | null>(null);
  transactions       = signal<BankTransaction[]>([]);
  unmatchedSummary   = signal<UnmatchedSummaryDto | null>(null);
  loadingImports     = signal(false);
  loadingTx          = signal(false);
  errorImports       = signal<string | null>(null);
  errorTx            = signal<string | null>(null);

  readonly selectedImport = computed(() =>
    this.imports().find(i => i.id === this.selectedImportId()) ?? null
  );

  ngOnInit(): void {
    this.loadImports();
    this.loadUnmatchedSummary();
  }

  loadImports(): void {
    this.loadingImports.set(true);
    this.errorImports.set(null);
    this.svc.getImports().subscribe({
      next: list => {
        this.imports.set(list);
        this.loadingImports.set(false);
        if (list.length > 0 && !this.selectedImportId()) {
          this.selectImport(list[0].id);
        }
      },
      error: () => {
        this.errorImports.set('Impossible de charger les imports.');
        this.loadingImports.set(false);
      },
    });
  }

  selectImport(id: number): void {
    this.selectedImportId.set(id);
    this.loadTransactions(id);
  }

  loadTransactions(importId: number): void {
    this.loadingTx.set(true);
    this.errorTx.set(null);
    this.svc.getTransactions(importId).subscribe({
      next:  list => { this.transactions.set(list); this.loadingTx.set(false); },
      error: ()   => {
        this.errorTx.set('Impossible de charger les transactions.');
        this.loadingTx.set(false);
      },
    });
  }

  loadUnmatchedSummary(): void {
    this.svc.getUnmatchedSummary().subscribe({
      next:  s  => this.unmatchedSummary.set(s),
      error: () => {},
    });
  }

  onImported(summary: ImportSummary): void {
    this.loadImports();
    this.loadUnmatchedSummary();
    this.selectImport(summary.id);
  }

  onRefreshNeeded(): void {
    const id = this.selectedImportId();
    if (id) this.loadTransactions(id);
    this.loadUnmatchedSummary();
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
