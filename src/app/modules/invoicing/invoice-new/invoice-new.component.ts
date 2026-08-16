import { Component, signal, computed, viewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  ButtonComponent, ButtonOptions, PageComponent, PageHeaderComponent, StepperComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BreadcrumbItem, PageHeaderBadge, StepperConfig, StepperStep,
} from '@khalilrebhiitec/daf360';
import { StepAffaireComponent, StepAffaireValue } from './steps/step-affaire.component';
import { StepLinesComponent,  StepLinesValue  } from './steps/step-lines.component';
import { StepConditionsComponent, StepConditionsValue } from './steps/step-conditions.component';
import { StepRecapComponent } from './steps/step-recap.component';

type Step = 1 | 2 | 3 | 4;

const STEP_KEYS  = ['AFFAIRE', 'LINES', 'CONDITIONS', 'RECAP'] as const;
const STEP_ICONS = ['folder_open', 'receipt', 'calendar_month', 'summarize'] as const;

const INVOICE_TYPE_I18N: Record<string, string> = {
  ACOMPTE:       'INVOICING.INVOICE_TYPE.ACOMPTE',
  INTERMEDIAIRE: 'INVOICING.INVOICE_TYPE.INTERMEDIAIRE',
  FINALE:        'INVOICING.INVOICE_TYPE.FINALE',
  AVOIR:         'INVOICING.INVOICE_TYPE.AVOIR',
};

@Component({
  selector: 'app-invoice-new',
  standalone: true,
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, StepperComponent, ButtonComponent,
    StepAffaireComponent, StepLinesComponent, StepConditionsComponent, StepRecapComponent,
  ],
  templateUrl: './invoice-new.component.html',
  styleUrl:    './invoice-new.component.scss',
})
export class InvoiceNewComponent {
  private readonly router    = inject(Router);
  private readonly translate = inject(TranslateService);

  step            = signal<Step>(1);
  affaireValue    = signal<StepAffaireValue    | null>(null);
  linesValue      = signal<StepLinesValue      | null>(null);
  conditionsValue = signal<StepConditionsValue | null>(null);

  summaryAffaire = signal('—');
  summaryClient  = signal('—');
  summaryType    = signal('—');
  summaryLines   = signal(0);
  summaryTotal   = signal('—');

  readonly stepAffaireRef    = viewChild(StepAffaireComponent);
  readonly stepLinesRef      = viewChild(StepLinesComponent);
  readonly stepConditionsRef = viewChild(StepConditionsComponent);
  readonly stepRecapRef      = viewChild(StepRecapComponent);

  readonly steps = computed(() => {
    this.translate.currentLang();
    return STEP_KEYS.map((k, i) => ({
      title: this.translate.instant('INVOICING.NEW.STEPS.' + k),
      icon:  STEP_ICONS[i],
    }));
  });

