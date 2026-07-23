import { Component, OnInit, inject, signal, computed, input } from '@angular/core';
import { Router, ActivatedRoute, RouterLink }   from '@angular/router';
import { Observable, forkJoin, of }             from 'rxjs';
import { TranslatePipe, TranslateService }       from '@ngx-translate/core';
import { StepperStep, StepperConfig, CardComponent, ButtonComponent } from '@khalilrebhiitec/daf360';

import { AffaireWizardService }          from '../affaire-wizard.service';
import { AffaireDraftState, mapDraftToState } from '../affaire-wizard.model';
import { AffaireService }           from '../affaire.service';
import { UserStore }                from '../../../core/user.store';
import { AffaireDetail }            from '../affaire.model';
import { WizardStepDoc360Component }     from './steps/wizard-step-doc360.component';
import { WizardStepInfoComponent }       from './steps/wizard-step-info.component';
import { WizardStepBillingComponent }    from './steps/wizard-step-billing.component';
import { WizardStepResponsablesComponent } from './steps/wizard-step-responsables.component';
import { WizardStepPlanningComponent }   from './steps/wizard-step-planning.component';
import { WizardStepRecapComponent }      from './steps/wizard-step-recap.component';

const STEP_ICONS = ['description', 'business_center', 'receipt_long', 'group', 'calendar_month', 'fact_check'];

@Component({
  selector: 'app-affaire-wizard',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    CardComponent,
    ButtonComponent,
    WizardStepDoc360Component,
    WizardStepInfoComponent,
    WizardStepBillingComponent,
    WizardStepResponsablesComponent,
    WizardStepPlanningComponent,
    WizardStepRecapComponent,
  ],
  templateUrl: './affaire-wizard.component.html',
  styleUrl: './affaire-wizard.component.scss',
})
export class AffaireWizardComponent implements OnInit {

