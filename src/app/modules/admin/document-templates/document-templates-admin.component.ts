import {
  Component, OnInit, inject, signal, computed, ViewChild, ElementRef, TemplateRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ModalService, ModalRef, ButtonComponent } from '@khalilrebhiitec/daf360';
import { DocumentTemplateService } from './document-template.service';
import {
  FactDocumentTemplateDto, SaveFactDocumentTemplateRequest,
  DOCUMENT_TYPES, INVOICE_TEMPLATE_VARIABLES, TemplateVariableDef,
} from './document-template.model';

/**
 * Admin des maquettes de documents facturation éditables — même principe que
 * DocumentTemplatesAdminComponent côté RH (modal, textarea HTML brut, chips de
 * variables cliquables, aperçu PDF dans un nouvel onglet) mais rendu avec le vrai
 * moteur Handlebars (cf. DocumentTemplateService/FactPdfService.renderFromSource côté
 * backend) — les chips insèrent des SNIPPETS ({{#each}}/{{#if}}), pas juste des jetons
 * plats, puisque nos maquettes ont de vraies boucles/conditions. Généralisé au-delà des
 * seules factures : `documentType` (pas "billingMode") est le discriminant, un seul
 * type existe aujourd'hui ("INVOICE_AV"), cf. document-template.model.ts.
 */
