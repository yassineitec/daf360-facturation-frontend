import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink }                   from '@angular/router';
import { NgClass }                              from '@angular/common';
import { Observable }                           from 'rxjs';

import { AffaireWizardService }    from '../affaire-wizard.service';
import { AffaireDraftState, BILLING_MODES } from '../affaire-wizard.model';
import { WizardStepInfoComponent }  from './steps/wizard-step-info.component';
import { WizardStepAvComponent }    from './steps/wizard-step-av.component';
import { WizardStepJalComponent }   from './steps/wizard-step-jal.component';
import { WizardStepTmComponent }    from './steps/wizard-step-tm.component';
import { WizardStepCpComponent }    from './steps/wizard-step-cp.component';
import { WizardStepRmbComponent }   from './steps/wizard-step-rmb.component';
import { WizardStepRecapComponent } from './steps/wizard-step-recap.component';

@Component({
  selector: 'app-affaire-wizard',
  standalone: true,
  imports: [
    RouterLink, NgClass,
    WizardStepInfoComponent, WizardStepAvComponent,
    WizardStepJalComponent, WizardStepTmComponent,
    WizardStepCpComponent, WizardStepRmbComponent,
    WizardStepRecapComponent,
  ],
  templateUrl: './affaire-wizard.component.html',
  styleUrl: './affaire-wizard.component.scss',
})
export class AffaireWizardComponent {

  private readonly wizardService = inject(AffaireWizardService);
  private readonly router        = inject(Router);

  currentStep = signal(1);
  draftId     = signal<number | null>(null);
  isSaving    = signal(false);
  serverError = signal<string | null>(null);

  draft = signal<AffaireDraftState>({
    paysId: 0,
    intitule: '',
    contractCurrency: 'EUR',
    billingPeriod: 'MONTHLY',
    responsableUserIds: [],
    responsableNames: [],
    repartitions: [],
    repartitionTotal: 0,
    jalons: [],
    jalonTotal: 0,
    ressources: [],
    eligibleCostCategoryIds: [],
    eligibleExpenseCategoryIds: [],
  });

  currentSteps = computed(() => {
    const mode = this.draft().billingMode;
    return BILLING_MODES.find(m => m.code === mode)?.steps ?? ['Informations', 'Récapitulatif'];
  });

  totalSteps = computed(() => this.currentSteps().length);

  canGoNext = computed(() => {
    if (this.isSaving()) return false;
    const d = this.draft();
    if (this.currentStep() === 1) {
      const modeNeedsContract = BILLING_MODES.find(m => m.code === d.billingMode)?.requiresContractAmount ?? false;
      return !!(Number(d.paysId) && d.clientId && d.clientKycDone
                && d.intitule?.trim() && d.billingMode
                && (!modeNeedsContract || (d.contractAmount && d.contractAmount > 0)));
    }
    if (this.currentStep() === 2) {
      switch (d.billingMode) {
        case 'AV':
          return d.repartitionTotal === 100 && d.repartitions.length > 0 &&
                 d.repartitions.every(r => r.repartitionTypeId > 0);
        case 'JAL': {
          const balanced = d.contractAmount != null &&
                           Math.abs(d.jalonTotal - d.contractAmount) < 0.001;
          return d.jalons.length > 0 && d.jalons.every(j => j.label.trim()) && balanced;
        }
        case 'TM':
          return d.ressources.length > 0 &&
                 d.ressources.every(r => r.userId > 0 && r.rateAmount > 0);
        case 'CP':
          return d.eligibleCostCategoryIds.length > 0 && d.marginRatePct != null;
        case 'RMB':
          return d.eligibleExpenseCategoryIds.length > 0;
        default:
          return false;
      }
    }
    return true; // step 3 always ok
  });

  goNext(): void {
    this.serverError.set(null);
    if (!this.canGoNext()) {
      this.serverError.set('Veuillez compléter tous les champs obligatoires avant de continuer.');
      return;
    }
    if (this.currentStep() === 1) {
      this.saveStep1();
    } else if (this.currentStep() < this.totalSteps()) {
      this.saveStep2();
    } else {
      this.activateAffaire();
    }
  }

  goPrev(): void {
    if (this.currentStep() > 1) this.currentStep.update(s => s - 1);
  }

  private saveStep1(): void {
    if (this.draftId()) {
      // Already created — just advance
      this.currentStep.set(2);
      return;
    }
    this.isSaving.set(true);
    const d = this.draft();
    this.wizardService.createDraft({
      paysId:              Number(d.paysId),
      clientId:            d.clientId,
      intitule:            d.intitule.trim(),
      reference:           d.reference?.trim() || null,
      responsableUserIds:  d.responsableUserIds.length ? d.responsableUserIds : null,
      dateDebut:           d.dateDebut || null,
      dateFin:             d.dateFin   || null,
      contractAmount:      d.contractAmount  ?? null,
      contractCurrency:    d.contractCurrency,
      billingMode:         d.billingMode,
      billingPeriod:       d.billingPeriod,
      notes:               d.notes?.trim()    || null,
      doc360Ref:           d.doc360Ref?.trim() || null,
    }).subscribe({
      next: result => {
        this.draftId.set(result['id'] as number);
        this.isSaving.set(false);
        this.currentStep.set(2);
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur lors de la création.');
      },
    });
  }

  private saveStep2(): void {
    const id   = this.draftId()!;
    const d    = this.draft();
    const mode = d.billingMode!;
    this.isSaving.set(true);

    const save$: Observable<unknown> = (() => {
      switch (mode) {
        case 'AV':
          return this.wizardService.configureAV(id, {
            repartitions: d.repartitions.map(r => ({
              repartitionTypeId: r.repartitionTypeId,
              percentage: r.percentage,
            })),
          });
        case 'JAL':
          return this.wizardService.configureJAL(id, { jalons: d.jalons });
        case 'TM':
          return this.wizardService.configureTM(id, {
            ressources: d.ressources.map(r => ({
              userId: r.userId,
              resourceType: r.resourceType,
              rateType: r.rateType,
              rateAmount: r.rateAmount,
              rateCurrency: r.rateCurrency,
              costAmount: r.costAmount ?? null,
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
      next: () => {
        this.isSaving.set(false);
        this.currentStep.set(this.totalSteps());
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur de configuration.');
      },
    });
  }

  private activateAffaire(): void {
    this.isSaving.set(true);
    this.wizardService.validateAndActivate(this.draftId()!).subscribe({
      next: affaire => {
        this.router.navigate(['/fact/affaires', affaire['id']]);
      },
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