  readonly stepTitle = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('INVOICING.NEW.STEP_INFO.' + STEP_KEYS[this.step() - 1] + '.TITLE');
  });

  readonly stepSub = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('INVOICING.NEW.STEP_INFO.' + STEP_KEYS[this.step() - 1] + '.SUB');
  });

  // ── En-tête ─────────────────────────────────────────────────────────────

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('INVOICING.NEW.BREADCRUMB_LIST'), link: ['..'] },
      { label: this.translate.instant('INVOICING.NEW.TITLE') },
    ];
  });

  /** Le sous-titre porte l'affaire dès qu'elle est choisie — c'est le fil du dossier. */
  readonly pageSubtitle = computed(() => {
    this.translate.currentLang();
    const aff = this.summaryAffaire();
    return aff !== '—' ? aff : this.translate.instant('INVOICING.NEW.SUBTITLE');
  });

  /**
   * Le résumé de la saisie, en pastilles sur le titre — ce qui a remplacé la carte
   * « Résumé » de la colonne de droite. Une valeur non encore saisie ne produit pas de
   * pastille : la rangée se remplit au fil des étapes.
   */
  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    this.translate.currentLang();
    const badges: PageHeaderBadge[] = [];

    if (this.summaryClient() !== '—') badges.push({ label: this.summaryClient(), icon: 'business',     variant: 'neutral' });
    if (this.summaryType()   !== '—') badges.push({ label: this.summaryType(),   icon: 'receipt_long', variant: 'neutral' });
    if (this.summaryLines() > 0) {
      badges.push({
        label: this.translate.instant('INVOICING.NEW.SIDEBAR.LINES_COUNT', { count: this.summaryLines() }),
        icon: 'list', variant: 'neutral',
      });
    }
    if (this.summaryTotal() !== '—') badges.push({ label: this.summaryTotal(), icon: 'payments', variant: 'secondary' });
    return badges;
  });

  // ── Barre d'actions ─────────────────────────────────────────────────────

  readonly stepperSteps = computed<StepperStep[]>(() =>
    this.steps().map(s => ({ title: s.title })));

  readonly stepperConfig = computed<StepperConfig>(() => {
    this.translate.currentLang();
    return {
      nextLabel:   this.translate.instant('INVOICING.NEW.NEXT'),
      prevLabel:   this.translate.instant('INVOICING.NEW.BACK'),
      cancelLabel: this.translate.instant('INVOICING.NEW.CANCEL'),
      finishLabel: this.translate.instant('INVOICING.NEW.SUBMIT'),
      chrome: 'header-only',
      clickableSteps: true,
      stepperLabel: this.translate.instant('INVOICING.NEW.SIDEBAR.PROGRESS'),
    };
  });

  /**
   * Retour en arrière au clic sur le rail, jamais de saut en avant : chaque étape valide
   * et transmet ses données à la suivante (`onAffaireDone`, `onLinesDone`…). Sauter
   * dessus laisserait l'étape d'arrivée sans les données qu'elle attend — son `@if` ne
   * la rendrait même pas.
   */
  onStepClick(index: number): void {
    const target = (index + 1) as Step;
    if (target < this.step()) this.step.set(target);
  }

  readonly nextButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    const last = this.step() === 4;
    return {
      variant: 'teal',
      pill: true,
      label: this.translate.instant(last ? 'INVOICING.NEW.SUBMIT' : 'INVOICING.NEW.NEXT'),
      iconEnd: last ? 'send' : 'arrow_forward',
      loading: this.isSaving(),
      disabled: !this.canGoNext() || this.isSaving(),
    };
  });

  readonly isSaving  = computed(() => this.stepRecapRef()?.saving() ?? false);

  /**
   * Vrai dès que le brouillon a été créé (l'étape Récapitulatif n'en navigue plus
   * automatiquement — elle reste affichée pour permettre l'export PDF). Sans ce garde,
   * "Enregistrer le brouillon"/"Soumettre" restent cliquables après un enregistrement
   * réussi et créeraient un DEUXIÈME brouillon en double.
   */
  readonly alreadySaved = computed(() => this.stepRecapRef()?.savedInvoiceId() != null);

  readonly canGoNext = computed(() => {
    const s = this.step();
    if (s === 1) {
      return !(this.stepAffaireRef()?.rafBlocked() ?? false)
          && !(this.stepAffaireRef()?.rafLoading() ?? false);
    }
    if (s === 4) return !this.isSaving() && !this.alreadySaved();
    return true;
  });

  goNext(): void {
    const s = this.step();
    if (s === 1) this.stepAffaireRef()?.next();
    else if (s === 2) this.stepLinesRef()?.next();
    else if (s === 3) this.stepConditionsRef()?.next();
    else if (s === 4) this.stepRecapRef()?.saveAndSubmit();
  }

  goPrev(): void {
    const s = this.step();
    if (s > 1) this.step.set((s - 1) as Step);
  }

  saveDraft(): void { this.stepRecapRef()?.saveDraft(); }

  onAffaireDone(v: StepAffaireValue): void {
    const aff = this.stepAffaireRef()?.selectedAffaire();
    this.summaryAffaire.set(aff?.intitule ?? '—');
    this.summaryClient.set(aff?.clientName ?? '—');
    const typeKey = INVOICE_TYPE_I18N[v.invoiceType];
    this.summaryType.set(typeKey ? this.translate.instant(typeKey) : v.invoiceType);
    this.affaireValue.set(v);
    this.step.set(2);
  }

  onLinesDone(v: StepLinesValue): void {
    this.summaryLines.set(v.lines.length);
    const ttc = v.lines.reduce(
      (s, l) => s + l.quantity * l.unitRate * (1 + l.vatRatePct / 100), 0
    );
    this.summaryTotal.set(
      new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency: this.affaireValue()?.currency ?? 'TND',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(ttc)
    );
    this.linesValue.set(v);
    this.step.set(3);
  }

  onConditionsDone(v: StepConditionsValue): void {
    this.conditionsValue.set(v);
    this.step.set(4);
  }

  cancel(): void { this.router.navigate(['/finance/invoicing']); }
}