@Component({
  selector: 'app-document-templates-admin',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ButtonComponent],
  template: `
<div class="tmpl-page">

  <div class="page-header">
    <div>
      <h1 class="page-title">{{ 'ADMIN.DOCUMENT_TEMPLATES.TITLE' | translate }}</h1>
      <p class="page-sub">{{ 'ADMIN.DOCUMENT_TEMPLATES.SUBTITLE' | translate }}</p>
    </div>
    <daf-button [options]="{ variant: 'primary', iconStart: 'add', label: 'ADMIN.DOCUMENT_TEMPLATES.NEW' | translate }"
      (onClick)="openCreateModal()" />
  </div>

  @if (pageError()) {
    <div class="banner banner--error">{{ pageError() }}</div>
  }

  <div class="filter-bar">
    <select class="filter-select" [ngModel]="filterDocumentType()" (ngModelChange)="onFilterChange($event)">
      <option value="">{{ 'ADMIN.DOCUMENT_TEMPLATES.ALL_TYPES' | translate }}</option>
      @for (t of documentTypes; track t.value) {
        <option [value]="t.value">{{ t.label }}</option>
      }
    </select>
    <label class="filter-checkbox">
      <input type="checkbox" [ngModel]="showInactive()" (ngModelChange)="onShowInactiveChange($event)" />
      {{ 'ADMIN.DOCUMENT_TEMPLATES.SHOW_INACTIVE' | translate }}
    </label>
  </div>

  @if (loading()) {
    <div class="loading-hint">{{ 'ADMIN.COMMON.LOADING' | translate }}</div>
  } @else if (templates().length === 0) {
    <div class="empty-state">{{ 'ADMIN.DOCUMENT_TEMPLATES.EMPTY' | translate }}</div>
  } @else {
    <table class="tmpl-table">
      <thead>
        <tr>
          <th>{{ 'ADMIN.DOCUMENT_TEMPLATES.COL_TYPE' | translate }}</th>
          <th>{{ 'ADMIN.DOCUMENT_TEMPLATES.COL_NAME' | translate }}</th>
          <th>{{ 'ADMIN.DOCUMENT_TEMPLATES.COL_STATUS' | translate }}</th>
          <th>{{ 'ADMIN.COMMON.ACTIONS' | translate }}</th>
        </tr>
      </thead>
      <tbody>
        @for (t of templates(); track t.id) {
          <tr [class.inactive-row]="!t.isActive">
            <td><span class="type-badge">{{ typeLabel(t.documentType) }}</span></td>
            <td>
              <div class="tmpl-name">{{ t.name }}</div>
              @if (t.description) { <div class="tmpl-desc">{{ t.description }}</div> }
            </td>
            <td>
              <span class="status-badge" [class.status-active]="t.isActive">
                {{ (t.isActive ? 'ADMIN.DOCUMENT_TEMPLATES.ACTIVE' : 'ADMIN.DOCUMENT_TEMPLATES.INACTIVE') | translate }}
              </span>
            </td>
            <td class="actions-cell">
              <button class="icon-btn" [title]="'ADMIN.COMMON.EDIT' | translate" (click)="openEditModal(t)">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button class="icon-btn" [title]="(t.isActive ? 'ADMIN.DOCUMENT_TEMPLATES.DEACTIVATE' : 'ADMIN.DOCUMENT_TEMPLATES.ACTIVATE') | translate"
                (click)="toggleActive(t)">
                <span class="material-symbols-outlined">{{ t.isActive ? 'toggle_on' : 'toggle_off' }}</span>
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  }
</div>

<!-- ── Modal body (create/edit) ──────────────────────────────────────────── -->
<ng-template #editorTpl>
  <div class="editor-body">
    <div class="editor-meta">
      <label class="field">
        <span class="field-label">{{ 'ADMIN.DOCUMENT_TEMPLATES.FIELD_TYPE' | translate }}</span>
        <select class="field-input" [(ngModel)]="form.documentType">
          @for (t of documentTypes; track t.value) {
            <option [value]="t.value">{{ t.label }}</option>
          }
        </select>
      </label>
      <label class="field field--grow">
        <span class="field-label">{{ 'ADMIN.DOCUMENT_TEMPLATES.FIELD_NAME' | translate }}</span>
        <input class="field-input" type="text" [(ngModel)]="form.name" maxlength="200" />
      </label>
    </div>
    <label class="field">
      <span class="field-label">{{ 'ADMIN.DOCUMENT_TEMPLATES.FIELD_DESCRIPTION' | translate }}</span>
      <input class="field-input" type="text" [(ngModel)]="form.description" maxlength="500" />
    </label>

    <div class="editor-split">
      <div class="editor-html">
        <div class="editor-html-toolbar">
          <span class="field-label">HTML / Handlebars</span>
          <button type="button" class="link-btn" (click)="insertDefaultTemplate()">
            {{ 'ADMIN.DOCUMENT_TEMPLATES.INSERT_DEFAULT' | translate }}
          </button>
        </div>
        <textarea #htmlEditor class="html-textarea" [(ngModel)]="form.htmlContent" rows="22"
          spellcheck="false"></textarea>
      </div>

      <div class="var-picker">
        <span class="field-label">{{ 'ADMIN.DOCUMENT_TEMPLATES.VARIABLES' | translate }}</span>
        @for (group of variableGroups(); track group.name) {
          <div class="var-group">
            <div class="var-group-name">{{ group.name }}</div>
            @for (v of group.vars; track v.key) {
              <button type="button" class="var-chip" [title]="v.labelFr" (click)="insertSnippet(v)">
                {{ '{{' }}{{ v.key }}{{ '}}' }}
              </button>
            }
          </div>
        }

        <div class="preview-box">
          <span class="field-label">{{ 'ADMIN.DOCUMENT_TEMPLATES.PREVIEW_INVOICE_ID' | translate }}</span>
          <input class="field-input" type="number" [(ngModel)]="previewInvoiceId"
            [placeholder]="'ADMIN.DOCUMENT_TEMPLATES.PREVIEW_INVOICE_ID_HINT' | translate" />
          <button type="button" class="preview-btn" [disabled]="previewing()" (click)="preview()">
            <span class="material-symbols-outlined">visibility</span>
            {{ (previewing() ? 'ADMIN.DOCUMENT_TEMPLATES.PREVIEWING' : 'ADMIN.DOCUMENT_TEMPLATES.PREVIEW') | translate }}
          </button>
          @if (previewError()) { <div class="preview-error">{{ previewError() }}</div> }
        </div>
      </div>
    </div>

    @if (formError()) { <div class="banner banner--error">{{ formError() }}</div> }
  </div>
</ng-template>
  `,
  styles: [`
    .tmpl-page { padding: 1.5rem 2rem; max-width: 1200px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; gap: 1rem; }
    .page-title { font-size: 1.375rem; font-weight: 700; color: #0f172a; margin: 0 0 0.25rem; }
    .page-sub   { font-size: 0.875rem; color: #64748b; margin: 0; }

    .banner { padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.875rem; margin-bottom: 1rem;
      &--error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; } }

    .filter-bar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .filter-select { padding: 0.4rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.825rem; }
    .filter-checkbox { display: flex; align-items: center; gap: 0.4rem; font-size: 0.825rem; color: #374151; cursor: pointer; }

    .loading-hint, .empty-state { padding: 2.5rem; text-align: center; color: #94a3b8; font-size: 0.875rem; }

    .tmpl-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .tmpl-table th { text-align: left; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: .04em;
      padding: 0.75rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .tmpl-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.875rem; vertical-align: top; }
    .tmpl-table tr:last-child td { border-bottom: none; }
    .inactive-row { opacity: 0.5; }

    .type-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 99px; background: #eff6ff; color: #1d4ed8; }
    .tmpl-name { font-weight: 600; color: #0f172a; }
    .tmpl-desc { font-size: 0.775rem; color: #64748b; margin-top: 2px; }

    .status-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 99px; background: #f1f5f9; color: #64748b; }
    .status-active { background: #dcfce7; color: #166534; }

    .actions-cell { display: flex; gap: 0.25rem; }
    .icon-btn { border: none; background: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #64748b;
      &:hover { background: #f1f5f9; color: #0f172a; } }

    /* Modal editor */
    .editor-body { display: flex; flex-direction: column; gap: 0.875rem; min-width: 0; }
    .editor-meta { display: flex; gap: 0.875rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
    .field--grow { flex: 1; }
    .field-label { font-weight: 600; color: #374151; }
    .field-input { padding: 0.45rem 0.65rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; font-family: inherit; }

    .editor-split { display: flex; gap: 0.875rem; min-height: 420px; }
    .editor-html { flex: 1.6; display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
    .editor-html-toolbar { display: flex; align-items: center; justify-content: space-between; }
    .link-btn { border: none; background: none; color: #2563eb; font-size: 0.775rem; cursor: pointer; padding: 0; }
    .html-textarea {
      flex: 1; width: 100%; resize: vertical; font-family: 'Consolas', 'Courier New', monospace;
      font-size: 0.775rem; line-height: 1.5; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 8px;
      background: #0f172a; color: #e2e8f0; tab-size: 2;
    }

    .var-picker { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto; max-height: 460px;
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; background: #f8fafc; }
    .var-group { display: flex; flex-direction: column; gap: 0.3rem; }
    .var-group-name { font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .04em; margin-top: 0.25rem; }
    .var-chip {
      align-self: flex-start; font-family: monospace; font-size: 0.75rem; padding: 3px 8px; border-radius: 6px;
      background: #fff; border: 1px solid #cbd5e1; color: #0f172a; cursor: pointer; text-align: left;
      &:hover { background: #eff6ff; border-color: #93c5fd; }
    }

    .preview-box { margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 0.4rem; }
    .preview-btn {
      display: inline-flex; align-items: center; gap: 0.35rem; justify-content: center;
      padding: 0.4rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;
      font-size: 0.8rem; cursor: pointer;
      &:hover:not(:disabled) { background: #f8fafc; }
      &:disabled { opacity: 0.5; cursor: default; }
      .material-symbols-outlined { font-size: 16px; }
    }
    .preview-error { font-size: 0.775rem; color: #b91c1c; }
  `],
})
export class DocumentTemplatesAdminComponent implements OnInit {
  private readonly svc      = inject(DocumentTemplateService);
  private readonly modal    = inject(ModalService);
  private readonly translate = inject(TranslateService);

