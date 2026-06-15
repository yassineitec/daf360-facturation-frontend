import {
  Component, EventEmitter, Input, OnInit, Output, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostLineDto } from '../cost.model';
import { CostService } from '../cost.service';

export type ApproveAction = 'approve' | 'return' | 'reject';

@Component({
  selector: 'app-approve-modal',
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
    .info-box {
      padding: 12px 14px; border-radius: 10px; font-size: .8125rem;
      background: #f1f5f9; color: #1e293b;
      display: flex; flex-direction: column; gap: 4px;
    }
    .info-label { font-size: .6875rem; color: #64748b; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .info-value { font-weight: 600; color: #0f3d47; }
    .warning-box {
      padding: 10px 14px; border-radius: 10px;
      background: #fef3c7; color: #92400e; font-size: .8125rem;
    }
    label { font-size: .8125rem; font-weight: 600; color: #334155; }
    textarea {
      width: 100%; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 10px 12px; font-size: .875rem; color: #1e293b;
      background: #f8fafc; resize: vertical; min-height: 90px;
      font-family: inherit; box-sizing: border-box;
    }
    textarea:focus { outline: none; border-color: #1a6b7c; background: #fff; }
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
      display: inline-flex; align-items: center; gap: 6px;
      transition: opacity .15s;
    }
    .btn-confirm:disabled { opacity: .5; cursor: default; }
    .btn-approve  { background: #1a6b7c; color: #fff; }
    .btn-approve:hover:not(:disabled)  { background: #134f5c; }
    .btn-return   { background: #d97706; color: #fff; }
    .btn-return:hover:not(:disabled)   { background: #b45309; }
    .btn-reject   { background: #dc2626; color: #fff; }
    .btn-reject:hover:not(:disabled)   { background: #b91c1c; }
  `],
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div class="modal-box" role="dialog" aria-modal="true">

        <div class="modal-header">
          <span class="modal-title">{{ title }}</span>
          <button class="modal-close" (click)="closed.emit()" aria-label="Fermer">✕</button>
        </div>

        <div class="modal-body">
          <div class="info-box">
            <span class="info-label">Ligne de coût</span>
            <span class="info-value">{{ costLine.label ?? '—' }}</span>
            <span style="font-size:.75rem;color:#475569;margin-top:2px;">
              {{ formatAmount(costLine.netAmountLocal, costLine.currency ?? 'EUR') }}
              @if (costLine.netAmountEur) {
                · {{ formatAmount(costLine.netAmountEur, 'EUR') }} EUR
              }
              · Niveau requis : <strong>{{ costLine.approvalLevelRequired ?? '—' }}</strong>
            </span>
          </div>

          @if (action === 'approve' && costLine.dualApprovalDone === false) {
            <div class="warning-box">
              ⚠ Approbation duale (L4) — un second approbateur sera nécessaire pour finaliser.
            </div>
          }

          <div>
            <label [for]="'comment'">
              Commentaire
              @if (commentRequired) { <span style="color:#dc2626"> *</span> }
            </label>
            <textarea
              id="comment"
              [(ngModel)]="comment"
              [placeholder]="commentPlaceholder"
              (input)="commentTouched = true"
            ></textarea>
            @if (commentTouched && commentRequired && !comment.trim()) {
              <p class="error-text">Un commentaire est obligatoire.</p>
            }
          </div>

          @if (serverError()) {
            <div class="server-error">{{ serverError() }}</div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" (click)="closed.emit()" [disabled]="saving()">
            Annuler
          </button>
          <button
            class="btn-confirm"
            [class.btn-approve]="action === 'approve'"
            [class.btn-return]="action === 'return'"
            [class.btn-reject]="action === 'reject'"
            (click)="confirm()"
            [disabled]="saving()">
            @if (saving()) { <span style="font-size:.75rem;">…</span> }
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ApproveModalComponent implements OnInit {
  @Input() costLine!: CostLineDto;
  @Input() action!: ApproveAction;
  @Input() level!: string;
  @Output() closed   = new EventEmitter<void>();
  @Output() resolved = new EventEmitter<CostLineDto>();

  private readonly svc = inject(CostService);

  comment       = '';
  commentTouched = false;
  saving        = signal(false);
  serverError   = signal<string | null>(null);

  get title(): string {
    return { approve: 'Approuver la ligne', return: 'Retourner la ligne', reject: 'Rejeter la ligne' }[this.action];
  }

  get confirmLabel(): string {
    return { approve: 'Approuver', return: 'Retourner', reject: 'Rejeter' }[this.action];
  }

  get commentRequired(): boolean { return this.action !== 'approve'; }

  get commentPlaceholder(): string {
    return this.action === 'approve'
      ? 'Commentaire optionnel...'
      : 'Motif obligatoire...';
  }

  ngOnInit(): void {}

  formatAmount(amount: number | null, currency: string): string {
    if (amount == null) return '—';
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closed.emit();
    }
  }

  confirm(): void {
    this.commentTouched = true;
    if (this.commentRequired && !this.comment.trim()) return;
    this.saving.set(true);
    this.serverError.set(null);

    let call$;
    if (this.action === 'approve') {
      call$ = this.svc.approveCostLine(this.costLine.id, this.level, this.comment || undefined);
    } else if (this.action === 'return') {
      call$ = this.svc.returnCostLine(this.costLine.id, this.level, this.comment);
    } else {
      call$ = this.svc.rejectCostLine(this.costLine.id, this.level, this.comment);
    }

    call$.subscribe({
      next: result => {
        this.saving.set(false);
        this.resolved.emit(result);
      },
      error: err => {
        this.saving.set(false);
        this.serverError.set(
          err.error?.message ?? err.error?.error ?? 'Une erreur est survenue.',
        );
      },
    });
  }
}