  private readonly wizardService  = inject(AffaireWizardService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly affaireSvc     = inject(AffaireService);
  private readonly userStore      = inject(UserStore);
  private readonly translate      = inject(TranslateService);

  // Relative path back to the affaires list:
  // new  → mounted at affaires/new  → '..' = affaires/
  // edit → mounted at affaires/:id/edit → '../..' = affaires/
  readonly cancelRoute = computed(() => this.editMode() ? ['../..'] : ['..']);

  // Edit mode
  readonly id       = input<string>();   // bound from route :id via withComponentInputBinding()
  readonly editMode = signal(false);

  readonly wizardSteps = computed<StepperStep[]>(() => {
    this.translate.currentLang();
    return [
      { title: this.translate.instant('AFFAIRES.wizard.shell.step.origine') },
      { title: this.translate.instant('AFFAIRES.wizard.shell.step.infos') },
      { title: this.translate.instant('AFFAIRES.wizard.shell.step.facturation') },
      { title: this.translate.instant('AFFAIRES.wizard.shell.step.responsables') },
      { title: this.translate.instant('AFFAIRES.wizard.shell.step.planning') },
      { title: this.translate.instant('AFFAIRES.wizard.shell.step.recap') },
    ];
  });

  readonly stepperConfig = computed((): StepperConfig => {
    this.translate.currentLang();
    return {
      nextLabel:   this.translate.instant('AFFAIRES.wizard.shell.next'),
      prevLabel:   this.translate.instant('AFFAIRES.wizard.shell.prev'),
      cancelLabel: this.translate.instant('AFFAIRES.wizard.shell.cancel'),
      finishLabel: (this.editMode() && !this.resumeDraft()) ? this.translate.instant('AFFAIRES.wizard.shell.save') : this.translate.instant('AFFAIRES.wizard.shell.activate'),
      showCancel:  true,
    };
  });

  currentStep = signal(1);
  draftId     = signal<number | null>(null);
  isSaving    = signal(false);
  serverError = signal<string | null>(null);
  // True when editing an affaire still in DRAFT status → finishing activates it,
  // unlike editing an already-active affaire (which only saves).
  resumeDraft = signal(false);

  draft = signal<AffaireDraftState>({
    paysId: 0,
    intitule: '',
    contractCurrency: 'EUR',
    billingPeriod: 'MONTHLY',
    responsables: [],
    repartitions: [],
    repartitionTotal: 0,
    jalons: [],
    jalonTotal: 0,
    ressources: [],
    eligibleCostCategoryIds: [],
    eligibleExpenseCategoryIds: [],
  });

  /** Returns a user-facing message listing missing fields for the current step, or null when valid. */
  readonly stepValidationError = computed((): string | null => {
    this.translate.currentLang();
    const d = this.draft();
    switch (this.currentStep()) {
      case 2: {
        const missing: string[] = [];
        if (!d.clientId)                                        missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.client'));
        else if (!d.clientKycDone)                              missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.kyc'));
        if (!d.intitule?.trim())                                missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.intitule'));
        if (!d.billingMode)                                     missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.billing_mode'));
        if (!d.budgetPrevisionnel || d.budgetPrevisionnel <= 0) missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.budget'));
        if (!d.contractCurrency?.trim())                        missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.currency'));
        return missing.length ? this.translate.instant('AFFAIRES.wizard.shell.val.required_fields', { fields: missing.join(' · ') }) : null;
      }
      case 3: {
        if (this.editMode() && d.billingModeLocked) return null;
        if (!d.billingMode) return this.translate.instant('AFFAIRES.wizard.shell.val.select_mode_prev');
        const budget = d.budgetPrevisionnel ?? 0;
        switch (d.billingMode) {
          case 'AV':  return this.translate.instant('AFFAIRES.wizard.shell.val.av');
          case 'JAL':      return this.translate.instant('AFFAIRES.wizard.shell.val.jal', { budget: budget.toLocaleString('fr-FR'), currency: d.contractCurrency });
          case 'TM':       return this.translate.instant('AFFAIRES.wizard.shell.val.tm');
          case 'CP':       return this.translate.instant('AFFAIRES.wizard.shell.val.cp');
          case 'RMB':      return this.translate.instant('AFFAIRES.wizard.shell.val.rmb');
          case 'LIVRABLE': return this.translate.instant('AFFAIRES.wizard.shell.val.livrable');
          default:         return null;
        }
      }
      case 4: {
        const d4 = this.draft();
        if (!d4.responsables.length) return this.translate.instant('AFFAIRES.wizard.shell.val.resp_add');
        if (!d4.responsables.some(r => r.isPrimary)) return this.translate.instant('AFFAIRES.wizard.shell.val.resp_primary');
        if (!d4.responsables.every(r => r.userId > 0 && (r.budgetAllocation ?? 0) > 0))
          return this.translate.instant('AFFAIRES.wizard.shell.val.resp_alloc');
        const total = d4.responsables.reduce((s, r) => s + (r.budgetAllocation ?? 0), 0);
        const budget = d4.budgetPrevisionnel ?? 0;
        return Math.abs(total - budget) >= 0.001
          ? this.translate.instant('AFFAIRES.wizard.shell.val.resp_total', { total: total.toLocaleString('fr-FR'), budget: budget.toLocaleString('fr-FR') })
          : null;
      }
      case 5:
        return d.dateDebutFacturation ? null : this.translate.instant('AFFAIRES.wizard.shell.val.planning');
      default:
        return null;
    }
  });

  canGoNext = computed(() => {
    if (this.isSaving()) return false;
    const d = this.draft();
    switch (this.currentStep()) {
      case 1:
        return true; // DOC360 step is optional

      case 2:
        return !!(
          d.clientId && d.clientKycDone && d.intitule?.trim() &&
          d.billingMode && d.budgetPrevisionnel && d.budgetPrevisionnel > 0 &&
          d.contractCurrency?.trim()
        );

      case 3: {
        if (this.editMode() && d.billingModeLocked) return true;
        if (!d.billingMode) return false;
        const budget = d.budgetPrevisionnel ?? 0;
        switch (d.billingMode) {
          case 'AV':
            return d.repartitionTotal === 100 && d.repartitions.length > 0
                   && d.repartitions.every(r => r.repartitionTypeId > 0);
          case 'JAL': {
            const balanced = budget > 0 && Math.abs(d.jalonTotal - budget) < 0.001;
            return d.jalons.length > 0 && d.jalons.every(j => j.label.trim()) && balanced;
          }
          case 'TM':
            return d.ressources.length > 0 && d.ressources.every(r => r.userId > 0 && r.rateAmount > 0);
          case 'CP':
            return d.eligibleCostCategoryIds.length > 0 && d.marginRatePct != null;
          case 'RMB':
            return d.eligibleExpenseCategoryIds.length > 0;
          case 'LIVRABLE':
            return d.livrablesSaved === true;
          default:
            return false;
        }
      }

      case 4: {
        if (d.responsables.length === 0) return false;
        if (!d.responsables.some(r => r.isPrimary)) return false;
        if (!d.responsables.every(r => r.userId > 0 && (r.budgetAllocation ?? 0) > 0)) return false;
        if (!d.responsables.every(r => r.activiteId != null)) return false;
        const pairs = d.responsables.map(r => `${r.userId}|${r.activiteId}`);
        if (new Set(pairs).size !== pairs.length) return false;
        const totalAlloc = d.responsables.reduce((s, r) => s + (r.budgetAllocation ?? 0), 0);
        const budget = d.budgetPrevisionnel ?? 0;
        return Math.abs(totalAlloc - budget) < 0.001;
      }

      case 5:
        return !!d.dateDebutFacturation;

      case 6:
        return true; // recap — activate button enabled always

      default:
        return false;
    }
  });

  goNext(): void {
    this.serverError.set(null);
    if (!this.canGoNext()) {
      this.serverError.set(this.stepValidationError() ?? this.translate.instant('AFFAIRES.wizard.shell.val.incomplete'));
      return;
    }
    switch (this.currentStep()) {
      case 1: this.currentStep.set(2); break;
      case 2: this.saveStep2(); break;
      case 3: this.saveStep3(); break;
      case 4: this.saveStep4(); break;
      case 5: this.saveStep5(); break;
      case 6: this.activateAffaire(); break;
    }
  }

  goPrev(): void {
    const minStep = this.editMode() ? 2 : 1;
    if (this.currentStep() > minStep) this.currentStep.update(s => s - 1);
  }

  ngOnInit(): void {
    const rawId = this.id();
    if (rawId) {
      this.editMode.set(true);
      this.loadExistingDraft(Number(rawId));
    }
  }

  private loadExistingDraft(id: number): void {
    this.isSaving.set(true);
    forkJoin({
      draft:  this.wizardService.loadDraft(id) as Observable<any>,
      detail: this.affaireSvc.getAffaire(id),
    }).subscribe({
      next: ({ draft, detail }: { draft: any; detail: AffaireDetail }) => {
        this.draft.set(
          mapDraftToState(
            draft,
            detail.clientName ?? '',
            true   // KYC already validated at affaire creation
          )
        );
        this.resumeDraft.set(detail.statut === 'DRAFT');
        this.draftId.set(id);
        this.currentStep.set(2);
        this.isSaving.set(false);
      },
      error: () => {
        this.serverError.set(this.translate.instant('AFFAIRES.wizard.shell.err.load'));
        this.isSaving.set(false);
      },
    });
  }

  // ── Step 2 — create draft ──────────────────────────────────────────────

  private saveStep2(): void {
    if (this.editMode()) {
      const d = this.draft();
      this.isSaving.set(true);
      this.wizardService.updateInfo(this.draftId()!, {
        intitule:           d.intitule.trim(),
        clientId:           d.clientId!,
        notes:              d.notes ?? null,
        doc360Ref:          d.doc360ServerReference ?? null,
        erpReference:       d.erpReference ?? null,
        contractCurrency:   d.contractCurrency,
        billingPeriod:      d.billingPeriod,
        budgetPrevisionnel: d.budgetPrevisionnel ?? null,
      }).subscribe({
        next: () => { this.isSaving.set(false); this.currentStep.set(3); },
        error: err => {
          this.isSaving.set(false);
          this.serverError.set(err?.error?.rule ?? err?.error?.detail ?? err?.error?.message ?? this.translate.instant('AFFAIRES.wizard.shell.err.update'));
        },
      });
      return;
    }
    if (this.draftId()) { this.currentStep.set(3); return; }
    this.isSaving.set(true);
    const d = this.draft();
    this.wizardService.createDraft({
      refId:                 this.userStore.user()?.userId,
      clientId:              d.clientId,
      intitule:              d.intitule.trim(),
      reference:             d.reference?.trim()    || null,
      notes:                 d.notes?.trim()        || null,
      doc360Ref:             d.doc360Ref?.trim()    || null,
      doc360ServerReference: d.doc360ServerReference || null,
      erpReference:          d.doc360ErpReference?.trim() || null,
      billingMode:           d.billingMode === 'LIVRABLE' ? 'JAL' : (d.billingMode || null),
      budgetPrevisionnel:    d.budgetPrevisionnel   ?? null,
      contractCurrency:      d.contractCurrency     || 'EUR',
      billingPeriod:         d.billingPeriod        || 'MONTHLY',
    }).subscribe({
      next: result => {
        this.draftId.set(result['id'] as number);
        this.draft.update(prev => ({
          ...prev,
          id:                 result['id']                 as number,
          paysId:             result['paysId']             as number  ?? 0,
          contractAmount:     result['contractAmount']     as number  ?? undefined,
          budgetPrevisionnel: result['budgetPrevisionnel'] as number  ?? prev.budgetPrevisionnel,
        }));
        this.isSaving.set(false);
        this.currentStep.set(3);
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(err?.error?.rule ?? err?.error?.detail ?? err?.error?.message ?? this.translate.instant('AFFAIRES.wizard.shell.err.create'));
      },
    });
  }

  // ── Step 3 — configure billing ────────────────────────────────────────

  private saveStep3(): void {
    if (this.editMode() && !this.resumeDraft()) {
      // Pure edit of an active affaire — billing mode is locked, no API call, just advance.
      this.currentStep.set(4);
      return;
    }
    // New affaire OR resuming a DRAFT → persist the mode-specific billing config
    // (required by validateAndActivate before activation).
    const id   = this.draftId()!;
    const d    = this.draft();
    const mode = d.billingMode!;

    // LIVRABLE: livrables already saved directly by the component — just advance
    if (mode === 'LIVRABLE') {
      this.currentStep.set(4);
      return;
    }

    this.isSaving.set(true);

    const save$: Observable<unknown> = (() => {
      switch (mode) {
        case 'AV':
          return this.wizardService.configureAV(id, {
            items: d.repartitions.map(r => ({
              repartitionTypeId: r.repartitionTypeId,
              percentage: r.percentage,
            })),
          });
        case 'JAL':
          return this.wizardService.configureJAL(id, { jalons: d.jalons });
        case 'TM':
          return this.wizardService.configureTM(id, {
            ressources: d.ressources.map(r => ({
              userId: r.userId, resourceType: r.resourceType,
              rateType: r.rateType, rateAmount: r.rateAmount,
              rateCurrency: r.rateCurrency, costAmount: r.costAmount ?? null,
            })),
          });
        case 'CP':
          return this.wizardService.configureCP(id, {
            eligibleCostCategoryIds: d.eligibleCostCategoryIds,
            marginRatePct: d.marginRatePct,
          });
        case 'RMB':
          return this.wizardService.configureRMB(id, {
            eligibleExpenseCategoryIds: d.eligibleExpenseCategoryIds,
          });
      }
    })();

    save$.subscribe({
      next: () => { this.isSaving.set(false); this.currentStep.set(4); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(this.apiError(err, 'AFFAIRES.wizard.shell.err.config'));
      },
    });
  }

  // ── Step 4 — configure responsables & budget ──────────────────────────

  private saveStep4(): void {
    const id = this.draftId()!;
    const d  = this.draft();
    this.isSaving.set(true);
    this.wizardService.configureResponsables(id, {
      responsables: d.responsables.map(r => ({
        userId:           r.userId,
        isPrimary:        r.isPrimary,
        role:             r.role ?? null,
        budgetAllocation: r.budgetAllocation ?? 0,
        activiteId:       r.activiteId,
        disciplineId:     r.disciplineId,
        disciplineLabel:  r.disciplineLabel ?? null,
      })),
      budgetPrevisionnel: d.budgetPrevisionnel ?? null,
    }).subscribe({
      next: () => { this.isSaving.set(false); this.currentStep.set(5); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(this.apiError(err, 'AFFAIRES.wizard.shell.err.config'));
      },
    });
  }

  // ── Step 5 — configure planning ───────────────────────────────────────

  private saveStep5(): void {
    const id = this.draftId()!;
    const d  = this.draft();
    this.isSaving.set(true);
    this.wizardService.configurePlanning(id, {
      dateDebutFacturation:  d.dateDebutFacturation,
      dateFinContractuelle:  d.dateFinContractuelle ?? null,
      datePremireEcheance:   d.datePremireEcheance  ?? null,
    }).subscribe({
      next: () => { this.isSaving.set(false); this.currentStep.set(6); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(this.apiError(err, 'AFFAIRES.wizard.shell.err.config'));
      },
    });
  }

  // ── Step 6 — activate ─────────────────────────────────────────────────

  private activateAffaire(): void {
    // Pure edit of an already-active affaire → just persist & return to detail.
    if (this.editMode() && !this.resumeDraft()) {
      // edit → affaires/:id/edit → '../..' → affaires/ → then detail id
      this.router.navigate(['../..', this.draftId()], { relativeTo: this.activatedRoute });
      return;
    }
    // New affaire OR resuming a DRAFT → validate & activate.
    this.isSaving.set(true);
    this.wizardService.validateAndActivate(this.draftId()!).subscribe({
      next: affaire => {
        // new → affaires/new → '..' ; resume → affaires/:id/edit → '../..'
        const target = this.editMode() ? ['../..', affaire['id']] : ['..', affaire['id']];
        this.router.navigate(target, { relativeTo: this.activatedRoute });
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set(this.apiError(err, 'AFFAIRES.wizard.shell.err.activate'));
      },
    });
  }

  cancelWizard(): void {
    this.router.navigate(this.cancelRoute(), { relativeTo: this.activatedRoute });
  }

  /** Reads the RFC-7807 `detail` from a facturation-service error (falls back to message). */
  private apiError(err: unknown, fallbackKey: string): string {
    const fallback = this.translate.instant(fallbackKey);
    // `rule` is the business-rule violation surfaced by the TM/livrable backend;
    // detail/message are the generic fallbacks.
    const e = err as { error?: { rule?: string; detail?: string; message?: string } };
    return e?.error?.rule ?? e?.error?.detail ?? e?.error?.message ?? fallback;
  }

  onDraftChange(updated: AffaireDraftState): void {
    this.draft.set(updated);
    this.serverError.set(null); // clear API error when user edits — forces re-validation before retry
  }

  readonly cardTitle = computed(() => { this.translate.currentLang(); return this.translate.instant('AFFAIRES.wizard.shell.card.t' + this.currentStep()); });
  readonly cardSub   = computed(() => { this.translate.currentLang(); return this.translate.instant('AFFAIRES.wizard.shell.card.s' + this.currentStep()); });
  readonly cardIcon  = computed(() => STEP_ICONS[this.currentStep() - 1]);
  readonly stepTip   = computed(() => { this.translate.currentLang(); return this.translate.instant('AFFAIRES.wizard.shell.tips.' + this.currentStep()); });

  billingModeLabel(): string {
    switch (this.draft().billingMode) {
      case 'AV':      return this.translate.instant('AFFAIRES.wizard.shell.mode.av');
      case 'JAL':     return this.translate.instant('AFFAIRES.wizard.shell.mode.jal');
      case 'TM':      return this.translate.instant('AFFAIRES.wizard.shell.mode.tm');
      case 'CP':      return this.translate.instant('AFFAIRES.wizard.shell.mode.cp');
      case 'RMB':     return this.translate.instant('AFFAIRES.wizard.shell.mode.rmb');
      case 'LIVRABLE': return this.translate.instant('AFFAIRES.wizard.shell.mode.livrable');
      default:        return this.translate.instant('AFFAIRES.wizard.shell.mode.none');
    }
  }

  formatBudget(): string {
    const d = this.draft();
    if (!d.budgetPrevisionnel) return this.translate.instant('AFFAIRES.wizard.shell.dash');
    return d.budgetPrevisionnel.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      + ' ' + (d.contractCurrency ?? 'EUR');
  }
}