  @ViewChild('editorTpl') editorTpl!: TemplateRef<unknown>;
  @ViewChild('htmlEditor') htmlEditorRef?: ElementRef<HTMLTextAreaElement>;

  readonly documentTypes = DOCUMENT_TYPES;

  templates       = signal<FactDocumentTemplateDto[]>([]);
  loading         = signal(true);
  pageError       = signal<string | null>(null);
  filterDocumentType = signal('');
  showInactive    = signal(false);

  // Modal state
  private modalRef: ModalRef | null = null;
  private modalMode: 'create' | 'edit' = 'create';
  private editingId: number | null = null;
  formError  = signal<string | null>(null);
  saving     = signal(false);
  form: SaveFactDocumentTemplateRequest = { documentType: 'INVOICE_AV', name: '', description: '', htmlContent: '' };

  // Preview state
  previewInvoiceId: number | null = null;
  previewing   = signal(false);
  previewError = signal<string | null>(null);

  readonly variableGroups = computed(() => {
    const byGroup = new Map<string, TemplateVariableDef[]>();
    for (const v of INVOICE_TEMPLATE_VARIABLES) {
      const list = byGroup.get(v.group) ?? [];
      list.push(v);
      byGroup.set(v.group, list);
    }
    return [...byGroup.entries()].map(([name, vars]) => ({ name, vars }));
  });

