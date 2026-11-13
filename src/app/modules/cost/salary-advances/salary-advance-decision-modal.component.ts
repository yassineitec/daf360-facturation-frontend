import {
  AfterViewInit, Component, TemplateRef, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { Observable } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  FormFieldComponent, ModalService, SelectComponent, type ModalRef, type SelectOption,
} from '@khalilrebhiitec/daf360';

import { SalaryAdvanceApprovalService, SalaryAdvanceDto } from './salary-advance-approval.service';
import { currencyFractionDigits } from '../../../shared/currency-decimals.util';
import { ToastService } from '../../../core/toast.service';

type Decision = 'approve' | 'reject';

/**
 * The decision on one salary advance — the same modal from the approval queue and from the
 * « Avances sur salaire » page, so the DAF's form exists once.
 *
 * Two steps, picked from the advance's status:
 *  - PENDING_DIRECTOR — validation above the country threshold: approve (on to the DAF) or
 *    reject, a comment;
 *  - PENDING_FINANCE — the DAF (spec §4): approving means entering the FINAL terms — granted
 *    amount, months, date d'effet, first deduction month — from which payroll-service builds
 *    the schedule and RH generates the debt contract.
 *
 * Opens its own ModalService modal (like the shell's advance request): the parent mounts it
 * with an @if and drops it on `saved` / `cancelled`.
 */
