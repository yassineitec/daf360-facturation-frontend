import { Component, OnInit, inject, signal, computed, effect, untracked } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectSelectedCountryId } from '@khalilrebhiitec/daf360';
import { ReconciliationService } from '../reconciliation.service';
import { CurrencyContextService } from '../../../core/currency-context.service';
import { BankTransaction, ImportSummary, UnmatchedSummaryDto } from '../payment.model';
import { ImportDropzoneComponent } from './import-dropzone.component';
import { TransactionTableComponent } from './transaction-table.component';
import { ManualTransactionModalComponent } from './manual-transaction-modal.component';
import { PermissionDirective } from '../../../shared/permission.directive';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '@khalilrebhiitec/daf360';
import { ExportService } from '../../../core/export.service';

import { PageGuideComponent } from '../../../shared/guide/page-guide.component';
import type { GuideStep } from '../../../shared/guide/page-guide.types';

/** Guide de la page — chaque `target` est un `data-guide` du gabarit. */
const GUIDE_STEPS: GuideStep[] = [
  { icon: 'account_balance', titleKey: 'GUIDE.RECONCILIATION.INTRO_TITLE', textKey: 'GUIDE.RECONCILIATION.INTRO_TEXT', target: 'recon-header' },
  { icon: 'upload_file', titleKey: 'GUIDE.RECONCILIATION.IMPORT_TITLE', textKey: 'GUIDE.RECONCILIATION.IMPORT_TEXT', target: 'recon-import' },
  { icon: 'edit_note', titleKey: 'GUIDE.RECONCILIATION.MANUAL_TITLE', textKey: 'GUIDE.RECONCILIATION.MANUAL_TEXT', target: 'recon-import' },
  { icon: 'history', titleKey: 'GUIDE.RECONCILIATION.HISTORY_TITLE', textKey: 'GUIDE.RECONCILIATION.HISTORY_TEXT', target: 'recon-history' },
  { icon: 'table_rows', titleKey: 'GUIDE.RECONCILIATION.TRANSACTIONS_TITLE', textKey: 'GUIDE.RECONCILIATION.TRANSACTIONS_TEXT', target: 'recon-transactions' },
  { icon: 'rule', titleKey: 'GUIDE.RECONCILIATION.ACTIONS_TITLE', textKey: 'GUIDE.RECONCILIATION.ACTIONS_TEXT', target: 'recon-transactions' },
  { icon: 'hourglass_top', titleKey: 'GUIDE.RECONCILIATION.UNMATCHED_TITLE', textKey: 'GUIDE.RECONCILIATION.UNMATCHED_TEXT', target: 'recon-unmatched' },
  { icon: 'help', titleKey: 'GUIDE.RECONCILIATION.END_TITLE', textKey: 'GUIDE.RECONCILIATION.END_TEXT' },
];

@Component({
  selector: 'app-reconciliation',
  imports: [ImportDropzoneComponent, TransactionTableComponent, ManualTransactionModalComponent, PermissionDirective, DisplayCurrencyPipe, TranslatePipe, PageGuideComponent, ButtonComponent],
  templateUrl: './reconciliation.component.html',
  styleUrl:    './reconciliation.component.scss',
})
export class ReconciliationComponent implements OnInit {
  readonly guideSteps = GUIDE_STEPS;

  private readonly svc = inject(ReconciliationService);
  private readonly currencyContext = inject(CurrencyContextService);
  private readonly exportSvc = inject(ExportService);

  /** Export Excel en cours — état de chargement du bouton, ignore un double clic. */
  readonly exporting = signal(false);

  imports            = signal<ImportSummary[]>([]);
  selectedImportId   = signal<number | null>(null);
  transactions       = signal<BankTransaction[]>([]);
  unmatchedSummary   = signal<UnmatchedSummaryDto | null>(null);
  loadingImports     = signal(false);
  loadingTx          = signal(false);
  errorImports       = signal<string | null>(null);
  errorTx            = signal<string | null>(null);
  showManualModal    = signal(false);

  readonly selectedImport = computed(() =>
    this.imports().find(i => i.id === this.selectedImportId()) ?? null
  );

  /**
   * Le drapeau de la navbar : les relevés et les non-rapprochés sont ceux de son pays
   * (le service lit la même valeur pour chaque appel). Au changement, on repart du premier
   * relevé du nouveau pays — celui qui était sélectionné appartient à l'ancien.
   */
  // Drapeaux cochés + entité unique (import, synthèse) : recharger dès que l'un change.
  private readonly paysKey = computed(() => `${this.svc.listPays() ?? ''}|${this.svc.paysId() ?? ''}`);
  private loadedCountry: unknown = undefined;
  private readonly followHeaderCountry = effect(() => {
    const country = this.paysKey();
    untracked(() => {
      if (country === this.loadedCountry) return;
      this.loadedCountry = country;
      this.selectedImportId.set(null);
      this.transactions.set([]);
      this.loadImports();
      this.loadUnmatchedSummary();
    });
  });

  ngOnInit(): void {
    this.loadedCountry = this.paysKey();
    this.loadImports();
    this.loadUnmatchedSummary();
  }

  /** Bumped à chaque chargement : une liste lente de l'ancien pays est ignorée. */
  private importsSeq = 0;

  loadImports(): void {
    const seq = ++this.importsSeq;
    this.loadingImports.set(true);
    this.errorImports.set(null);
    this.svc.getImports().subscribe({
      next: list => {
        if (seq !== this.importsSeq) return;
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

  onManualCreated(tx: BankTransaction): void {
    this.showManualModal.set(false);
    this.loadImports();
    this.loadUnmatchedSummary();
    this.selectedImportId.set(tx.importId);
    this.loadTransactions(tx.importId);
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

  /** Export Excel du relevé sélectionné : ses transactions, le relevé et les non-rapprochés. */
  exportExcel(): void {
    const id = this.selectedImportId();
    if (!id) return;
    const name = (this.selectedImport()?.filename ?? String(id)).replace(/\.[^.]+$/, '');
    this.exportSvc.download(this.exportSvc.reconciliation(id, this.svc.listPays(), this.svc.paysId()), `Rapprochement_${name}.xlsx`, this.exporting);
  }

  formatAmount(v: number, devise?: string): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise ?? this.currencyContext.defaultCurrency() ?? 'EUR',
    }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
