import { Component, signal, computed, viewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { CardComponent, ButtonComponent } from '@khalilrebhiitec/daf360';
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
    CardComponent, ButtonComponent, TranslatePipe,
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

  readonly stepTip = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('INVOICING.NEW.TIPS.' + STEP_KEYS[this.step() - 1]);
  });

  readonly isSaving  = computed(() => this.stepRecapRef()?.saving() ?? false);
  readonly canGoNext = computed(() => {
    const s = this.step();
    if (s === 1) {
      return !(this.stepAffaireRef()?.rafBlocked() ?? false)
          && !(this.stepAffaireRef()?.rafLoading() ?? false);
    }
    if (s === 4) return !this.isSaving();
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