@Component({
  selector: 'app-salary-advance-decision-modal',
  standalone: true,
  imports: [FormFieldComponent, SelectComponent, TranslatePipe],
  template: `
    <ng-template #bodyTpl>
      <div class="flex flex-col gap-5">
        @let a = advance();

        <div class="flex flex-col gap-1 rounded-xl bg-surface-container-low px-4 py-3">
          <span class="text-label-caps text-outline">{{ a.employeeName }} · AVS-{{ a.id }}</span>
          <span class="text-[22px] font-black leading-tight text-on-surface">{{ money(a.requestedAmount, a.currency) }}</span>
          <span class="text-body-sm text-on-surface-variant">
            {{ 'FACTURATION.ADVANCES.ASKED' | translate:{
              months: a.requestedInstallments,
              date: date(a.requestedAvailabilityDate) } }}
          </span>
          @if (a.reason) {
            <span class="mt-1 whitespace-pre-line text-body-sm text-on-surface-variant">
              {{ 'FACTURATION.ADVANCES.EMPLOYEE_SAID' | translate }} « {{ a.reason }} »
            </span>
          }
          @if (directorStep()) {
            <span class="mt-1 text-body-sm font-semibold text-warning">
              {{ 'FACTURATION.ADVANCES.ABOVE_THRESHOLD' | translate:{ threshold: money(a.directorThreshold, a.currency) } }}
            </span>
          } @else if (a.directorDecidedByName) {
            <span class="mt-1 text-body-sm text-on-surface-variant">
              {{ 'FACTURATION.ADVANCES.DIRECTOR_VALIDATED' | translate:{ name: a.directorDecidedByName } }}
              @if (a.directorNotes) { — « {{ a.directorNotes }} » }
            </span>
          }
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-label-caps text-outline">{{ 'COST.APPROVAL_QUEUE.DECISION_LABEL' | translate }}</span>
          <div class="flex flex-wrap gap-2">
            @for (opt of decisionOptions(); track opt.id) {
              <button type="button"
                class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-body-md font-bold transition-all"
                [class]="decision() === opt.id
                  ? 'border-tertiary bg-tertiary/10 text-primary'
                  : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container'"
                (click)="decision.set(opt.id)">
                <span class="material-symbols-outlined text-[18px]">{{ opt.icon }}</span>
                {{ opt.label }}
              </button>
            }
          </div>
        </div>

        <!-- Spec §4: the final terms, only when the DAF grants. -->
        @if (!directorStep() && decision() === 'approve') {
          <div class="flex flex-col gap-3">
            <span class="text-label-caps text-outline">{{ 'FACTURATION.ADVANCES.FINAL_TERMS' | translate }}</span>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <daf-form-field
                [value]="grantedAmount()"
                (valueChange)="grantedAmount.set(asNumber($event))"
                [options]="{
                  type: 'number', fullWidth: true, align: 'end', required: true, suffixText: a.currency,
                  label: ('FACTURATION.ADVANCES.GRANTED_AMOUNT' | translate)
                }" />
              <daf-form-field
                [value]="grantedInstallments()"
                (valueChange)="grantedInstallments.set(asNumber($event))"
                [options]="{
                  type: 'number', fullWidth: true, align: 'end', required: true,
                  suffixText: ('FACTURATION.ADVANCES.MONTHS_UNIT' | translate),
                  label: ('FACTURATION.ADVANCES.GRANTED_MONTHS' | translate)
                }" />
              <daf-form-field
                [value]="effectiveDate()"
                (valueChange)="setEffectiveDate($event)"
                [options]="{
                  type: 'date', fullWidth: true, required: true,
                  label: ('FACTURATION.ADVANCES.EFFECTIVE_DATE' | translate),
                  hint: ('FACTURATION.ADVANCES.EFFECTIVE_DATE_HINT' | translate)
                }" />
              <daf-select
                [options]="monthOptions()"
                [config]="{ label: ('FACTURATION.ADVANCES.FIRST_DEDUCTION' | translate), required: true }"
                [selected]="firstMonth() ? [firstMonth()!] : []"
                (selectedChange)="firstMonth.set($event[0] || null)" />
            </div>
            @if (monthly() !== null) {
              <div class="flex items-center justify-between gap-4 rounded-xl bg-teal/10 px-4 py-3">
                <span class="text-label-caps text-outline">{{ 'FACTURATION.ADVANCES.MONTHLY' | translate }}</span>
                <span class="font-semibold text-teal">
                  {{ money(monthly(), a.currency) }} × {{ grantedInstallments() }}
                  @if (lastMonth()) { · {{ 'FACTURATION.ADVANCES.UNTIL' | translate:{ month: monthLabel(lastMonth()) } }} }
                </span>
              </div>
            }
            @if (needsDirector()) {
              <div class="flex items-center gap-2 rounded-xl bg-warning/10 px-4 py-3 text-sm text-on-surface">
                <span class="material-symbols-outlined text-[18px] text-warning">warning</span>
                {{ 'FACTURATION.ADVANCES.GRANT_ABOVE_THRESHOLD' | translate:{ threshold: money(a.directorThreshold, a.currency) } }}
              </div>
            }
            <p class="text-body-sm text-on-surface-variant">{{ 'FACTURATION.ADVANCES.AFTER_APPROVAL' | translate }}</p>
          </div>
        }

        <daf-form-field
          [value]="comment()"
          (valueChange)="comment.set(asText($event))"
          [options]="{
            type: 'textarea', rows: 3, fullWidth: true, maxLength: 1000,
            label: ('COST.APPROVAL_QUEUE.COMMENT_LABEL' | translate),
            required: decision() === 'reject'
          }" />

        @if (error()) {
          <div class="flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            <span class="material-symbols-outlined text-[18px]">error</span>
            {{ error() }}
          </div>
        }
      </div>
    </ng-template>
  `,
})
export class SalaryAdvanceDecisionModalComponent implements AfterViewInit {
  private readonly svc = inject(SalaryAdvanceApprovalService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  private readonly bodyTpl = viewChild.required<TemplateRef<unknown>>('bodyTpl');

  readonly advance = input.required<SalaryAdvanceDto>();
  /** The button that opened it — pre-selects the choice. */
  readonly initialDecision = input<Decision>('approve');

  /** Decided — the parent drops the row from its queue / refreshes its list. */
  readonly saved = output<SalaryAdvanceDto>();
  readonly cancelled = output<void>();

  protected readonly decision = signal<Decision>('approve');
  protected readonly comment = signal<string | null>(null);
  protected readonly grantedAmount = signal<number | null>(null);
  protected readonly grantedInstallments = signal<number | null>(null);
  /** "yyyy-MM-dd" */
  protected readonly effectiveDate = signal<string | null>(null);
  /** "yyyy-MM" */
  protected readonly firstMonth = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  private done = false;

  protected readonly directorStep = computed(() => this.advance().status === 'PENDING_DIRECTOR');

  protected readonly decisionOptions = computed(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { id: 'approve' as Decision, icon: 'check_circle',
        label: t(this.directorStep() ? 'FACTURATION.ADVANCES.VALIDATE' : 'FACTURATION.ADVANCES.GRANT') },
      { id: 'reject' as Decision, icon: 'cancel', label: t('FACTURATION.ADVANCES.REJECT') },
    ];
  });

  /** From the later of this month and the date d'effet's month, twelve months on. */
  protected readonly monthOptions = computed<SelectOption[]>(() => {
    const from = this.minMonth();
    return Array.from({ length: 12 }, (_, i) => addMonths(from, i))
      .map(m => ({ value: m, label: this.monthLabel(m) }));
  });

  protected readonly monthly = computed(() => {
    const amount = this.grantedAmount();
    const n = this.grantedInstallments();
    if (!amount || amount <= 0 || !n || n < 1) return null;
    return Math.floor((amount / n) * 1000) / 1000;
  });

  protected readonly lastMonth = computed(() => {
    const first = this.firstMonth();
    const n = this.grantedInstallments();
    return first && n && n > 0 ? addMonths(first, n - 1) : null;
  });

  /** Granting above the threshold without the director's validation — the server refuses it too. */
  protected readonly needsDirector = computed(() => {
    const a = this.advance();
    const amount = this.grantedAmount();
    return a.directorThreshold != null && !a.directorDecidedAt && amount != null && amount > a.directorThreshold;
  });

  ngAfterViewInit(): void {
    const a = this.advance();
    this.decision.set(this.initialDecision());
    this.grantedAmount.set(a.requestedAmount ?? a.amount);
    this.grantedInstallments.set(a.requestedInstallments ?? a.installments);
    const today = todayIso();
    const wanted = a.requestedAvailabilityDate && a.requestedAvailabilityDate >= today ? a.requestedAvailabilityDate : today;
    this.setEffectiveDate(wanted);

    const t = (k: string) => this.translate.instant(k);
    const ref = this.modal.open({
      minWidth: '360px',
      resizable: true,
      maximizable: true,
      title: t(this.directorStep() ? 'FACTURATION.ADVANCES.DIRECTOR_TITLE' : 'FACTURATION.ADVANCES.DECISION_TITLE'),
      body: this.bodyTpl(),
      size: 'md',
      closeOnBackdrop: false,
      buttons: [
        { label: t('COST.APPROVAL_QUEUE.MODAL_CANCEL'), variant: 'secondary', action: r => r.close() },
        { label: t('COST.APPROVAL_QUEUE.MODAL_CONFIRM'), variant: 'primary', action: r => this.submit(r) },
      ],
    });
    // Every close path (button, header X) ends in _destroy(): tell the parent there, once.
    const destroy = ref._destroy.bind(ref);
    ref._destroy = () => {
      destroy();
      if (!this.done) {
        this.done = true;
        this.cancelled.emit();
      }
    };
  }

  /** Moving the date d'effet keeps the first month valid: never before that month. */
  protected setEffectiveDate(value: unknown): void {
    const date = this.asText(value);
    this.effectiveDate.set(date);
    const min = this.minMonth();
    const current = this.firstMonth();
    if (!current || current < min) {
      // Default: the payroll month after the money is made available, if it is not this month's.
      this.firstMonth.set(date && date.slice(0, 7) >= currentMonth() ? addMonths(date.slice(0, 7), 1) : min);
    }
  }

  private minMonth(): string {
    const now = currentMonth();
    const eff = this.effectiveDate()?.slice(0, 7) ?? now;
    return eff > now ? eff : now;
  }

  /** A ModalButton has no reactive `disabled`: every reason not to submit is said here. */
  private submit(ref: ModalRef): void {
    if (this.submitting()) return;
    const a = this.advance();
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    const notes = this.comment();
    this.error.set(null);

    if (this.decision() === 'reject' && !notes) {
      this.error.set(t('COST.APPROVAL_QUEUE.REJECT_COMMENT_REQUIRED'));
      return;
    }

    let call$: Observable<SalaryAdvanceDto>;
    if (this.directorStep()) {
      call$ = this.decision() === 'approve'
        ? this.svc.directorApprove(a.id, notes)
        : this.svc.directorReject(a.id, notes!);
    } else if (this.decision() === 'reject') {
      call$ = this.svc.reject(a.id, notes!);
    } else {
      const amount = this.grantedAmount();
      const months = this.grantedInstallments();
      const effective = this.effectiveDate();
      const first = this.firstMonth();
      if (!amount || amount <= 0) { this.error.set(t('FACTURATION.ADVANCES.ERR_AMOUNT')); return; }
      if (!months || !Number.isInteger(months) || months < 1 || months > 24) {
        this.error.set(t('FACTURATION.ADVANCES.ERR_MONTHS'));
        return;
      }
      if (!effective) { this.error.set(t('FACTURATION.ADVANCES.ERR_EFFECTIVE_DATE')); return; }
      if (!first || first < this.minMonth()) { this.error.set(t('FACTURATION.ADVANCES.ERR_FIRST_MONTH')); return; }
      if (this.needsDirector()) {
        this.error.set(t('FACTURATION.ADVANCES.GRANT_ABOVE_THRESHOLD', { threshold: this.money(a.directorThreshold, a.currency) }));
        return;
      }
      call$ = this.svc.approve(a.id, {
        grantedAmount: amount, grantedInstallments: months,
        effectiveDate: effective, firstDeductionMonth: first, notes,
      });
    }

    this.submitting.set(true);
    call$.subscribe({
      next: saved => {
        this.submitting.set(false);
        this.done = true;
        ref.close();
        this.saved.emit(saved);
      },
      error: err => {
        if (err?.status === 409) {
          this.recoverFromConflict(ref, a, err);
          return;
        }
        this.submitting.set(false);
        this.error.set(err?.error?.detail ?? err?.error?.message ?? t('COST.APPROVAL_QUEUE.GENERIC_ERROR'));
      },
    });
  }

  /**
   * 409 = the advance is no longer at this step (decided in another tab, or a first click
   * that did go through). Re-read it: if it moved on, close with the fresh row and say so,
   * instead of leaving the DAF in front of a form that can never succeed (TC-12).
   * Still at this step → a business refusal (threshold…): show it in the banner.
   */
  private recoverFromConflict(ref: ModalRef, a: SalaryAdvanceDto, err: { error?: { detail?: string; message?: string } }): void {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    const banner = err?.error?.detail ?? err?.error?.message ?? t('COST.APPROVAL_QUEUE.GENERIC_ERROR');
    this.svc.get(a.id).subscribe({
      next: fresh => {
        this.submitting.set(false);
        if (fresh.status === a.status) {
          this.error.set(banner);
          return;
        }
        this.toast.info(t('FACTURATION.ADVANCES.ALREADY_DECIDED', {
          status: t('FACTURATION.ADVANCES.STATUS.' + fresh.status) }));
        this.done = true;
        ref.close();
        this.saved.emit(fresh);
      },
      error: () => {
        this.submitting.set(false);
        this.error.set(banner);
      },
    });
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  private locale(): string {
    return this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
  }

  /** The advance's own currency, with that currency's decimals — never converted. */
  protected money(value: number | null | undefined, currency: string | null): string {
    if (value === null || value === undefined) return '—';
    const digits = currencyFractionDigits(currency);
    const formatted = new Intl.NumberFormat(this.locale(), {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
    return currency ? formatted + ' ' + currency : formatted;
  }

  protected monthLabel(ym: string | null): string {
    if (!ym) return '—';
    const [y, m] = ym.slice(0, 7).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(this.locale(), { month: 'long', year: 'numeric' });
  }

  protected date(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(this.locale(), { day: '2-digit', month: 'short', year: 'numeric' });
  }

  protected asText(value: unknown): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length ? text : null;
  }

  protected asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayIso(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function currentMonth(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
