import {
  Component, inject, signal, Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CostService } from '../cost.service';
import { CostImportResult } from '../cost.model';

@Component({
  selector: 'app-cost-import-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cost-import-panel.component.html',
  styleUrl: './cost-import-panel.component.scss',
})
export class CostImportPanelComponent {
  @Input() paysId!: number;

  private readonly svc = inject(CostService);

  isDragging  = signal(false);
  isUploading = signal(false);
  result      = signal<CostImportResult | null>(null);
  serverError = signal<string | null>(null);
  selectedFile = signal<File | null>(null);

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
    if (!file.name.endsWith('.csv')) {
      this.serverError.set('Seuls les fichiers CSV sont acceptés.');
      return;
    }
    this.selectedFile.set(file);
    this.result.set(null);
    this.serverError.set(null);
  }

  downloadTemplate(): void {
    this.svc.downloadCsvTemplate();
  }

  upload(): void {
    const file = this.selectedFile();
    if (!file) return;
    this.isUploading.set(true);
    this.serverError.set(null);
    this.svc.importCsv(file, this.paysId).subscribe({
      next: res => {
        this.result.set(res);
        this.selectedFile.set(null);
        this.isUploading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Erreur lors de l\'import.');
        this.isUploading.set(false);
      },
    });
  }

  reset(): void {
    this.result.set(null);
    this.selectedFile.set(null);
    this.serverError.set(null);
  }
}
