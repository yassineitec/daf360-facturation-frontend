import { Component, signal, computed, viewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CardComponent, ButtonComponent } from '@khalilrebhiitec/daf360';
import { StepAffaireComponent, StepAffaireValue } from './steps/step-affaire.component';
import { StepLinesComponent,  StepLinesValue  } from './steps/step-lines.component';
import { StepConditionsComponent, StepConditionsValue } from './steps/step-conditions.component';
import { StepRecapComponent } from './steps/step-recap.component';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { title: 'Affaire & Client', icon: 'folder_open'    },
  { title: 'Lignes',           icon: 'receipt'        },
  { title: 'Conditions',       icon: 'calendar_month' },
  { title: 'Récapitulatif',    icon: 'summarize'      },
];

const STEP_TIPS = [
  "Sélectionnez l'affaire concernée. Le RAF disponible est vérifié automatiquement pour bloquer toute sur-facturation.",
  "Ajoutez chaque prestation avec sa quantité, son prix unitaire HT et le taux de TVA applicable.",
  "Définissez l'échéance, les conditions de paiement et le bon de commande si le type de facturation l'exige.",
  "Vérifiez toutes les informations avant de soumettre ou d'enregistrer en brouillon pour y revenir plus tard.",
];

const INVOICE_TYPE_LABELS: Record<string, string> = {
  ACOMPTE:      'Acompte',
  INTERMEDIAIRE: 'Situation',
  FINALE:       'Solde',
  AVOIR:        "Note d'avoir",
};

@Component({
  selector: 'app-invoice-new',
  standalone: true,
  imports: [
    CardComponent, ButtonComponent,
    StepAffaireComponent, StepLinesComponent, StepConditionsComponent, StepRecapComponent,
  ],
  templateUrl: './invoice-new.component.html',
  styleUrl:    './invoice-new.component.scss',
})
export class InvoiceNewComponent {
  private readonly router = inject(Router);

  step            = signal<Step>(1);
  affaireValue    = signal<StepAffaireValue    | null>(null);
  linesValue      = signal<StepLinesValue      | null>(null);
  conditionsValue = signal<StepConditionsValue | null>(null);

  summaryAffaire = signal('—');
  summaryClient  = signal('—');
  summaryType    = signal('—');
  summaryLines   = signal(0);
  summaryTotal   = signal('—');

  readonly steps = STEPS;

  readonly stepAffaireRef    = viewChild(StepAffaireComponent);
  readonly stepLinesRef      = viewChild(StepLinesComponent);
  readonly stepConditionsRef = viewChild(StepConditionsComponent);
  readonly stepRecapRef      = viewChild(StepRecapComponent);

  readonly stepTip = computed(() => STEP_TIPS[this.step() - 1]);

  readonly isSaving = computed(() => this.stepRecapRef()?.saving() ?? false);

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

  saveDraft(): void {
    this.stepRecapRef()?.saveDraft();
  }

  onAffaireDone(v: StepAffaireValue): void {
    const aff = this.stepAffaireRef()?.selectedAffaire();
    this.summaryAffaire.set(aff?.intitule ?? '—');
    this.summaryClient.set(aff?.clientName ?? '—');
    this.summaryType.set(INVOICE_TYPE_LABELS[v.invoiceType] ?? v.invoiceType);
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

  cancel(): void { this.router.navigate(['/fact/invoicing']); }
}
