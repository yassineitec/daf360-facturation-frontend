import { Component, OnInit, inject, signal, computed, input } from '@angular/core';
import { Router, ActivatedRoute, RouterLink }   from '@angular/router';
import { Observable, forkJoin }                 from 'rxjs';

import { AffaireWizardService }          from '../affaire-wizard.service';
import { AffaireDraftState, WIZARD_STEPS_LABELS, mapDraftToState } from '../affaire-wizard.model';
import { AffaireService }           from '../affaire.service';
import { UserStore }                from '../../../core/user.store';
import { AffaireDetail }            from '../affaire.model';
import { WizardStepperComponent }        from '../../../shared/wizard-stepper.component';
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
    RouterLink,
    WizardStepperComponent,
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

  // Relative path back to the affaires list:
  // new  → mounted at affaires/new  → '..' = affaires/
  // edit → mounted at affaires/:id/edit → '../..' = affaires/
  readonly cancelRoute = computed(() => this.editMode() ? ['../..'] : ['..']);

  // Edit mode
  readonly id       = input<string>();   // bound from route :id via withComponentInputBinding()
  readonly editMode = signal(false);

  readonly WIZARD_STEPS       = WIZARD_STEPS_LABELS;
  readonly WIZARD_STEPS_SHORT = ['Origine', 'Infos', 'Facturation', 'Budget', 'Planning', 'Récap'];
  readonly totalSteps         = computed(() => this.WIZARD_STEPS.length);

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

  /** Returns a user-facing message listing missing fields for the current step, or null when valid. */
  readonly stepValidationError = computed((): string | null => {
    const d = this.draft();
    switch (this.currentStep()) {
      case 2: {
        const missing: string[] = [];
        if (!d.clientId)                                        missing.push('client');
        else if (!d.clientKycDone)                              missing.push('validation KYC du client requise');
        if (!d.intitule?.trim())                                missing.push('intitulé de l\'affaire');
        if (!d.billingMode)                                     missing.push('mode de facturation');
        if (!d.budgetPrevisionnel || d.budgetPrevisionnel <= 0) missing.push('budget prévisionnel (> 0)');
        if (!d.contractCurrency?.trim())                        missing.push('devise du contrat');
        return missing.length ? `Champs requis : ${missing.join(' · ')}.` : null;
      }
      case 3: {
        if (this.editMode() && d.billingModeLocked) return null;
        if (!d.billingMode) return 'Sélectionnez un mode de facturation à l\'étape précédente.';
        const budget = d.budgetPrevisionnel ?? 0;
        switch (d.billingMode) {
          case 'AV':  return 'Répartition requise (total = 100 %) avec au moins un type sélectionné.';
          case 'JAL': return `Jalons requis avec labels et total = ${budget.toLocaleString('fr-FR')} ${d.contractCurrency}.`;
          case 'TM':  return 'Au moins une ressource avec tarif > 0 requise.';
          case 'CP':  return 'Sélectionnez au moins une catégorie de coût et définissez un taux de marge.';
          case 'RMB': return 'Sélectionnez au moins une catégorie de dépenses.';
          default:    return null;
        }
      }
      case 4: {
        const d4 = this.draft();
        if (!d4.responsables.length) return 'Ajoutez au moins un responsable.';
        if (!d4.responsables.some(r => r.isPrimary)) return 'Désignez un responsable principal.';
        if (!d4.responsables.every(r => r.userId > 0 && (r.budgetAllocation ?? 0) > 0))
          return 'Chaque responsable doit avoir un utilisateur et une allocation > 0.';
        const total = d4.responsables.reduce((s, r) => s + (r.budgetAllocation ?? 0), 0);
        const budget = d4.budgetPrevisionnel ?? 0;
        return Math.abs(total - budget) >= 0.001
          ? `Total des allocations (${total.toLocaleString('fr-FR')}) doit égaler le budget (${budget.toLocaleString('fr-FR')}).`
          : null;
      }
      case 5:
        return d.dateDebutFacturation ? null : 'Date de début de facturation requise.';
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
          default:
            return false;
        }
      }

      case 4: {
        if (d.responsables.length === 0) return false;
        if (!d.responsables.some(r => r.isPrimary)) return false;
        if (!d.responsables.every(r => r.userId > 0 && (r.budgetAllocation ?? 0) > 0)) return false;
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
      this.serverError.set(this.stepValidationError() ?? 'Veuillez compléter tous les champs obligatoires avant de continuer.');
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
        this.draftId.set(id);
        this.currentStep.set(2);
        this.isSaving.set(false);
      },
      error: () => {
        this.serverError.set('Impossible de charger l\'affaire. Réessayez.');
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
          this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur lors de la mise à jour.');
        },
      });
      return;
    }
    if (this.draftId()) { this.currentStep.set(3); return; }
    this.isSaving.set(true);
    const d = this.draft();
    this.wizardService.createDraft({
      refId:                 this.userStore.user()?.id,
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
    if (this.editMode()) {
      // Billing mode is locked in edit mode — no API call, just advance
      this.currentStep.set(4);
      return;
    }
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
        userId:           r.userId,
        isPrimary:        r.isPrimary,
        role:             r.role ?? null,
        budgetAllocation: r.budgetAllocation ?? 0,
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
    if (this.editMode()) {
      // edit → affaires/:id/edit → '../..' → affaires/ → then detail id
      this.router.navigate(['../..', this.draftId()], { relativeTo: this.activatedRoute });
      return;
    }
    this.isSaving.set(true);
    this.wizardService.validateAndActivate(this.draftId()!).subscribe({
      next: affaire => {
        // new → affaires/new → '..' → affaires/ → then detail id
        this.router.navigate(['..', affaire['id']], { relativeTo: this.activatedRoute });
      },
      error: err => {
        this.isSaving.set(false);
        this.serverError.set((err?.error as { message?: string })?.message ?? 'Erreur d\'activation.');
      },
    });
  }

  onDraftChange(updated: AffaireDraftState): void {
    this.draft.set(updated);
    this.serverError.set(null); // clear API error when user edits — forces re-validation before retry
  }
}
