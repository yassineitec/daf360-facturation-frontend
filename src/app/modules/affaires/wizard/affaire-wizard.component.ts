import { Component, OnInit, effect, inject, signal, computed, input } from '@angular/core';
import { Router, ActivatedRoute, RouterLink }   from '@angular/router';
import { Observable, forkJoin }                 from 'rxjs';
import { TranslatePipe, TranslateService }       from '@ngx-translate/core';
import {
  StepperStep, StepperConfig, StepperComponent,
  CardComponent, PageComponent, PageHeaderComponent,
} from '@khalilrebhiitec/daf360';
import type { BreadcrumbItem, PageHeaderBadge } from '@khalilrebhiitec/daf360';

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

/** Modes ayant encore un endpoint `PATCH /config/{mode}` à l'étape 3. */
const CONFIGURABLE_MODES = new Set<string>(['AV', 'TM', 'CP', 'RMB']);

@Component({
  selector: 'app-affaire-wizard',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    PageComponent,
    PageHeaderComponent,
    StepperComponent,
    CardComponent,
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

  constructor() {
    effect(() => {
      const step = this.currentStep();
      if (step > this.maxStepReached()) this.maxStepReached.set(step);
    });
  }

  // Relative path back to the affaires list:
  // new  → mounted at affaires/new  → '..' = affaires/
  // edit → mounted at affaires/:id/edit → '../..' = affaires/
  readonly cancelRoute = computed(() => this.editMode() ? ['../..'] : ['..']);

  // Edit mode
  readonly id       = input<string>();   // bound from route :id via withComponentInputBinding()
  readonly editMode = signal(false);

  /**
   * Les six étapes, dans l'ordre des numéros portés par `currentStep` (1-based).
   * `firstStep()` dit laquelle est la première ATTEIGNABLE : en édition l'origine
   * DOC360 n'a plus de sens, l'assistant démarre donc à « Infos générales ».
   */
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

  /** Numéro (1-based) de la première étape atteignable. */
  readonly firstStep = computed(() => this.editMode() ? 2 : 1);

  /**
   * Ce que la barre affiche : les étapes réellement atteignables. En édition, l'étape
   * 1 est retirée du rail plutôt que grisée — un rail qui montre une étape à laquelle
   * on ne peut pas aller n'aide personne.
   */
  readonly stepperSteps = computed<StepperStep[]>(() =>
    this.wizardSteps().slice(this.firstStep() - 1).map((s, i) => ({
      ...s,
      // Une étape déjà franchie est marquée terminée ET reste atteignable ; celles qu'on
      // n'a pas encore vues sont désactivées, ce qui bloque le saut en avant au niveau du
      // rail lui-même plutôt que dans `onStepClick` (un bouton cliquable qui ne fait rien
      // reste focusable et annoncé comme actionnable).
      completed: i + this.firstStep() < this.maxStepReached(),
      disabled:  i + this.firstStep() > this.maxStepReached(),
    })));

  /** Le rail est 0-based et peut être tronqué en tête : d'où le décalage. */
  readonly stepperIndex = computed(() => this.currentStep() - this.firstStep());

  readonly stepperConfig = computed((): StepperConfig => {
    this.translate.currentLang();
    return {
      nextLabel:   this.translate.instant('AFFAIRES.wizard.shell.next'),
      prevLabel:   this.translate.instant('AFFAIRES.wizard.shell.prev'),
      cancelLabel: this.translate.instant('AFFAIRES.wizard.shell.cancel'),
      finishLabel: (this.editMode() && !this.resumeDraft()) ? this.translate.instant('AFFAIRES.wizard.shell.save') : this.translate.instant('AFFAIRES.wizard.shell.activate'),
      showCancel:  true,
      // Le rail est une bande de progression : la navigation reste dans la barre.
      chrome: 'header-only',
      // Rail dense : le nom de l'étape est déjà imprimé en titre dans la carte juste
      // au-dessus, en capitales gras il lui faisait concurrence au lieu de l'accompagner.
      labelDensity: 'quiet',
      // Navigation libre sur tout ce qui a DÉJÀ été franchi (`maxStepReached`) : chaque
      // « Suivant » a enregistré son étape, revenir dessus puis repartir en avant ne perd
      // rien. Seules les étapes jamais atteintes restent verrouillées — sauter dessus
      // laisserait le brouillon incomplet.
      clickableSteps: true,
      stepperLabel: this.translate.instant('AFFAIRES.wizard.shell.progression'),
    };
  });

  /** `index` est relatif au rail tronqué — on le ramène en numéro d'étape. */
  onStepClick(index: number): void {
    const target = index + this.firstStep();
    if (target !== this.currentStep() && target <= this.maxStepReached()) {
      this.serverError.set(null);
      this.currentStep.set(target);
    }
  }

  // ── En-tête de page ────────────────────────────────────────────────────

  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.editMode()
      ? 'AFFAIRES.wizard.shell.title_edit'
      : 'AFFAIRES.wizard.shell.title_new');
  });

  /** Le sous-titre porte la référence dès qu'elle existe : c'est ce qu'on cherche des yeux. */
  readonly pageSubtitle = computed(() => {
    this.translate.currentLang();
    const d = this.draft();
    return [d.reference, d.intitule].filter(Boolean).join(' · ')
      || this.translate.instant('AFFAIRES.wizard.shell.subtitle_new');
  });

  /**
   * Le résumé de l'affaire en cours de saisie, en pastilles sur le titre — ce qui a
   * remplacé la carte « Résumé » de la colonne de droite (et donc la colonne elle-même,
   * le formulaire prenant toute la largeur).
   *
   * Une valeur non encore saisie ne produit PAS de pastille vide : une pastille
   * « Client — » n'apprend rien et occupe la ligne. La rangée se remplit donc au fil des
   * étapes, ce qui est aussi ce qui la rend lisible d'un coup d'œil.
   *
   * Le mode et le budget sont teintés (ils portent l'engagement financier), le reste
   * reste neutre pour que la rangée ne devienne pas un arc-en-ciel.
   */
  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    this.translate.currentLang();
    const d = this.draft();
    const badges: PageHeaderBadge[] = [];

    if (d.paysLabel)   badges.push({ label: d.paysLabel,   icon: 'public',      variant: 'neutral' });
    if (d.clientName)  badges.push({ label: d.clientName,  icon: 'business',    variant: 'neutral' });
    if (d.billingMode) badges.push({ label: this.billingModeLabel(), icon: 'receipt_long', variant: 'teal' });
    if (d.budgetPrevisionnel) {
      badges.push({ label: this.formatBudget(), icon: 'payments', variant: 'secondary' });
    }
    return badges;
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('AFFAIRES.wizard.shell.breadcrumb_affaires'), link: this.cancelRoute() },
      { label: this.pageTitle() },
    ];
  });

  /**
   * Squelette pleine page réservé au chargement initial d'un brouillon existant (§5).
   * Signal explicite, et non `draftId() === null` : sur échec de chargement il n'y a
   * jamais d'id, et la page resterait en squelette au lieu d'afficher l'erreur.
   */
  readonly isLoading = signal(false);

  currentStep = signal(1);

  /**
   * Étape la plus avancée jamais atteinte. C'est elle, et non `currentStep`, qui dit ce
   * qui est cliquable dans le rail : une fois l'étape 4 franchie, revenir à l'étape 2 ne
   * doit pas re-verrouiller 3 et 4. Un `effect` la relève à chaque changement d'étape,
   * plutôt qu'un `goToStep()` qu'il faudrait penser à appeler dans les huit endroits qui
   * font `currentStep.set(...)`.
   */
  readonly maxStepReached = signal(1);

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
        if (!d.paysId)                                          missing.push(this.translate.instant('AFFAIRES.wizard.shell.val.pays'));
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
        switch (d.billingMode) {
          case 'AV':       return this.translate.instant('AFFAIRES.wizard.shell.val.av');
          case 'TM':       return this.translate.instant('AFFAIRES.wizard.shell.val.tm');
          case 'CP':       return this.translate.instant('AFFAIRES.wizard.shell.val.cp');
          // Plus proposé à la création — une affaire RMB existante reste configurable.
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
        return (d.dateDebutFacturation && (d.dureeMois ?? 0) > 0)
          ? null
          : this.translate.instant('AFFAIRES.wizard.shell.val.planning');
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
          d.paysId && d.clientId && d.clientKycDone && d.intitule?.trim() &&
          d.billingMode && d.budgetPrevisionnel && d.budgetPrevisionnel > 0 &&
          d.contractCurrency?.trim()
        );

      case 3: {
        if (this.editMode() && d.billingModeLocked) return true;
        if (!d.billingMode) return false;
        switch (d.billingMode) {
          case 'AV':
            return d.repartitionTotal === 100 && d.repartitions.length > 0
                   && d.repartitions.every(r => r.repartitionTypeId > 0);
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
        return !!d.dateDebutFacturation && (d.dureeMois ?? 0) > 0;

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
    if (this.currentStep() > this.firstStep()) this.currentStep.update(s => s - 1);
  }

  ngOnInit(): void {
    const rawId = this.id();
    if (rawId) {
      this.editMode.set(true);
      this.loadExistingDraft(Number(rawId));
      return;
    }
    // Création : le pays du créateur est le cas de très loin le plus fréquent, donc il
    // est proposé d'emblée — l'étape reste modifiable tant que l'affaire n'existe pas.
    const paysId = this.userStore.user()?.paysId;
    if (paysId) this.draft.update(d => ({ ...d, paysId }));
  }

  private loadExistingDraft(id: number): void {
    this.isSaving.set(true);
    this.isLoading.set(true);
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
        // Une affaire déjà active a franchi toutes les étapes : le rail est entièrement
        // ouvert, on vient éditer une section précise et non re-dérouler l'assistant. Un
        // brouillon repris, lui, garde la progression pas à pas.
        if (detail.statut !== 'DRAFT') this.maxStepReached.set(this.wizardSteps().length);
        this.isSaving.set(false);
        this.isLoading.set(false);
      },
      error: () => {
        this.serverError.set(this.translate.instant('AFFAIRES.wizard.shell.err.load'));
        this.isSaving.set(false);
        this.isLoading.set(false);
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
      paysId:                d.paysId || null,
      clientId:              d.clientId,
      intitule:              d.intitule.trim(),
      reference:             d.reference?.trim()    || null,
      notes:                 d.notes?.trim()        || null,
      doc360Ref:             d.doc360Ref?.trim()    || null,
      doc360ServerReference: d.doc360ServerReference || null,
      erpReference:          d.doc360ErpReference?.trim() || null,
      // LIVRABLE part enfin sous son propre code : le backend le refusait (regex du
      // DTO limitée à AV|JAL|TM|CP|RMB), d'où l'ancien détour par JAL.
      billingMode:           d.billingMode || null,
      budgetPrevisionnel:    d.budgetPrevisionnel   ?? null,
      contractCurrency:      d.contractCurrency     || 'EUR',
      billingPeriod:         d.billingPeriod        || 'MONTHLY',
    }).subscribe({
      next: result => {
        this.draftId.set(result['id'] as number);
        this.draft.update(prev => ({
          ...prev,
          id:                 result['id']                 as number,
          // Le serveur a le dernier mot sur le pays : si le champ est resté vide il
          // le déduit du créateur, et l'étape doit refléter ce qui a été enregistré.
          paysId:             result['paysId']             as number  ?? prev.paysId,
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

    // LIVRABLE: livrables already saved directly by the component — just advance.
    // Idem pour un mode qui n'a plus d'endpoint de configuration (brouillon 'JAL'
    // d'avant le passage à LIVRABLE) : rien à enregistrer, on laisse l'utilisateur
    // finir son brouillon plutôt que de le bloquer sur une étape sans issue.
    if (mode === 'LIVRABLE' || !CONFIGURABLE_MODES.has(mode)) {
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
      dureeMois:             d.dureeMois ?? null,
      // Dérivée de (début + durée) côté formulaire, mais transmise quand même : le
      // serveur la recalcule et la stocke, le client n'est pas la source de vérité.
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

  /**
   * Le nom du mode dans le résumé. Une seule clé par code (`…shell.mode.AV`), donc
   * un mode ajouté demain n'a plus à être branché ici — et un mode hérité qui n'est
   * plus proposé (RMB, ou un vieux JAL) garde quand même un libellé lisible.
   */
  billingModeLabel(): string {
    const mode = this.draft().billingMode;
    if (!mode) return this.translate.instant('AFFAIRES.wizard.shell.mode.none');
    const key   = `AFFAIRES.wizard.shell.mode.${mode}`;
    const label = this.translate.instant(key);
    return label === key ? mode : label;
  }

  formatBudget(): string {
    const d = this.draft();
    if (!d.budgetPrevisionnel) return this.translate.instant('AFFAIRES.wizard.shell.dash');
    return d.budgetPrevisionnel.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      + ' ' + (d.contractCurrency ?? 'EUR');
  }
}
