import {
  Component, EventEmitter, Input, OnInit, Output,
  computed, inject, signal, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableRow,
  TabsComponent, TabItem, LoadingComponent,
} from '@khalilrebhiitec/daf360';
import { TsProgressService, TsTauxSubmitBody } from './ts-progress.service';
import { TsProgressSummaryDto, TsTauxDto } from './ts-progress.model';
import { BillingService, LineDetailDto } from '../billing/billing.service';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { WIP_TAUX_STATUT_BADGE } from '../../../shared/enum-labels';
import { EmailPreviewModalComponent } from '../wip/email-preview-modal.component';

/**
 * The "TS WIP" affaire tab — a TS is treated as a sub-affaire: its montantEstime plays the
 * ceiling role Affaire.contractAmount plays for AV, and progress against it is declared
 * period by period through the exact same submit -> client-notify-by-email ->
 * client-responds (possibly partially) -> DF-validates -> invoiced loop AV already uses
 * (TsProgressBillingService mirrors ProgressBillingService method-for-method). See
 * docs/superpowers/specs/2026-10-15-ts-wip-sub-affaire-design.md.
 *
 * Two-level view: a selector lists the affaire's INTEGRE/FACTURE TS with their cumulative
 * progress; selecting one opens its own AV-style declaration panel (period, %/amount toggle,
 * manual-verify checkbox, pending-client-response, history) scoped to that TS's id.
 */
