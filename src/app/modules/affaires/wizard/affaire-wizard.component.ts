import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink }                   from '@angular/router';
import { Observable }                           from 'rxjs';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { AffaireWizardService }          from '../affaire-wizard.service';
import { AffaireDraftState, WIZARD_STEPS_LABELS } from '../affaire-wizard.model';
import { WizardStepDoc360Component }     from './steps/wizard-step-doc360.component';
import { WizardStepInfoComponent }       from './steps/wizard-step-info.component';
import { WizardStepBillingComponent }    from './steps/wizard-step-billing.component';
import { WizardStepResponsablesComponent } from './steps/wizard-step-responsables.component';
import { WizardStepPlanningComponent }   from './steps/wizard-step-planning.component';
import { WizardStepRecapComponent }      from './steps/wizard-step-recap.component';

@Component({
  selector: 'app-affaire-wizard',
  standalone: true,
  imports: [
    RouterLink, ButtonComponent,
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
export class AffaireWizardComponent {

  private readonly wizardService = inject(AffaireWizardService);
  private readonly router        = inject(Router);

  readonly WIZARD_STEPS = WIZARD_STEPS_LABELS;
  readonly totalSteps   = computed(() => this.WIZARD_STEPS.length); // always 6

  currentStep = signal(1);
  draftId     = signal<number | null>(null);
  isSaving    = signal(false);
  serverError = signal<string | null>(null);

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
          default:
            return false;
        }
      }

      case 4:
        return d.responsables.length > 0 && d.responsables.some(r => r.isPrimary);

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
      this.serverError.set('Veuillez compléter tous les champs obligatoires avant de continuer.');
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
    if (this.currentStep() > 1) this.currentStep.update(s => s - 1);
  }

  // ── Step 2 — create draft ──────────────────────────────────────────────

  private saveStep2(): void {
    if (this.draftId()) { this.currentStep.set(3); return; }
    this.isSaving.set(true);
    const d = this.draft();
    this.wizardService.createDraft({
      clientId:              d.clientId,
      intitule:              d.intitule.trim(),
      reference:             d.reference?.trim()    || null,
      notes:                 d.notes?.trim()        || null,
      doc360Ref:             d.doc360Ref?.trim()    || null,
      doc360ServerReference: d.doc360ServerReference || null,
      erpReference:          d.doc360ErpReference?.trim() || null,
      billingMode:           d.billingMode          || null,
      budgetPrevisionnel:    d.budgetPrevisionnel   ?? null,
      contractCurrency:      d.contractCurrency     || 'EUR',
      billingPeriod:         d.billingPeriod        || 'MONTHLY',
    }).subscribe({
      next: result => {
        this.draftId.set(result['id'] as number);
        this.draft.update(prev => ({
          ...prev,
          paysId:             result['paysId']             as number  ?? 0,
          contractAmount:     result['contractAmount']     as number  ?? undefined,
          budgetPrevisionnel: result['budgetPrevisionnel'] as number  ?? prev.budgetPrevisionnel,
        }));
        this.isSaving.set(false);
        this.currentStep.set(3);
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur lors de la création.');
      },
    });
  }

  // ── Step 3 — configure billing ────────────────────────────────────────

  private saveStep3(): void {
    const id   = this.draftId()!;
    const d    = this.draft();
    const mode = d.billingMode!;
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
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur de configuration.');
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
        userId: r.userId, isPrimary: r.isPrimary, role: r.role ?? null,
      })),
      budgetPrevisionnel: d.budgetPrevisionnel ?? null,
      activiteId:         d.activiteId ?? null,
      disciplineId:       d.disciplineId ?? null,
      disciplineLabel:    d.disciplineLabel ?? null,
      disciplineServerRef: d.disciplineServerRef ?? null,
    }).subscribe({
      next: () => { this.isSaving.set(false); this.currentStep.set(5); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur de configuration.');
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
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur de configuration.');
      },
    });
  }

  // ── Step 6 — activate ─────────────────────────────────────────────────

  private activateAffaire(): void {
    this.isSaving.set(true);
    this.wizardService.validateAndActivate(this.draftId()!).subscribe({
      next: affaire => { this.router.navigate(['/fact/affaires', affaire['id']]); },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur d\'activation.');
      },
    });
  }

  onDraftChange(updated: AffaireDraftState): void {
    this.draft.set(updated);
  }
}
