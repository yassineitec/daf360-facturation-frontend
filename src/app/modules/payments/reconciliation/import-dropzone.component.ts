import { Component, inject, output, signal } from '@angular/core';
import { ReconciliationService } from '../reconciliation.service';
import { ImportSummary } from '../payment.model';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS  = ['.ofx', '.xml'];

@Component({
  selector: 'app-import-dropzone',
  imports: [],
  template: `
<div class="dropzone-section">

  <div class="dropzone" [class.dragging]="isDragging()" [class.has-file]="selectedFile()"
    (dragover)="onDragOver($event)"
    (dragleave)="onDragLeave($event)"
    (drop)="onDrop($event)"
    (click)="fileInput.click()">

    <input #fileInput type="file" accept=".ofx,.xml" style="display:none"
      (change)="onFileChange($event)" />

    @if (!selectedFile()) {
      <div class="dropzone-idle">
        <span class="dz-icon">📂</span>
        <span class="dz-primary">Glissez un fichier ici ou cliquez pour parcourir</span>
        <span class="dz-secondary">Formats acceptés : OFX (.ofx), CAMT053 (.xml) — max 10 Mo</span>
      </div>
    } @else {
      <div class="dropzone-file">
        <div class="file-info">
          <span class="file-name">{{ selectedFile()!.name }}</span>
          <span class="file-size">{{ formatSize(selectedFile()!.size) }}</span>
        </div>
        @if (detectedFormat()) {
          <span class="format-badge" [class.badge-ofx]="detectedFormat() === 'OFX'"
            [class.badge-camt]="detectedFormat() === 'CAMT053'">
            {{ detectedFormat() }}
          </span>
        }
        <button class="clear-file" title="Supprimer" (click)="clearFile($event)">✕</button>
      </div>
    }
  </div>

  @if (validationError()) {
    <div class="dz-error">{{ validationError() }}</div>
  }

  @if (uploading()) {
    <div class="upload-progress">Importation en cours…</div>
  }

  @if (uploadError()) {
    <div class="dz-error">{{ uploadError() }}</div>
  }

  <div class="dz-actions">
    <button class="btn-import"
      [disabled]="!selectedFile() || !detectedFormat() || uploading()"
      (click)="upload()">
      {{ uploading() ? 'Importation…' : 'Importer' }}
    </button>
  </div>

</div>
  `,
  styles: [`
    .dropzone-section { display: flex; flex-direction: column; gap: 0.75rem; }
    .dropzone {
      border: 2px dashed #cbd5e1; border-radius: 10px; padding: 2rem;
      cursor: pointer; transition: border-color 0.15s, background 0.15s;
      min-height: 120px; display: flex; align-items: center; justify-content: center;

      &:hover, &.dragging { border-color: #3b82f6; background: #eff6ff; }
      &.has-file { border-style: solid; border-color: #3b82f6; background: #f0f9ff; }
    }
    .dropzone-idle { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .dz-icon { font-size: 2rem; }
    .dz-primary { font-size: 0.9375rem; font-weight: 500; color: #1e40af; }
    .dz-secondary { font-size: 0.8125rem; color: #64748b; }
    .dropzone-file {
      display: flex; align-items: center; gap: 1rem; width: 100%; flex-wrap: wrap;
    }
    .file-info { display: flex; flex-direction: column; gap: 0.125rem; flex: 1; }
    .file-name { font-weight: 500; color: #0f172a; font-size: 0.9rem; word-break: break-all; }
    .file-size { font-size: 0.75rem; color: #64748b; }
    .format-badge {
      padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-weight: 700;
      letter-spacing: 0.05em;
    }
    .badge-ofx  { background: #dbeafe; color: #1e40af; }
    .badge-camt { background: #d1fae5; color: #065f46; }
    .clear-file {
      width: 28px; height: 28px; border: 1px solid #e2e8f0; background: #fff;
      border-radius: 50%; cursor: pointer; display: flex; align-items: center;
      justify-content: center; font-size: 0.75rem; color: #64748b;
      &:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
    }
    .dz-error {
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; padding: 0.5rem 0.75rem; font-size: 0.875rem;
    }
    .upload-progress { font-size: 0.875rem; color: #1e40af; font-style: italic; }
    .dz-actions { display: flex; justify-content: flex-end; }
    .btn-import {
      padding: 0.5rem 1.5rem; background: #1e40af; color: #fff; border: none;
      border-radius: 6px; font-size: 0.875rem; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
      &:hover:not(:disabled) { background: #1e3a8a; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class ImportDropzoneComponent {
  private readonly svc = inject(ReconciliationService);

  imported = output<ImportSummary>();

  isDragging      = signal(false);
  selectedFile    = signal<File | null>(null);
  detectedFormat  = signal<'OFX' | 'CAMT053' | null>(null);
  validationError = signal<string | null>(null);
  uploading       = signal(false);
  uploadError     = signal<string | null>(null);

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files?.[0] ?? null;
    this.setFile(file);
  }

  onFileChange(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.setFile(file);
  }

  clearFile(e: Event): void {
    e.stopPropagation();
    this.selectedFile.set(null);
    this.detectedFormat.set(null);
    this.validationError.set(null);
    this.uploadError.set(null);
  }

  private setFile(file: File | null): void {
    this.validationError.set(null);
    this.uploadError.set(null);

    if (!file) {
      this.selectedFile.set(null);
      this.detectedFormat.set(null);
      return;
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      this.validationError.set('Format non supporté. Utilisez un fichier .ofx (OFX) ou .xml (CAMT053).');
      this.selectedFile.set(null);
      this.detectedFormat.set(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.validationError.set('Fichier trop volumineux (max 10 Mo).');
      this.selectedFile.set(null);
      this.detectedFormat.set(null);
      return;
    }

    const fmt = ext === '.ofx' ? 'OFX' : 'CAMT053';
    this.selectedFile.set(file);
    this.detectedFormat.set(fmt);
  }

  upload(): void {
    const file = this.selectedFile(), fmt = this.detectedFormat();
    if (!file || !fmt) return;
    this.uploading.set(true);
    this.uploadError.set(null);
    this.svc.importFile(file, fmt).subscribe({
      next: summary => {
        this.uploading.set(false);
        this.selectedFile.set(null);
        this.detectedFormat.set(null);
        this.imported.emit(summary);
      },
      error: err => {
        this.uploading.set(false);
        this.uploadError.set(err?.error?.message ?? 'Erreur lors de l\'importation.');
      },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
}