@Component({
  selector: 'app-affaire-ts-wip-tab',
  standalone: true,
  imports: [
    TranslatePipe, DisplayCurrencyPipe,
    ButtonComponent, CardComponent, CheckboxComponent, FormFieldComponent, StatusBadgeComponent,
    DataTableComponent, DafCellDirective, TabsComponent, LoadingComponent,
    EmailPreviewModalComponent,
  ],
  providers: [DisplayCurrencyPipe],
  styleUrl: './affaire-ts-wip-tab.component.scss',
  template: `
    <div class="flex flex-col gap-6">
      @if (errorMsg()) {
        <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">{{ errorMsg() }}</div>
      }

      @if (!selectedTsId()) {
        <!-- ── Sélecteur de TS ─────────────────────────────────────────────── -->
        <daf-card [options]="{ variant: 'glass', padding: 'none', radius: 'xl' }">
          <h3 class="ts-toolbar-title flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
            <span class="material-symbols-outlined text-[18px]">receipt_long</span>
            {{ 'AFFAIRES.WIP.TS_SELECTOR_TITLE' | translate }}
          </h3>
        </daf-card>

        @if (loadingSummaries()) {
          <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
        } @else if (summaries().length === 0) {
          <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.TS_SELECTOR_EMPTY' | translate }}</p>
        } @else {
          <daf-data-table [columns]="selectorColumns()" [rows]="selectorRows()" [config]="selectorConfig()">
            <ng-template dafCell="statut" let-row>
              <daf-badge [label]="'AFFAIRES.WIP.BATCH_STATUS_' + row['_raw'].statut | translate"
                [options]="{ variant: row['_raw'].statut === 'FACTURE' ? 'success' : 'warning', size: 'sm' }" />
            </ng-template>
            <ng-template dafCell="actions" let-row>
              <div class="wip-icon-actions flex items-center justify-end">
                <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'arrow_forward',
                                          title: ('AFFAIRES.WIP.TS_SELECTOR_ACTION' | translate) }"
                  (onClick)="selectTs(row['_raw'])" />
              </div>
            </ng-template>
          </daf-data-table>
        }
      } @else if (selectedTs(); as ts) {
        <!-- ── Panneau de déclaration pour le TS sélectionné ───────────────── -->
        <div class="flex items-center justify-between">
          <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'arrow_back',
                                    label: ('AFFAIRES.WIP.TS_BACK_TO_SELECTOR' | translate) }"
            (onClick)="backToSelector()" />
        </div>

        <daf-card [options]="{ variant: 'outlined', radius: 'lg' }">
          <div class="flex flex-col gap-4 p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-headline-sm text-on-surface m-0">
                {{ ts.referenceTs }} — {{ ts.intitule }}
              </h3>
              <daf-badge [label]="'AFFAIRES.WIP.BATCH_STATUS_' + ts.statut | translate"
                [options]="{ variant: ts.statut === 'FACTURE' ? 'success' : 'warning', size: 'sm' }" />
            </div>
            <div class="grid grid-cols-3 gap-3 text-[13px]">
              <span>{{ 'AFFAIRES.WIP.TS_COL_MONTANT' | translate }}:
                <strong>{{ ts.montantEstime | displayCurrency : ts.devise }}</strong></span>
              <span>{{ 'AFFAIRES.WIP.TS_COL_CUMUL_PCT' | translate }}:
                <strong>{{ ts.cumulTauxValide }}%</strong></span>
              <span>{{ 'AFFAIRES.WIP.TS_COL_REMAINING' | translate }}:
                <strong>{{ ts.remainingMontant | displayCurrency : ts.devise }}</strong></span>
            </div>

            @if (ts.statut !== 'FACTURE') {
              <div class="h-px bg-outline-variant/40"></div>

              <!-- Formulaire de déclaration -->
              <div class="grid grid-cols-2 gap-3">
                <daf-form-field [value]="periodDateFrom()" (valueChange)="periodDateFrom.set($any($event))"
                  [options]="{ type: 'date', label: ('AFFAIRES.WIP.TS_PERIOD_FROM_LABEL' | translate), required: true }" />
                <daf-form-field [value]="periodDateTo()" (valueChange)="periodDateTo.set($any($event))"
                  [options]="{ type: 'date', label: ('AFFAIRES.WIP.TS_PERIOD_TO_LABEL' | translate), required: true }" />
              </div>

              <daf-tabs variant="pill" [tabs]="modeTabs()" [active]="inputMode()" (activeChange)="onModeTabChange($event)"
                [tabsLabel]="'AFFAIRES.WIP.TAUX_MODE_ARIA' | translate" idPrefix="ts-wip-mode" />

              @if (inputMode() === 'POURCENTAGE') {
                <daf-form-field [value]="newTauxValue()" (valueChange)="newTauxValue.set(parseNumberInput($event))"
                  [options]="{ type: 'number', label: ('AFFAIRES.WIP.TS_TAUX_LABEL' | translate), fullWidth: true }" />
              } @else {
                <daf-form-field [value]="newAmountValue()" (valueChange)="newAmountValue.set(parseNumberInput($event))"
                  [options]="{ type: 'number', label: ('AFFAIRES.WIP.TS_MONTANT_LABEL' | translate), fullWidth: true }" />
              }

              @if (wipPreview(); as preview) {
                <p class="text-[12px] text-on-surface-variant">
                  {{ 'AFFAIRES.WIP.TS_PREVIEW_AMOUNT' | translate }}: <strong>{{ preview | displayCurrency : ts.devise }}</strong>
                </p>
              }

              <daf-form-field [value]="tauxComment()" (valueChange)="tauxComment.set($any($event))"
                [options]="{ type: 'textarea', label: ('AFFAIRES.WIP.TS_COMMENT_LABEL' | translate), fullWidth: true }" />

              <daf-checkbox [checked]="manualVerified()"
                [options]="{ label: ('AFFAIRES.WIP.MANUAL_VERIFY_LABEL' | translate) }"
                (checkedChange)="manualVerified.set($event)" />

              <div class="wip-icon-actions flex items-center justify-end gap-1
                          bg-white/90 backdrop-blur-sm p-1 rounded-lg border border-outline-variant shadow-sm">
                @if (editingTauxId()) {
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', label: ('ADMIN.COMMON.CANCEL' | translate) }"
                    (onClick)="cancelEdit()" />
                }
                <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'send',
                                          title: ('AFFAIRES.WIP.TS_SUBMIT' | translate),
                                          loading: submittingTaux(), disabled: !canSubmitTaux() || !manualVerified() || submittingTaux() }"
                  (onClick)="submitTaux()" />
              </div>
              @if (tauxError()) {
                <p class="text-body-sm text-danger">{{ tauxError() }}</p>
              }
            }
          </div>
        </daf-card>

        @if (pendingClientEntries().length > 0) {
          <daf-card [options]="{ variant: 'outlined', radius: 'lg' }">
            <div class="flex flex-col gap-3 p-4">
              <h4 class="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                {{ 'AFFAIRES.WIP.TS_PENDING_CLIENT_TITLE' | translate }}
              </h4>
              @for (entry of pendingClientEntries(); track entry.line.id) {
                <div class="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <span class="text-[13px]">
                    {{ entry.line.periodDateFrom }} – {{ entry.line.periodDateTo }} :
                    <strong>{{ entry.line.montantHt | displayCurrency : ts.devise }}</strong>
                  </span>
                  <div class="flex items-center gap-2">
                    <daf-form-field
                      [value]="getClientAmountInput(entry.line.id)"
                      (valueChange)="setClientAmountInput(entry.line.id, parseNumberInput($event))"
                      [options]="{ label: ('AFFAIRES.WIP.CLIENT_AMOUNT_LABEL' | translate), type: 'number' }" />
                    <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'check_circle',
                                              title: ('AFFAIRES.WIP.CLIENT_AMOUNT_CONFIRM' | translate),
                                              loading: submittingClientTauxId() === entry.taux.id,
                                              disabled: getClientAmountInput(entry.line.id) === null ||
                                                        getClientAmountInput(entry.line.id)! < 0 ||
                                                        getClientAmountInput(entry.line.id)! > entry.line.montantHt }"
                      (onClick)="confirmClientAmount(entry)" />
                  </div>
                </div>
              }
              @if (clientAmountError()) {
                <p class="text-body-sm text-danger">{{ clientAmountError() }}</p>
              }
            </div>
          </daf-card>
        }

        @if (loadingTaux()) {
          <daf-loading class="ts-loading" [message]="'AFFAIRES.WIP.LOADING' | translate" />
        } @else if (tauxHistory().length > 0) {
          <daf-data-table [columns]="historyColumns()" [rows]="historyRows()" [config]="historyConfig()">
            <ng-template dafCell="factureProgress" let-row>
              @if (row['_remainderPending'] === null) {
                —
              } @else {
                <div class="flex flex-col gap-1">
                  <span class="text-[12px] whitespace-nowrap">
                    {{ row['_montantFacture'] | displayCurrency : ts.devise }} / {{ row['_raw'].montantIncremental | displayCurrency : ts.devise }}
                  </span>
                  @if (row['_isComplete']) {
                    <daf-badge [label]="'AFFAIRES.WIP.FACTURE_COMPLETE' | translate"
                      [options]="{ variant: 'success', size: 'sm', dot: true }" />
                  } @else {
                    <daf-badge [label]="'AFFAIRES.WIP.FACTURE_PARTIAL' | translate:{ amount: (row['_remainderPending'] | displayCurrency:ts.devise) }"
                      [options]="{ variant: 'warning', size: 'sm', dot: true }" />
                  }
                </div>
              }
            </ng-template>
            <ng-template dafCell="statut" let-row>
              <daf-badge [label]="'ENUMS.WIP_TAUX_STATUT.' + row['_raw'].statut | translate"
                [options]="{ variant: tauxBadgeVariant(row['_raw'].statut), size: 'sm' }" />
            </ng-template>
            <ng-template dafCell="actions" let-row>
              @if (row['_raw'].statut === 'EN_ATTENTE' || row['_raw'].statut === 'REFUSE') {
                <div class="wip-icon-actions flex items-center justify-end gap-1">
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'edit',
                                            title: ('AFFAIRES.WIP.TS_EDIT' | translate) }"
                    (onClick)="editTaux(row['_raw'])" />
                  <daf-button [options]="{ variant: 'ghost', size: 'sm', iconStart: 'delete',
                                            title: ('AFFAIRES.WIP.TS_DELETE' | translate) }"
                    (onClick)="deleteTaux(row['_raw'])" />
                </div>
              }
            </ng-template>
          </daf-data-table>
        } @else {
          <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.TS_HISTORY_EMPTY' | translate }}</p>
        }
      }

      <app-email-preview-modal #emailPreviewModal />
    </div>
  `,
})
export class AffaireTsWipTabComponent implements OnInit {
  @Input({ required: true }) affaire!: { id: number; devise: string; reference?: string | null };
  @Output() readonly dataChanged = new EventEmitter<void>();

