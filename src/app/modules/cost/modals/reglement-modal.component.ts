import {
  Component, EventEmitter, Input, OnInit, Output, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostLineDto, CostLineReglementDto } from '../cost.model';
import { CostService } from '../cost.service';

export interface ReglementModalData {
  /** null when creating a NEW règlement (the line picker is shown); set when editing
   *  an existing one (the line picker is hidden -- it's fixed to this one). */
  editing: CostLineReglementDto | null;
  /** Only used in create mode: that supplier's payable (APPROVED, no existing
   *  règlement) cost lines to choose from. */
  payableLines: CostLineDto[];
}

@Component({
  selector: 'app-reglement-modal',
  standalone: true,
  imports: [FormsModule],
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15,61,71,.35);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 16px;
    }
    .modal-box {
      background: #fff; border-radius: 16px; width: 100%; max-width: 480px;
      box-shadow: 0 8px 32px rgba(15,61,71,.18);
      display: flex; flex-direction: column;
    }
    .modal-header {
      padding: 20px 24px 16px; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .modal-title { font-size: 1rem; font-weight: 700; color: #0f3d47; }
    .modal-close {
      background: none; border: none; cursor: pointer; padding: 4px;
      color: #94a3b8; font-size: 1.25rem; line-height: 1;
    }
    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
    label { font-size: .8125rem; font-weight: 600; color: #334155; }
    select, input, textarea {
      width: 100%; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 10px 12px; font-size: .875rem; color: #1e293b;
      background: #f8fafc; font-family: inherit; box-sizing: border-box;
    }
    select:focus, input:focus, textarea:focus { outline: none; border-color: #1a6b7c; background: #fff; }
    textarea { resize: vertical; min-height: 70px; }
    .info-box {
      padding: 12px 14px; border-radius: 10px; font-size: .8125rem;
      background: #f1f5f9; color: #1e293b;
      display: flex; flex-direction: column; gap: 4px;
    }
    .info-label { font-size: .6875rem; color: #64748b; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .info-value { font-weight: 600; color: #0f3d47; }
    .error-text { font-size: .75rem; color: #dc2626; margin-top: 2px; }
    .server-error {
      padding: 10px 14px; border-radius: 8px;
      background: #fee2e2; color: #991b1b; font-size: .8125rem;
    }
    .modal-footer {
      padding: 16px 24px; border-top: 1px solid #f1f5f9;
      display: flex; justify-content: flex-end; gap: 10px;
    }
    .btn-cancel {
      padding: 8px 18px; border: 1px solid #e2e8f0; border-radius: 8px;
      background: #fff; color: #475569; font-size: .875rem; font-weight: 600;
      cursor: pointer;
    }
    .btn-cancel:hover { border-color: #94a3b8; }
    .btn-confirm {
      padding: 8px 18px; border: none; border-radius: 8px;
      font-size: .875rem; font-weight: 600; cursor: pointer;
      background: #1a6b7c; color: #fff;
      display: inline-flex; align-items: center; gap: 6px;
      transition: opacity .15s;
    }
    .btn-confirm:hover:not(:disabled) { background: #134f5c; }
    .btn-confirm:disabled { opacity: .5; cursor: default; }
  `],
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div class="modal-box" role="dialog" aria-modal="true">

        <div class="modal-header">
          <span class="modal-title">{{ isEditMode ? 'Modifier le règlement' : 'Nouveau règlement' }}</span>
          <button class="modal-close" (click)="closed.emit()" aria-label="Fermer">✕</button>
        </div>

        <div class="modal-body">
          @if (isEditMode) {
            <div class="info-box">
              <span class="info-label">Ligne de coût</span>
              <span class="info-value">Ligne #{{ data.editing!.costLineId }}</span>
            </div>
          } @else {
            <div>
              <label for="reglement-line">Ligne de coût à régler *</label>
              <select id="reglement-line" [(ngModel)]="costLineId">
                <option [ngValue]="null">— Sélectionner une ligne —</option>
                @for (line of data.payableLines; track line.id) {
                  <option [ngValue]="line.id">{{ line.reference ?? ('#' + line.id) }} — {{ line.label ?? '' }}</option>
                }
              </select>
              @if (touched && !costLineId) {
                <p class="error-text">Choisissez une ligne de coût.</p>
              }
            </div>
          }

          <div>
            <label for="reglement-montant">Montant payé *</label>
            <input id="reglement-montant" type="number" min="0.01" step="0.001"
                   [(ngModel)]="montantPaye" />
            @if (touched && !(montantPaye()! > 0)) {
              <p class="error-text">Le montant doit être supérieur à 0.</p>
            }
          </div>

          <div>
            <label for="reglement-date">Date de paiement *</label>
            <input id="reglement-date" type="date" [(ngModel)]="datePaiement" />
          </div>

          <div>
            <label for="reglement-comment">Commentaire</label>
            <textarea id="reglement-comment" [(ngModel)]="comment" placeholder="Commentaire optionnel..."></textarea>
          </div>

          @if (serverError()) {
            <div class="server-error">{{ serverError() }}</div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" (click)="closed.emit()" [disabled]="saving()">Annuler</button>
          <button class="btn-confirm" (click)="confirm()" [disabled]="saving()">
            @if (saving()) { <span style="font-size:.75rem;">…</span> }
            {{ isEditMode ? 'Enregistrer' : 'Créer' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ReglementModalComponent implements OnInit {
  @Input() data!: ReglementModalData;
  @Output() closed   = new EventEmitter<void>();
  @Output() resolved = new EventEmitter<void>();

  private readonly svc = inject(CostService);

  costLineId   = signal<number | null>(null);
  montantPaye  = signal<number | null>(null);
  datePaiement = signal<string>('');
  comment      = signal<string>('');
  saving       = signal(false);
  serverError  = signal<string | null>(null);
  touched      = false;

  get isEditMode(): boolean { return this.data.editing !== null; }

  ngOnInit(): void {
    if (this.data.editing) {
      this.costLineId.set(this.data.editing.costLineId);
      this.montantPaye.set(this.data.editing.montantPaye);
      this.datePaiement.set(this.data.editing.datePaiement.slice(0, 10));
      this.comment.set(this.data.editing.comment ?? '');
    } else {
      this.datePaiement.set(new Date().toISOString().slice(0, 10));
    }
  }

  get canSave(): boolean {
    return this.costLineId() != null && (this.montantPaye() ?? 0) > 0 && !!this.datePaiement();
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closed.emit();
    }
  }

  confirm(): void {
    this.touched = true;
    if (!this.canSave) return;
    this.saving.set(true);
    this.serverError.set(null);

    const body = {
      montantPaye:  this.montantPaye()!,
      datePaiement: this.datePaiement(),
      comment:      this.comment().trim() || null,
    };

    const call$ = this.isEditMode
      ? this.svc.updateReglement(this.data.editing!.id, body)
      : this.svc.createReglement(this.costLineId()!, body);

    call$.subscribe({
      next: () => { this.saving.set(false); this.resolved.emit(); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err.error?.message ?? err.error?.error ?? 'Une erreur est survenue.');
      },
    });
  }
}
