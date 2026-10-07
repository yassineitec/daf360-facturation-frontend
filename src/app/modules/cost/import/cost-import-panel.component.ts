import {
  Component, inject, signal, computed, Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { CostService } from '../cost.service';
import { CostInvoiceImportResult } from '../cost.model';

/**
 * Historical cost import — "reprise de l'ancienne base" (workshop item #4).
 *
 * Two steps on purpose: VÉRIFIER sends the file with `dryRun=true` (the backend builds every
 * invoice and rolls everything back), then IMPORTER — offered only when the check found no
 * error — sends it again for real. The backend is all-or-nothing either way: one bad row and
 * nothing is saved, so a half-imported history can never happen.
 */
@Component({
  selector: 'app-cost-import-panel',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './cost-import-panel.component.html',
  styleUrl: './cost-import-panel.component.scss',
})
export class CostImportPanelComponent {
  @Input() paysId!: number;

  private readonly svc = inject(CostService);
  private readonly translate = inject(TranslateService);

  isDragging   = signal(false);
  isBusy       = signal(false);
  /** Result of the last check (dry run). */
  checkResult  = signal<CostInvoiceImportResult | null>(null);
  /** Result of the real import. */
  importResult = signal<CostInvoiceImportResult | null>(null);
  serverError  = signal<string | null>(null);
  selectedFile = signal<File | null>(null);

  /** The import button only appears after a clean check of THIS file. */
  readonly canImport = computed(() => {
    const r = this.checkResult();
    return !!r && r.errorCount === 0 && r.invoiceCount > 0 && !!this.selectedFile();
  });

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(): void {
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.selectFile(file);
  }

  onFileInput(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.selectFile(file);
  }

  selectFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.serverError.set(this.translate.instant('COST.IMPORT.ONLY_CSV'));
      return;
    }
    this.selectedFile.set(file);
    this.checkResult.set(null);
    this.importResult.set(null);
    this.serverError.set(null);
  }

  downloadTemplate(): void {
    this.svc.downloadCsvTemplate();
  }

  /** Step 1 — check only, nothing saved. */
  check(): void {
    this.send(true);
  }

  /** Step 2 — the real import, once the check is clean. */
  import(): void {
    if (!this.canImport()) return;
    this.send(false);
  }

  private send(dryRun: boolean): void {
    const file = this.selectedFile();
    if (!file || !this.paysId) return;
    this.isBusy.set(true);
    this.serverError.set(null);
    this.svc.importCostInvoices(file, this.paysId, dryRun).subscribe({
      next: res => {
        this.isBusy.set(false);
        if (dryRun) {
          this.checkResult.set(res);
        } else {
          this.importResult.set(res);
          // A real run that still hit an error saved nothing: show it as a check result.
          if (!res.committed) this.checkResult.set(res);
          else this.selectedFile.set(null);
        }
      },
      error: err => {
        this.isBusy.set(false);
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.IMPORT.IMPORT_ERROR'));
      },
    });
  }

  reset(): void {
    this.checkResult.set(null);
    this.importResult.set(null);
    this.selectedFile.set(null);
    this.serverError.set(null);
  }
}
