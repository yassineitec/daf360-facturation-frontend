import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx';
import {
  ButtonComponent, FormFieldComponent,
  StepperComponent, StepperStep, StepperConfig,
} from '@khalilrebhiitec/daf360';
import { Router } from '@angular/router';
import { WipService } from './wip.service';
import { WipTauxDto, WipTmHourDto, WipTmPreviewDto } from './wip.model';
import { BillingService, LineDetailDto } from '../billing/billing.service';
import { LivrableService } from '../livrable.service';
import { AffaireLivrableDto } from '../livrable.model';
import { AffaireDetail } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { isoWeek, isoWeekYear } from '../../../shared/iso-week';
import { WipTmDetailTableComponent } from './wip-tm-detail-table.component';
import { WipTmCollaboratorDetailComponent } from './wip-tm-collaborator-detail.component';

@Component({
  selector: 'app-affaire-wip-tab',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, FormFieldComponent, StepperComponent,
    DisplayCurrencyPipe, WipTmDetailTableComponent, WipTmCollaboratorDetailComponent,
  ],
  templateUrl: './affaire-wip-tab.component.html',
})
export class AffaireWipTabComponent implements OnInit {
  @Input({ required: true }) affaire!: AffaireDetail;

  private readonly svc = inject(WipService);
  private readonly billingSvc = inject(BillingService);
  private readonly livrableSvc = inject(LivrableService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  private readonly now = new Date();
  // AV only — defaults to the current calendar month as a starting point, same as TM's
  // tmDateFrom/tmDateTo below, but freely editable to any range (see 2026-09-01 design spec).
  periodDateFrom = this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1));
  periodDateTo   = this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0));

  // ── AV ──────────────────────────────────────────────────────────────────
  tauxHistory   = signal<WipTauxDto[]>([]);
  loadingTaux   = signal(false);
  newTauxValue  = signal<number | null>(null);
  tauxComment   = '';
  tauxError     = signal<string | null>(null);
  submittingTaux= signal(false);

  readonly lastValidatedTaux = computed(() => {
    const vals = this.tauxHistory().filter(t => t.statut === 'VALIDE');
    return vals.length > 0 ? Math.max(...vals.map(t => t.tauxSaisi)) : 0;
  });

  readonly canSubmitTaux = computed(() => {
    const taux = this.newTauxValue();
    return taux !== null && taux > this.lastValidatedTaux() && taux <= 100;
  });

  readonly avWipPreview = computed<number | null>(() => {
    const taux = this.newTauxValue();
    if (taux === null || !this.affaire.contractAmount) return null;
    return (taux / 100) * this.affaire.contractAmount;
  });

  // ── TM ──────────────────────────────────────────────────────────────────
  // Arbitrary date range (no longer tied to a calendar month) — see
  // WipTmController/WipTmService. Defaults to the current month purely as a starting
  // point, same as AV's periodDateFrom/periodDateTo above; either date is freely editable.
  tmDateFrom = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth(), 1)));
  tmDateTo   = signal(this.toIso(new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)));
  tmPreview     = signal<WipTmPreviewDto | null>(null);
  loadingTm     = signal(false);
  tmError       = signal<string | null>(null);
  validatingTm  = signal(false);
  showTmDetails = signal(false);
  /** Which collaborator's granular hours are currently drilled into, within the Détails
   * panel — null shows the by-collaborator summary table instead. */
  selectedCollaboratorUserId = signal<number | null>(null);
  tmHistory     = signal<LineDetailDto[]>([]);
  loadingTmHistory = signal(false);

  // ── LIVRABLE ────────────────────────────────────────────────────────────
  // Each document already carries its own cumulative % billed (pctFacture) — this map
  // holds what the user has TYPED for each one so far this session, defaulting to that
  // same current value (i.e. "no change") until edited. A document only produces an
  // invoice line if its entered value ends up higher than its stored one.
  livrables            = signal<AffaireLivrableDto[]>([]);
  loadingLivrables     = signal(false);
  enteredPct           = signal<Map<number, number>>(new Map());
  validatingLivrables  = signal(false);
  livrableError        = signal<string | null>(null);

  readonly pendingLivrables = computed(() =>
    this.livrables().filter(l => l.statut === 'A_FACTURER' || l.statut === 'EN_COURS'));
  readonly livrableHistory  = computed(() => this.livrables().filter(l => l.statut === 'FACTURE'));

  private changedEntries(): { livrableId: number; pctSaisi: number }[] {
    const entered = this.enteredPct();
    return this.pendingLivrables()
      .map(l => ({ livrableId: l.id, pctSaisi: entered.get(l.id) ?? l.pctFacture, current: l.pctFacture }))
      .filter(e => e.pctSaisi > e.current)
      .map(({ livrableId, pctSaisi }) => ({ livrableId, pctSaisi }));
  }

  readonly hasLivrableChanges = computed(() => this.changedEntries().length > 0);

  readonly totalToInvoice = computed(() => {
    const entered = this.enteredPct();
    return this.pendingLivrables().reduce((sum, l) => {
      const pct = entered.get(l.id) ?? l.pctFacture;
      const delta = Math.max(0, pct - l.pctFacture);
      return sum + (delta / 100) * l.budgetAlloue;
    }, 0);
  });

  // ── TM — Review / manual verification / validate / client-response stepper ──────
  // A thin progress rail over the SAME preview content below (chrome: 'header-only' —
  // the library's rail-only mode, same pattern as the affaire wizard) rather than a
  // content-switching wizard: step 1 (review) is just the preview already on screen,
  // step 2 gates Valider behind an explicit manual-verification acknowledgment, step 3
  // is the existing Valider action, step 4 is the client's reply — reaching it means at
  // least one billing line for this affaire is sitting at EN_ATTENTE_CLIENT, waiting for
  // its "montant validé par le client" to be entered (see pendingClientLines below).
  // See the WIP client-approval functional spec, 2026-08-27.
  wipStep           = signal(1);
  wipManualVerified = signal(false);

  /** Derived, not tracked imperatively — the frontier is always exactly what the real
   * data says it is (a preview to review, a manual check ticked, a line still awaiting
   * the client), so it can never drift out of sync with what's actually on screen. */
  readonly wipMaxStepReached = computed(() => {
    if (this.pendingClientLines().length > 0) return 4;
    if (this.wipManualVerified()) return 3;
    const p = this.tmPreview();
    if (p && (p.hours.length > 0 || p.carriedForwardAmount > 0)) return 2;
    return 1;
  });

  readonly wipStepperSteps = computed<StepperStep[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { title: t('AFFAIRES.WIP.STEP_REVIEW') },
      { title: t('AFFAIRES.WIP.STEP_VERIFY') },
      { title: t('AFFAIRES.WIP.STEP_VALIDATE') },
      { title: t('AFFAIRES.WIP.STEP_CLIENT') },
    ].map((s, i) => ({
      ...s,
      completed: i + 1 < this.wipMaxStepReached(),
      disabled:  i + 1 > this.wipMaxStepReached(),
    }));
  });

  readonly wipStepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      chrome: 'header-only',
      labelDensity: 'quiet',
      clickableSteps: true,
      stepperLabel: this.translate.instant('AFFAIRES.WIP.STEPPER_LABEL'),
    };
  });

  onWipStepClick(index: number): void {
    const target = index + 1;
    if (target !== this.wipStep() && target <= this.wipMaxStepReached()) {
      this.wipStep.set(target);
    }
  }

  onManualVerifiedChange(checked: boolean): void {
    this.wipManualVerified.set(checked);
    if (checked) this.wipStep.set(3);
  }

  private resetWipStepper(): void {
    this.wipStep.set(1);
    this.wipManualVerified.set(false);
  }

  // ── TM — client-approval workflow (lines sitting at EN_ATTENTE_CLIENT) ───────────
  readonly pendingClientLines = computed(() => this.tmHistory().filter(l => l.statut === 'EN_ATTENTE_CLIENT'));
  clientAmountInputs   = signal<Map<number, number | null>>(new Map());
  submittingClientLine = signal<number | null>(null);
  clientAmountError    = signal<string | null>(null);

  getClientAmountInput(lineId: number): number | null {
    return this.clientAmountInputs().get(lineId) ?? null;
  }

  setClientAmountInput(lineId: number, value: number | null): void {
    const map = new Map(this.clientAmountInputs());
    map.set(lineId, value);
    this.clientAmountInputs.set(map);
  }

  confirmClientAmount(line: LineDetailDto): void {
    const amount = this.getClientAmountInput(line.id);
    if (amount === null || amount < 0 || amount > line.montantHt || this.submittingClientLine() !== null) return;
    this.submittingClientLine.set(line.id);
    this.clientAmountError.set(null);
    this.svc.enterClientAmount(this.affaire.id, line.id, amount).subscribe({
      next: () => {
        this.submittingClientLine.set(null);
        this.setClientAmountInput(line.id, null);
        this.loadTmHistory();
      },
      error: err => {
        this.submittingClientLine.set(null);
        this.clientAmountError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.CLIENT_AMOUNT_ERROR'));
      },
    });
  }

  ngOnInit(): void {
    if (this.affaire.billingMode === 'FORFAIT') this.loadTauxHistory();
    if (this.affaire.billingMode === 'REGIE') { this.loadTmPreview(); this.loadTmHistory(); }
    if (this.affaire.billingMode === 'LIVRABLE') this.loadLivrables();
  }

  // ── AV actions ────────────────────────────────────────────────────────────

  loadTauxHistory(): void {
    this.loadingTaux.set(true);
    this.svc.getTauxHistory(this.affaire.id).subscribe({
      next:  h => { this.tauxHistory.set(h); this.loadingTaux.set(false); },
      error: () => this.loadingTaux.set(false),
    });
  }

  submitTaux(): void {
    const taux = this.newTauxValue();
    if (taux === null || !this.canSubmitTaux() || this.submittingTaux()) return;
    this.submittingTaux.set(true);
    this.tauxError.set(null);
    this.svc.submitTaux(this.affaire.id, {
      periodDateFrom: this.periodDateFrom,
      periodDateTo: this.periodDateTo,
      tauxSaisi: taux,
      commentaire: this.tauxComment.trim() || null,
    }).subscribe({
      next: () => {
        this.submittingTaux.set(false);
        this.newTauxValue.set(null);
        this.tauxComment = '';
        this.loadTauxHistory();
      },
      error: err => {
        this.submittingTaux.set(false);
        this.tauxError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.SUBMIT_ERROR'));
      },
    });
  }

  // ── TM actions ────────────────────────────────────────────────────────────

  toggleTmDetails(): void {
    this.showTmDetails.set(!this.showTmDetails());
    this.selectedCollaboratorUserId.set(null);
  }

  /** Two-sheet workbook from the data already on screen (no extra request) — "Résumé" one
   * row per collaborator (same aggregate as WipTmDetailTableComponent), "Détails" every
   * hour entry across every collaborator with a Collaborateur column added, so a manager
   * can filter/pivot the whole affaire's WIP in Excel instead of clicking through each
   * person one by one. */
  exportWipExcel(): void {
    const hours = this.tmPreview()?.hours ?? [];
    if (!hours.length) return;

    const byUser = new Map<number, { userFullName: string; totalHours: number; totalCost: number; days: Set<string> }>();
    for (const h of hours) {
      const entry = byUser.get(h.userId) ?? { userFullName: h.userFullName, totalHours: 0, totalCost: 0, days: new Set<string>() };
      entry.totalHours += h.hoursValidated;
      entry.totalCost  += h.costAmount;
      entry.days.add(h.workDate);
      byUser.set(h.userId, entry);
    }

    const t = (k: string) => this.translate.instant(k);
    const resumeRows = [...byUser.values()]
      .sort((a, b) => b.totalCost - a.totalCost)
      .map(e => ({
        [t('AFFAIRES.WIP.COL_COLLABORATOR')]: e.userFullName,
        [t('AFFAIRES.WIP.COL_DAYS')]:         e.days.size,
        [t('AFFAIRES.WIP.COL_HOURS')]:        Number(e.totalHours.toFixed(2)),
        [t('AFFAIRES.WIP.COL_COST')]:         Number(e.totalCost.toFixed(3)),
      }));

    const detailRows = hours
      .slice()
      .sort((a, b) => a.userFullName.localeCompare(b.userFullName) || a.workDate.localeCompare(b.workDate))
      .map((h: WipTmHourDto) => ({
        [t('AFFAIRES.WIP.COL_COLLABORATOR')]: h.userFullName,
        [t('AFFAIRES.WIP.COL_DATE')]:         this.fmtDateForExport(h.workDate),
        [t('AFFAIRES.WIP.COL_WEEK')]:         'S' + isoWeek(h.workDate),
        [t('AFFAIRES.WIP.COL_DISCIPLINE')]:   h.disciplineLabel ?? '',
        [t('AFFAIRES.WIP.COL_WBS')]:          h.wbsName ?? h.wbsId ?? '',
        [t('AFFAIRES.WIP.COL_DOCUMENT')]:     h.document ?? '',
        [t('AFFAIRES.WIP.COL_HOURS')]:        Number(h.hoursValidated.toFixed(2)),
        [t('AFFAIRES.WIP.COL_COST')]:         Number(h.costAmount.toFixed(3)),
      }));

    // One row per collaborator, one column per ISO week present in the data — lets a
    // manager see the shape of each person's effort across the period at a glance.
    const weekKeys = new Map<number, string>(); // sortable "yyyyww" key -> display label
    for (const h of hours) {
      const key = isoWeekYear(h.workDate) * 100 + isoWeek(h.workDate);
      if (!weekKeys.has(key)) weekKeys.set(key, 'S' + isoWeek(h.workDate));
    }
    const sortedWeekKeys = [...weekKeys.keys()].sort((a, b) => a - b);

    const hoursByUserWeek = new Map<number, Map<number, number>>();
    for (const h of hours) {
      const weekKey = isoWeekYear(h.workDate) * 100 + isoWeek(h.workDate);
      const perWeek = hoursByUserWeek.get(h.userId) ?? new Map<number, number>();
      perWeek.set(weekKey, (perWeek.get(weekKey) ?? 0) + h.hoursValidated);
      hoursByUserWeek.set(h.userId, perWeek);
    }

    const weeklyRows = [...byUser.entries()]
      .sort((a, b) => a[1].userFullName.localeCompare(b[1].userFullName))
      .map(([userId, e]) => {
        const perWeek = hoursByUserWeek.get(userId);
        const row: Record<string, string | number> = {
          [t('AFFAIRES.WIP.COL_COLLABORATOR')]: e.userFullName,
        };
        for (const weekKey of sortedWeekKeys) {
          row[weekKeys.get(weekKey)!] = Number((perWeek?.get(weekKey) ?? 0).toFixed(2));
        }
        row[t('AFFAIRES.WIP.COL_TOTAL')] = Number(e.totalHours.toFixed(2));
        return row;
      });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumeRows), t('AFFAIRES.WIP.EXPORT_SHEET_SUMMARY'));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), t('AFFAIRES.WIP.EXPORT_SHEET_DETAILS'));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), t('AFFAIRES.WIP.EXPORT_SHEET_WEEKLY'));

    const affaireRef = this.affaire.reference ?? String(this.affaire.id);
    XLSX.writeFile(wb, `WIP_${affaireRef}_${this.tmDateFrom()}_${this.tmDateTo()}.xlsx`);
  }

  private fmtDateForExport(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  loadTmPreview(): void {
    if (this.tmDateFrom() > this.tmDateTo()) {
      this.tmError.set(this.translate.instant('AFFAIRES.WIP.DATE_RANGE_INVALID'));
      return;
    }
    this.loadingTm.set(true);
    this.tmError.set(null);
    this.selectedCollaboratorUserId.set(null);
    this.resetWipStepper();
    this.svc.previewTm(this.affaire.id, this.tmDateFrom(), this.tmDateTo()).subscribe({
      next: p => {
        this.tmPreview.set(p);
        this.loadingTm.set(false);
        // Step 1 (review) is satisfied the moment there's something to review — unlocks
        // step 2's manual-verification checkbox. Only advances the focused step, never
        // regresses it — if step 4 is already showing a pending client response, a fresh
        // preview for a new period must not steal focus away from it.
        if ((p.hours.length > 0 || p.carriedForwardAmount > 0) && this.wipStep() < 2) {
          this.wipStep.set(2);
        }
      },
      error: err => {
        this.tmPreview.set(null);
        this.loadingTm.set(false);
        this.tmError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.LOAD_ERROR'));
      },
    });
  }

  validateTm(): void {
    if (this.validatingTm() || this.tmDateFrom() > this.tmDateTo() || !this.wipManualVerified()) return;
    this.validatingTm.set(true);
    this.tmError.set(null);
    this.svc.validateTm(this.affaire.id, this.tmDateFrom(), this.tmDateTo()).subscribe({
      next: () => {
        this.validatingTm.set(false);
        this.showTmDetails.set(false);
        this.loadTmPreview();
        this.loadTmHistory();
        // The line just moved to EN_ATTENTE_CLIENT — focus the rail on step 4 even before
        // loadTmHistory()'s response confirms it (loadTmPreview()'s own reset runs first,
        // synchronously, so this has to come after it to win).
        this.wipStep.set(4);
      },
      error: err => {
        this.validatingTm.set(false);
        this.tmError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.VALIDATE_ERROR'));
      },
    });
  }

  /** Every WIP period already validated for this affaire — the TM branch had no history
   * view at all before, unlike AV's tauxHistory table below its own form. */
  loadTmHistory(): void {
    this.loadingTmHistory.set(true);
    this.billingSvc.getBillingLinesDetailed(this.affaire.id).subscribe({
      next: lines => {
        this.tmHistory.set(lines);
        this.loadingTmHistory.set(false);
        // The client's reply just got recorded for the last pending line and none remain —
        // step 4 is done, so the rail moves on to a fresh cycle. Guarded on wipStep() === 4
        // so this never fires from ngOnInit's own initial load.
        if (this.wipStep() === 4 && this.pendingClientLines().length === 0) this.resetWipStepper();
      },
      error: () => this.loadingTmHistory.set(false),
    });
  }

  /** Local calendar date -> 'yyyy-MM-dd', deliberately not toISOString() (UTC-based, which
   * can shift the date by a day depending on the viewer's timezone offset). */
  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── LIVRABLE actions ──────────────────────────────────────────────────────

  loadLivrables(): void {
    this.loadingLivrables.set(true);
    this.livrableSvc.getLivrables(this.affaire.id).subscribe({
      next: l => {
        this.livrables.set(l);
        // Reset every editable field back to "no change yet" — each pending document
        // starts at its own current cumulative %.
        this.enteredPct.set(new Map(
          l.filter(x => x.statut !== 'FACTURE' && x.statut !== 'ANNULE').map(x => [x.id, x.pctFacture]),
        ));
        this.loadingLivrables.set(false);
      },
      error: () => this.loadingLivrables.set(false),
    });
  }

  private currentPct(id: number): number {
    return this.livrables().find(l => l.id === id)?.pctFacture ?? 0;
  }

  getEnteredPct(id: number): number {
    return this.enteredPct().get(id) ?? this.currentPct(id);
  }

  setEnteredPct(id: number, value: number): void {
    const current = this.currentPct(id);
    const clamped = Number.isFinite(value) ? Math.min(100, Math.max(current, value)) : current;
    const map = new Map(this.enteredPct());
    map.set(id, clamped);
    this.enteredPct.set(map);
  }

  /** Live preview of what this one row would add to the invoice at its currently entered %
   * — zero if the user hasn't raised it above the document's current cumulative %. */
  incrementalAmount(l: AffaireLivrableDto): number {
    const entered = this.enteredPct().get(l.id) ?? l.pctFacture;
    const delta = Math.max(0, entered - l.pctFacture);
    return (delta / 100) * l.budgetAlloue;
  }

  /** DF's one action: validate every document whose entered % was actually raised, which
   * creates their BillingLines and one shared draft invoice server-side — jump straight
   * into its edit stepper, same redirect pattern used everywhere else a DF action creates
   * an invoice. */
  validateLivrables(): void {
    const entries = this.changedEntries();
    if (entries.length === 0 || this.validatingLivrables()) return;
    this.validatingLivrables.set(true);
    this.livrableError.set(null);
    this.livrableSvc.validateLivrables(this.affaire.id, entries).subscribe({
      next: line => {
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId, 'edit']);
        } else {
          this.validatingLivrables.set(false);
          this.loadLivrables();
        }
      },
      error: err => {
        this.validatingLivrables.set(false);
        this.livrableError.set(err?.error?.detail ?? this.translate.instant('AFFAIRES.WIP.LIVRABLE_ERROR'));
      },
    });
  }
}