  private readonly svc        = inject(TsProgressService);
  private readonly billingSvc = inject(BillingService);
  private readonly translate  = inject(TranslateService);
  private readonly currency   = inject(DisplayCurrencyPipe);

  private readonly emailPreviewModal = viewChild.required<EmailPreviewModalComponent>('emailPreviewModal');

  errorMsg = signal<string | null>(null);

  // ── Sélecteur ──────────────────────────────────────────────────────────
  loadingSummaries = signal(false);
  summaries        = signal<TsProgressSummaryDto[]>([]);
  selectedTsId     = signal<number | null>(null);
  readonly selectedTs = computed<TsProgressSummaryDto | null>(() =>
    this.summaries().find(s => s.tsId === this.selectedTsId()) ?? null);

  readonly selectorColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'reference', label: t('AFFAIRES.WIP.TS_COL_REFERENCE') },
      { key: 'intitule',  label: t('AFFAIRES.WIP.TS_COL_INTITULE') },
      { key: 'montant',   label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right' },
      { key: 'cumulPct',  label: t('AFFAIRES.WIP.TS_COL_CUMUL_PCT'), align: 'right' },
      { key: 'remaining', label: t('AFFAIRES.WIP.TS_COL_REMAINING'), align: 'right' },
      { key: 'statut',    label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'custom' },
      { key: 'actions',   label: '', type: 'custom', align: 'right' },
    ];
  });

  readonly selectorRows = computed<TableRow[]>(() => this.summaries().map(s => ({
    id:         s.tsId,
    reference:  s.referenceTs,
    intitule:   s.intitule,
    montant:    this.currency.transform(s.montantEstime, s.devise),
    cumulPct:   s.cumulTauxValide + '%',
    remaining:  this.currency.transform(s.remainingMontant, s.devise),
    _raw:       s,
  } satisfies TableRow)));

  readonly selectorConfig = computed<TableConfig>(() => ({
    showHeader: true,
    hoverable: true,
    emptyMessage: this.translate.instant('AFFAIRES.WIP.TS_SELECTOR_EMPTY'),
  }));

  selectTs(ts: TsProgressSummaryDto): void {
    this.selectedTsId.set(ts.tsId);
    this.resetForm();
    this.loadTauxHistory();
    this.loadLineHistory();
  }

  backToSelector(): void {
    this.selectedTsId.set(null);
    this.loadSummaries();
  }

  // ── Formulaire de déclaration ────────────────────────────────────────────
  private readonly now = new Date();
  periodDateFrom = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1)));
  periodDateTo   = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)));
  inputMode      = signal<'POURCENTAGE' | 'MONTANT'>('POURCENTAGE');
  newTauxValue   = signal<number | null>(null);
  newAmountValue = signal<number | null>(null);
  tauxComment    = signal('');
  manualVerified = signal(false);
  submittingTaux = signal(false);
  tauxError      = signal<string | null>(null);
  editingTauxId  = signal<number | null>(null);

  readonly modeTabs = computed<TabItem[]>(() => [
    { id: 'POURCENTAGE', label: this.translate.instant('AFFAIRES.WIP.TAUX_MODE_PERCENT') },
    { id: 'MONTANT',     label: this.translate.instant('AFFAIRES.WIP.TAUX_MODE_AMOUNT') },
  ]);

  onModeTabChange(id: string): void {
    if (id === 'POURCENTAGE' || id === 'MONTANT') this.inputMode.set(id);
  }

  parseNumberInput(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  readonly effectiveTauxPercent = computed<number | null>(() => {
    const ts = this.selectedTs();
    if (!ts) return null;
    if (this.inputMode() === 'POURCENTAGE') return this.newTauxValue();
    const amount = this.newAmountValue();
    if (amount === null || !ts.montantEstime) return null;
    if (amount === ts.remainingMontant) return Number((100 - ts.cumulTauxValide).toFixed(6));
    return Number(((amount / ts.montantEstime) * 100).toFixed(6));
  });

  readonly canSubmitTaux = computed(() => {
    const ts = this.selectedTs();
    if (!ts) return false;
    if (this.inputMode() === 'MONTANT') {
      const amount = this.newAmountValue();
      return amount !== null && amount > 0 && amount <= ts.remainingMontant;
    }
    const taux = this.effectiveTauxPercent();
    if (taux === null || taux <= 0) return false;
    return Number((ts.cumulTauxValide + taux).toFixed(6)) <= 100;
  });

  readonly wipPreview = computed<number | null>(() => {
    const ts = this.selectedTs();
    const taux = this.effectiveTauxPercent();
    if (!ts || taux === null) return null;
    if (Number((ts.cumulTauxValide + taux).toFixed(6)) === 100 && ts.remainingMontant > 0) {
      return ts.remainingMontant;
    }
    return Number(((taux * ts.montantEstime) / 100).toFixed(3));
  });

  private resetForm(): void {
    this.periodDateFrom.set(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1)));
    this.periodDateTo.set(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)));
    this.inputMode.set('POURCENTAGE');
    this.newTauxValue.set(null);
    this.newAmountValue.set(null);
    this.tauxComment.set('');
    this.manualVerified.set(false);
    this.editingTauxId.set(null);
    this.tauxError.set(null);
  }

  private buildSubmitBody(): TsTauxSubmitBody {
    return {
      periodDateFrom: this.periodDateFrom(),
      periodDateTo: this.periodDateTo(),
      tauxSaisi: this.inputMode() === 'POURCENTAGE' ? (this.newTauxValue() ?? 0) : 0,
      commentaire: this.tauxComment() || null,
      montantSaisi: this.inputMode() === 'MONTANT' ? this.newAmountValue() : null,
    };
  }

  submitTaux(): void {
    const tsId = this.selectedTsId();
    if (!tsId || !this.canSubmitTaux() || this.submittingTaux()) return;
    this.submittingTaux.set(true);
    this.tauxError.set(null);
    const body = this.buildSubmitBody();
    this.svc.previewTauxEmail(tsId, body).subscribe({
      next: preview => {
        this.submittingTaux.set(false);
        this.emailPreviewModal().open(preview, (subject, mailBody, done) =>
          this.doSubmitTaux(tsId, { ...body, emailSubject: subject, emailBody: mailBody }, done));
      },
      error: err => {
        this.submittingTaux.set(false);
        this.tauxError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR'));
      },
    });
  }

  private doSubmitTaux(tsId: number, body: TsTauxSubmitBody, done: (errorMessage?: string) => void): void {
    const editingId = this.editingTauxId();
    const obs = editingId ? this.svc.updateTaux(editingId, body) : this.svc.submitTaux(tsId, body);
    obs.subscribe({
      next: () => {
        done();
        this.resetForm();
        this.loadTauxHistory();
        this.loadLineHistory();
        this.loadSummaries();
        this.dataChanged.emit();
      },
      error: err => done(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR')),
    });
  }

  editTaux(taux: TsTauxDto): void {
    this.editingTauxId.set(taux.id);
    this.periodDateFrom.set(taux.periodDateFrom);
    this.periodDateTo.set(taux.periodDateTo);
    this.inputMode.set('POURCENTAGE');
    this.newTauxValue.set(taux.tauxSaisi);
    this.tauxComment.set(taux.commentaire ?? '');
    this.manualVerified.set(false);
  }

  cancelEdit(): void {
    this.resetForm();
  }

  deleteTaux(taux: TsTauxDto): void {
    if (!confirm(this.translate.instant('AFFAIRES.WIP.TS_DELETE_CONFIRM'))) return;
    this.svc.deleteTaux(taux.id).subscribe({
      next: () => {
        this.loadTauxHistory();
        this.loadLineHistory();
        this.loadSummaries();
        this.dataChanged.emit();
      },
      error: err => this.errorMsg.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.TS_SUBMIT_ERROR')),
    });
  }

  // ── Historique des déclarations ──────────────────────────────────────────
  loadingTaux = signal(false);
  tauxHistory = signal<TsTauxDto[]>([]);

  private loadTauxHistory(): void {
    const tsId = this.selectedTsId();
    if (!tsId) return;
    this.loadingTaux.set(true);
    this.svc.getTauxHistory(tsId).subscribe({
      next:  list => { this.tauxHistory.set(list); this.loadingTaux.set(false); },
      error: () => this.loadingTaux.set(false),
    });
  }

  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'periode',  label: t('AFFAIRES.WIP.TS_COL_DATE') },
      { key: 'taux',     label: t('AFFAIRES.WIP.TAUX_MODE_PERCENT'), align: 'right' },
      { key: 'montant',  label: t('AFFAIRES.WIP.TS_COL_MONTANT'), align: 'right' },
      { key: 'factureProgress', label: t('AFFAIRES.WIP.COL_FACTURE_PROGRESS'), type: 'custom' },
      { key: 'statut',   label: t('AFFAIRES.WIP.TS_COL_STATUT'), type: 'custom' },
      { key: 'actions',  label: '', type: 'custom', align: 'right' },
    ];
  });

  readonly historyRows = computed<TableRow[]>(() => {
    const ts = this.selectedTs();
    const lines = this.lineHistory();
    return this.tauxHistory().map(t => ({
      id:       t.id,
      periode:  t.periodDateFrom + ' – ' + t.periodDateTo,
      taux:     t.tauxSaisi + '%',
      montant:  ts ? this.currency.transform(t.montantIncremental, ts.devise) : t.montantIncremental,
      _raw:     t,
      ...this.factureProgress(t, lines),
    } satisfies TableRow));
  });

  readonly historyConfig = computed<TableConfig>(() => ({ showHeader: true, hoverable: false }));

  tauxBadgeVariant(statut: string) {
    return WIP_TAUX_STATUT_BADGE[statut] ?? 'neutral';
  }

  /** Same mechanic as AffaireWipTabComponent.findChainTail() (AV) / the old TS batch tab's
   * own factureProgress(): a partial client confirmation never modifies the declaration's own
   * BillingLine — it just sets that line's wipCarriedForward. Walking carriedForwardFromLineId
   * forward finds whatever later line (if any) picked that remainder up; the tail's own
   * wipCarriedForward is what's still genuinely outstanding right now. */
  private findChainTail(line: LineDetailDto, lines: LineDetailDto[]): LineDetailDto {
    let tail = line;
    for (let i = 0; i < 50; i++) {
      const next = lines.find(l => l.carriedForwardFromLineId === tail.id);
      if (!next) break;
      tail = next;
    }
    return tail;
  }

  /** Fields read by the history table's "Facturé" cell (factureProgress column): how much of
   * this declaration's montantIncremental has actually been confirmed/billed so far. */
  private factureProgress(taux: TsTauxDto, lines: LineDetailDto[]) {
    const originLine = taux.billingLineId != null ? lines.find(l => l.id === taux.billingLineId) ?? null : null;
    const tail = originLine ? this.findChainTail(originLine, lines) : null;
    const remainderPending = tail ? Number((tail.wipCarriedForward ?? 0).toFixed(3)) : null;
    const montantFacture = remainderPending !== null
      ? Number((taux.montantIncremental - remainderPending).toFixed(3))
      : null;
    return {
      _remainderPending: remainderPending,
      _montantFacture:   montantFacture,
      _isComplete:       remainderPending !== null && remainderPending < 0.01,
    };
  }

  // ── Réponse client en attente ─────────────────────────────────────────────
  lineHistory = signal<LineDetailDto[]>([]);

  private loadLineHistory(): void {
    const tsId = this.selectedTsId();
    if (!tsId || !this.affaire?.id) return;
    this.billingSvc.getBillingLinesDetailed(this.affaire.id).subscribe({
      next:  lines => this.lineHistory.set(lines.filter(l => l.billingMode === 'TS' && l.tsId === tsId)),
      error: () => this.lineHistory.set([]),
    });
  }

  readonly pendingClientEntries = computed<{ line: LineDetailDto; taux: TsTauxDto }[]>(() => {
    const lines = this.lineHistory().filter(l => l.statut === 'EN_ATTENTE_CLIENT');
    const taux  = this.tauxHistory();
    return lines
      .map(line => ({ line, taux: taux.find(t => t.billingLineId === line.id) ?? null }))
      .filter((e): e is { line: LineDetailDto; taux: TsTauxDto } => e.taux !== null);
  });

  clientAmountInputs    = signal<Map<number, number | null>>(new Map());
  submittingClientTauxId = signal<number | null>(null);
  clientAmountError     = signal<string | null>(null);

  getClientAmountInput(lineId: number): number | null {
    return this.clientAmountInputs().get(lineId) ?? null;
  }

  setClientAmountInput(lineId: number, value: number | null): void {
    const map = new Map(this.clientAmountInputs());
    map.set(lineId, value);
    this.clientAmountInputs.set(map);
  }

  confirmClientAmount(entry: { line: LineDetailDto; taux: TsTauxDto }): void {
    const amount = this.getClientAmountInput(entry.line.id);
    const tsId = this.selectedTsId();
    if (amount === null || amount < 0 || amount > entry.line.montantHt
      || !tsId || this.submittingClientTauxId() !== null) return;
    this.submittingClientTauxId.set(entry.taux.id);
    this.clientAmountError.set(null);
    this.svc.enterClientAmount(tsId, entry.taux.id, amount).subscribe({
      next: () => {
        this.submittingClientTauxId.set(null);
        this.setClientAmountInput(entry.line.id, null);
        this.loadLineHistory();
        this.loadTauxHistory();
        this.dataChanged.emit();
      },
      error: err => {
        this.submittingClientTauxId.set(null);
        this.clientAmountError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  // ── Chargement initial ────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadSummaries();
  }

  private loadSummaries(): void {
    if (!this.affaire?.id) return;
    this.loadingSummaries.set(true);
    this.svc.getSummaryForAffaire(this.affaire.id).subscribe({
      next:  list => { this.summaries.set(list); this.loadingSummaries.set(false); },
      error: () => this.loadingSummaries.set(false),
    });
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
