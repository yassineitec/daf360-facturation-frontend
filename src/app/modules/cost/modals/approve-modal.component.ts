import {
  AfterViewInit, Component, EventEmitter, Input, OnDestroy, Output, TemplateRef,
  inject, signal, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ModalService, ModalRef } from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { CostService } from '../cost.service';

export type ApproveAction = 'approve' | 'return' | 'reject';

/**
 * Approve / return / reject dialog rendered through the lib ModalService (its chrome +
 * primary/secondary daf-buttons). Public API (costLine/action/level inputs, closed/resolved
 * outputs) is unchanged so the parent still shows it via `@if (...) <app-approve-modal>`.
 * The body (info box, dual-approval warning, comment field, error) lives in the #body
 * TemplateRef; the modal is opened in ngAfterViewInit and closed on destroy when the parent
 * removes the component. The single confirm footer button calls confirm(), which reads the
 * `action` input to decide which service call (approve/return/reject) to make.
 */
@Component({
  selector: 'app-approve-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  styles: [`
    .modal-body { display: flex; flex-direction: column; gap: 14px; }
    .info-box {
      padding: 12px 14px; border-radius: 10px; font-size: .8125rem;
      background: var(--color-surface-container, #f1f5f9); color: #1e293b;
      display: flex; flex-direction: column; gap: 4px;
    }
    .info-label { font-size: .6875rem; color: #64748b; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .info-value { font-weight: 600; color: var(--color-primary, #0f3d47); }
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
  `],
  template: `
    <ng-template #body>
      <div class="modal-body">
        <div class="info-box">
          <span class="info-label">{{ 'COST.APPROVE_MODAL.COST_LINE_LABEL' | translate }}</span>
          <span class="info-value">{{ costLine.label ?? '—' }}</span>
          <span style="font-size:.75rem;color:#475569;margin-top:2px;">
            {{ formatAmount(costLine.netAmountLocal, costLine.currency ?? 'EUR') }}
            @if (costLine.netAmountEur) {
              · {{ formatAmount(costLine.netAmountEur, 'EUR') }} EUR
            }
            · {{ 'COST.APPROVE_MODAL.LEVEL_REQUIRED' | translate }} <strong>{{ costLine.approvalLevelRequired ?? '—' }}</strong>
          </span>
        </div>

        @if (action === 'approve' && costLine.dualApprovalDone === false) {
          <div class="warning-box">
            {{ 'COST.APPROVE_MODAL.DUAL_WARNING' | translate }}
          </div>
        }

        <div>
          <label [for]="'comment'">
            {{ 'COST.APPROVE_MODAL.COMMENT_LABEL' | translate }}
            @if (commentRequired) { <span style="color:#dc2626"> *</span> }
          </label>
          <textarea
            id="comment"
            [(ngModel)]="comment"
            [placeholder]="commentPlaceholder"
            (input)="commentTouched = true"
          ></textarea>
          @if (commentTouched && commentRequired && !comment.trim()) {
            <p class="error-text">{{ 'COST.APPROVE_MODAL.COMMENT_REQUIRED' | translate }}</p>
          }
        </div>

        @if (serverError()) {
          <div class="server-error">{{ serverError() }}</div>
        }
      </div>
    </ng-template>
  `,
})
export class ApproveModalComponent implements AfterViewInit, OnDestroy {
  @Input() costLine!: CostLineDto;
  @Input() action!: ApproveAction;
  @Input() level!: string;
  @Output() closed   = new EventEmitter<void>();
  @Output() resolved = new EventEmitter<CostLineDto>();

  private readonly svc = inject(CostService);
  private readonly translate = inject(TranslateService);
  private readonly modal = inject(ModalService);

  private readonly body = viewChild.required<TemplateRef<unknown>>('body');
  private ref: ModalRef | null = null;

  comment       = '';
  commentTouched = false;
  saving        = signal(false);
  serverError   = signal<string | null>(null);

  get title(): string {
    return this.translate.instant({ approve: 'COST.APPROVE_MODAL.TITLE_APPROVE', return: 'COST.APPROVE_MODAL.TITLE_RETURN', reject: 'COST.APPROVE_MODAL.TITLE_REJECT' }[this.action]);
  }

  get confirmLabel(): string {
    return this.translate.instant({ approve: 'COST.APPROVE_MODAL.CONFIRM_APPROVE', return: 'COST.APPROVE_MODAL.CONFIRM_RETURN', reject: 'COST.APPROVE_MODAL.CONFIRM_REJECT' }[this.action]);
  }

  get commentRequired(): boolean { return this.action !== 'approve'; }

  get commentPlaceholder(): string {
    return this.action === 'approve'
      ? this.translate.instant('COST.APPROVE_MODAL.COMMENT_PLACEHOLDER_APPROVE')
      : this.translate.instant('COST.APPROVE_MODAL.COMMENT_PLACEHOLDER_REQUIRED');
  }

  ngAfterViewInit(): void {
    this.ref = this.modal.open({
      title: this.title,
      icon: this.action === 'reject' ? 'block' : this.action === 'return' ? 'undo' : 'approval',
      body: this.body(),
      size: 'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('COST.APPROVE_MODAL.CANCEL'), variant: 'secondary', action: _r => this.closed.emit() },
        { label: this.confirmLabel, variant: 'primary', icon: 'check', action: _r => this.confirm() },
      ],
    });
  }

  ngOnDestroy(): void {
    this.ref?.close();
    this.ref = null;
  }

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
          err.error?.message ?? err.error?.error ?? this.translate.instant('COST.APPROVE_MODAL.GENERIC_ERROR'),
        );
      },
    });
  }
}