  ngOnInit(): void {
    this.load();
  }

  typeLabel(value: string): string {
    return this.documentTypes.find(t => t.value === value)?.label ?? value;
  }

  load(): void {
    this.loading.set(true);
    this.pageError.set(null);
    this.svc.list(this.filterDocumentType() || undefined, this.showInactive()).subscribe({
      next:  list => { this.templates.set(list); this.loading.set(false); },
      error: err  => {
        this.pageError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.ERR_LOAD'));
        this.loading.set(false);
      },
    });
  }

  onFilterChange(type: string): void { this.filterDocumentType.set(type); this.load(); }
  onShowInactiveChange(v: boolean): void { this.showInactive.set(v); this.load(); }

  // ── Modal ──────────────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.modalMode = 'create';
    this.editingId = null;
    this.form = { documentType: this.documentTypes[0].value, name: '', description: '', htmlContent: '' };
    this.previewInvoiceId = null;
    this.previewError.set(null);
    this.formError.set(null);
    this.openModal(this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.MODAL_CREATE'));
  }

  openEditModal(t: FactDocumentTemplateDto): void {
    this.modalMode = 'edit';
    this.editingId = t.id;
    this.form = { documentType: t.documentType, name: t.name, description: t.description, htmlContent: t.htmlContent };
    this.previewInvoiceId = null;
    this.previewError.set(null);
    this.formError.set(null);
    this.openModal(this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.MODAL_EDIT', { name: t.name }));
  }

  private openModal(title: string): void {
    this.modalRef = this.modal.open({
      title,
      body: this.editorTpl,
      size: 'xl',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('ADMIN.COMMON.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.modalMode === 'create'
            ? this.translate.instant('ADMIN.COMMON.CREATE')
            : this.translate.instant('ADMIN.COMMON.SAVE'),
          variant: 'primary',
          action: () => this.submit(),
        },
      ],
    });
  }

  private isFormValid(): boolean {
    return !!this.form.documentType
      && this.form.name.trim().length > 0
      && this.form.htmlContent.trim().length > 0;
  }

  submit(): void {
    if (this.saving() || !this.isFormValid()) {
      this.formError.set(this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.ERR_REQUIRED'));
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const dto: SaveFactDocumentTemplateRequest = {
      documentType: this.form.documentType,
      name: this.form.name.trim(),
      description: this.form.description?.trim() || null,
      htmlContent: this.form.htmlContent,
    };
    const req$ = this.modalMode === 'create'
      ? this.svc.create(dto)
      : this.svc.update(this.editingId!, dto);
    req$.subscribe({
      next: saved => {
        this.saving.set(false);
        this.templates.update(list => this.modalMode === 'create'
          ? [...list, saved]
          : list.map(t => t.id === saved.id ? saved : t));
        this.modalRef?.close();
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.ERR_SAVE'));
      },
    });
  }

  toggleActive(t: FactDocumentTemplateDto): void {
    this.svc.toggleActive(t.id).subscribe({
      next: () => this.load(),
      error: err => this.pageError.set(err?.error?.detail ?? err?.error?.message
        ?? this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.ERR_GENERIC')),
    });
  }

  // ── Editor helpers ───────────────────────────────────────────────────────

  insertSnippet(v: TemplateVariableDef): void {
    const ta = this.htmlEditorRef?.nativeElement;
    if (!ta) { this.form.htmlContent += v.snippet; return; }
    const start = ta.selectionStart ?? this.form.htmlContent.length;
    const end   = ta.selectionEnd   ?? start;
    this.form.htmlContent = this.form.htmlContent.slice(0, start) + v.snippet + this.form.htmlContent.slice(end);
    const newPos = start + v.snippet.length;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(newPos, newPos); });
  }

  insertDefaultTemplate(): void {
    this.form.htmlContent = DEFAULT_HTML;
  }

  preview(): void {
    if (!this.form.htmlContent.trim()) return;
    this.previewing.set(true);
    this.previewError.set(null);
    this.svc.previewRaw(this.form.htmlContent, this.previewInvoiceId).subscribe({
      next: blob => {
        this.previewing.set(false);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (err: unknown) => {
        this.previewing.set(false);
        this.readBlobError(err).then(msg => this.previewError.set(msg));
      },
    });
  }

  private async readBlobError(err: unknown): Promise<string> {
    const fallback = this.translate.instant('ADMIN.DOCUMENT_TEMPLATES.ERR_PREVIEW');
    const body = (err as { error?: unknown } | null)?.error;
    if (body instanceof Blob) {
      try {
        const parsed = JSON.parse(await body.text());
        return parsed?.detail ?? parsed?.message ?? fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

/** Gabarit de départ — reprend la structure du fichier statique actuel
 * (templates/facturation/facture-av-preview.html) pour que "Insérer le gabarit"
 * démarre d'une maquette qui rend déjà correctement, pas d'une page blanche. */
const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; }
.page { width: 210mm; min-height: 297mm; padding: 14mm 16mm 20mm; position: relative; background: #fff; }
.watermark { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font-size: 90pt;
  font-weight: 900; color: rgba(200,40,40,0.10); transform: rotate(-30deg); letter-spacing: 8px; }
.box-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
.box-table td { padding: 1.5mm 2.5mm; font-size: 8.5pt; }
.box-title { text-decoration: underline; font-weight: bold; }
.lines-table { width: 100%; border-collapse: collapse; margin: 5mm 0; }
.lines-table th, .lines-table td { border: 1px solid #999; padding: 1.8mm; font-size: 7.8pt; }
.lines-table th { background: #1e3a5f; color: #fff; }
</style>
</head>
<body>
{{#if isDraft}}<div class="watermark">BROUILLON</div>{{/if}}
<div class="page">

  <table class="box-table">
    <tr><td class="box-title" colspan="2">Facture</td></tr>
    <tr><td>N° :</td><td>{{invoiceNumberDisplay}}</td></tr>
    <tr><td>Date :</td><td>{{editionDate}}</td></tr>
    <tr><td>Référent Client</td><td>{{clientReferent}}</td></tr>
  </table>

  <table class="box-table">
    <tr><td>Client :</td><td>{{clientName}}</td></tr>
    <tr><td>RCS/ICE :</td><td>{{clientTaxId}}</td></tr>
    <tr><td>Adresse :</td><td>{{clientAddress}}</td></tr>
  </table>

  <table class="lines-table">
    <thead>
      <tr><th>Pos.</th><th>Projet</th><th>Désignation</th><th>Montant HT</th><th>TVA</th><th>Total HT</th></tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td>{{inc @index}}</td>
        <td>{{this.projet}}</td>
        <td>{{this.description}}</td>
        <td>{{this.budgetAffaireFmt}}</td>
        <td>{{this.vatRatePct}}%</td>
        <td>{{this.lineTotalFmt}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <p>Total net HT : {{totalHtFmt}} — Montant TVA : {{totalTvaFmt}} — Net à payer : {{netAPayerFmt}}</p>

</div>
</body>
</html>`;
