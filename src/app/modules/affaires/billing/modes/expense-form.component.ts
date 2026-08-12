import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FileUploadComponent, FormFieldComponent,
  MultiDatePickerComponent, SelectComponent,
} from '@khalilrebhiitec/daf360';
import type {
  MultiDatePickerConfig, SelectOption, UploadedFile,
} from '@khalilrebhiitec/daf360';

import { BillingService } from '../billing.service';
import { FactListService } from '../../../../core/fact-list.service';
import { AffaireDetail } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';

/**
 * Saisie d'un frais remboursable — **une seule section, le formulaire**.
 *
 * L'historique des frais soumis vivait ici, dans le même panneau ; il est devenu un
 * onglet de la fiche affaire (`app-expense-history`). Ce composant ne fait donc plus
 * qu'une chose, et peut être ouvert en modale sans que la modale contienne un tableau.
 *
 * 100 % composants de la lib : `daf-select`, `daf-form-field`, `daf-file-upload`,
 * `daf-button`. La version précédente était du balisage à la main avec des `<select>`,
 * des `<input>` et une vingtaine de couleurs en dur.
 *
 * ⚠️ Le format d'envoi a aussi été corrigé : l'API attend un multipart en **deux
 * parties** — `data` (JSON `SubmitExpenseRequest`) et `justificatif` (fichier). Le
 * formulaire postait des champs plats (`categorie`, `dateDepense`), que le serveur ne
 * pouvait pas lier : aucune soumission ne passait.
 */
@Component({
  selector: 'app-expense-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Pas de `TranslatePipe` : tous les libellés de ce formulaire sont traduits dans la
  // classe (les composants de la lib prennent des chaînes, pas du balisage).
  imports: [
    SelectComponent, FormFieldComponent, FileUploadComponent,
    MultiDatePickerComponent, ButtonComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-4">

      <daf-select
        [options]="categoryOptions()"
        [config]="categoryConfig()"
        [selected]="categoryId() ? [categoryId()!.toString()] : []"
        (selectedChange)="onCategoryChange($event)" />

      <div style="display:flex; flex-wrap:wrap; gap:1rem">
        <daf-form-field
          style="flex:1 1 200px; min-width:0"
          [options]="amountOptions()"
          [value]="montant()"
          (valueChange)="montant.set(toNumber($event))" />

        <daf-select
          style="flex:1 1 160px; min-width:0"
          [options]="currencyOptions()"
          [config]="currencyConfig()"
          [selected]="[devise()]"
          (selectedChange)="devise.set($event[0])" />

        <!-- Sélecteur de dates de la lib, comme partout ailleurs dans le module : un
             champ de type date retombait sur le calendrier natif du navigateur,
             différent d'un poste à l'autre et hors charte.
             (Aucun accent grave dans ce commentaire — il vit dans une chaîne gabarit.) -->
        <daf-multi-date-picker
          style="flex:1 1 240px; min-width:0"
          [config]="dateConfig()"
          [(value)]="dateDepense" />
      </div>

      <!-- Le justificatif n'est exigé que si la catégorie choisie le demande
           (paramétrage EXPENSE_CATEGORY → « Justificatif obligatoire »). -->
      <daf-file-upload [config]="fileConfig()" [(files)]="files" />

      <daf-form-field
        [options]="commentOptions()"
        [value]="commentaire()"
        (valueChange)="commentaire.set(($any($event) ?? '') + '')" />

      @if (error()) {
        <div class="flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-body-sm text-danger">
          <span class="material-symbols-outlined text-[18px]">error</span>{{ error() }}
        </div>
      }

      <!-- Bouton interne UNIQUEMENT hors modale (onglet Facturation) : ouvert en modale,
           « Annuler » et « Soumettre » vivent dans le pied de la fenêtre, sur une seule
           ligne, comme toutes les autres modales de la fiche. -->
      @if (showSubmit()) {
        <div style="display:flex; justify-content:flex-end">
          <daf-button [options]="submitOptions()" (onClick)="submit()" />
        </div>
      }

    </div>
  `,
})
export class ExpenseFormComponent implements OnInit {
  affaire = input.required<AffaireDetail>();
  /**
   * `false` quand le formulaire est ouvert en modale : c'est le pied de la modale qui
   * porte alors « Annuler » et « Soumettre », côte à côte.
   */
  showSubmit = input(true);

  /** Émis après un enregistrement réussi — l'hôte rafraîchit son historique. */
  readonly submitted = output<void>();

  private readonly svc       = inject(BillingService);
  private readonly listSvc   = inject(FactListService);
  private readonly translate = inject(TranslateService);

  private readonly categories = signal<ListValueDto[]>([]);
  private readonly currencies = signal<ListValueDto[]>([]);

  readonly categoryId  = signal<number | null>(null);
  readonly montant     = signal<number | null>(null);
  readonly devise      = signal('EUR');
  /** `daf-multi-date-picker` travaille en `Date` ; l'API attend un `LocalDate` ISO. */
  readonly dateDepense = signal<Date | Date[] | null>(null);
  readonly commentaire = signal('');
  readonly files       = signal<UploadedFile[]>([]);

  readonly saving = signal(false);
  readonly error  = signal<string | null>(null);

  /** La catégorie retenue, pour lire sa règle de justificatif. */
  private readonly selectedCategory = computed(() =>
    this.categories().find(c => c.id === this.categoryId()));

  readonly receiptRequired = computed(() =>
    this.selectedCategory()?.requiresReceipt === true);

  ngOnInit(): void {
    const paysId = this.affaire().paysId;
    this.devise.set(this.affaire().devise || 'EUR');

    this.listSvc.getListValues('EXPENSE_CATEGORY', paysId)
      .subscribe(v => this.categories.set(v.filter(c => c.isActive)));
    this.listSvc.getListValues('CURRENCY', paysId)
      .subscribe(v => this.currencies.set(v.filter(c => c.isActive)));
  }

  // ── Options des contrôles ───────────────────────────────────────────────

  readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: String(c.id), label: c.labelFr })));

  readonly categoryConfig = computed(() => {
    this.translate.currentLang();
    return {
      label:       this.translate.instant('AFFAIRES.EXPENSES.FORM.CATEGORY'),
      placeholder: this.translate.instant('AFFAIRES.EXPENSES.FORM.CATEGORY_PH'),
      required: true, searchable: true, fullWidth: true,
    };
  });

  /**
   * Devises : le référentiel s'il répond, sinon un repli figé — une devise est
   * obligatoire côté serveur, donc le champ ne doit jamais rester vide faute de liste.
   */
  readonly currencyOptions = computed<SelectOption[]>(() => {
    const list = this.currencies();
    if (list.length) return list.map(c => ({ value: c.code, label: c.code }));
    return ['EUR', 'USD', 'TND', 'MAD', 'EGP'].map(c => ({ value: c, label: c }));
  });

  readonly currencyConfig = computed(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('AFFAIRES.EXPENSES.FORM.CURRENCY'),
      required: true, fullWidth: true,
    };
  });

  readonly amountOptions = computed(() => {
    this.translate.currentLang();
    return {
      type: 'number' as const,
      label: this.translate.instant('AFFAIRES.EXPENSES.FORM.AMOUNT'),
      placeholder: '0.00', required: true, fullWidth: true,
    };
  });

  /**
   * Aujourd'hui, figé à la construction : recalculer `new Date()` à chaque cycle de
   * détection renverrait un objet différent à chaque fois et ferait travailler le
   * calendrier pour rien.
   */
  private readonly today = new Date();

  readonly dateConfig = computed<MultiDatePickerConfig>(() => {
    this.translate.currentLang();
    return {
      label: this.translate.instant('AFFAIRES.EXPENSES.FORM.DATE'),
      placeholder: this.translate.instant('AFFAIRES.EXPENSES.FORM.DATE_PH'),
      selectionMode: 'single',
      required: true,
      // Un frais se constate après coup : le passé est ouvert, le futur non.
      allowPastDays: true,
      allowWeekends: true,
      maxDate: this.today,
      fullWidth: true,
    };
  });

  /** La date retenue, au format `yyyy-MM-dd` attendu par l'API. */
  private isoDate(): string | null {
    const v = this.dateDepense();
    const d = Array.isArray(v) ? v[0] : v;
    if (!d) return null;
    // Composantes locales, et non `toISOString()` : ce dernier convertit en UTC et
    // décale la date d'un jour pour tout fuseau à l'est de Greenwich en soirée.
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  readonly commentOptions = computed(() => {
    this.translate.currentLang();
    return {
      type: 'textarea' as const, rows: 2, maxLength: 500,
      label: this.translate.instant('AFFAIRES.EXPENSES.FORM.COMMENT'),
      placeholder: this.translate.instant('AFFAIRES.EXPENSES.FORM.COMMENT_PH'),
      fullWidth: true,
    };
  });

  /**
   * `required` et le libellé de l'encart de dépôt suivent la catégorie : l'utilisateur
   * voit tout de suite si la pièce est attendue, sans devoir soumettre pour l'apprendre.
   * Taille et formats restent contrôlés par la lib, et re-contrôlés côté serveur.
   */
  readonly fileConfig = computed(() => {
    this.translate.currentLang();
    return {
      label:  this.translate.instant('AFFAIRES.EXPENSES.FORM.RECEIPT'),
      accept: '.jpg,.jpeg,.png,.pdf',
      maxSizeMb: 5,
      required: this.receiptRequired(),
      hint: this.translate.instant(this.receiptRequired()
        ? 'AFFAIRES.EXPENSES.FORM.RECEIPT_REQUIRED_HINT'
        : 'AFFAIRES.EXPENSES.FORM.RECEIPT_OPTIONAL_HINT'),
    };
  });

  readonly submitOptions = computed(() => {
    this.translate.currentLang();
    return {
      variant: 'teal' as const,
      iconStart: 'send',
      label: this.translate.instant('AFFAIRES.EXPENSES.FORM.SUBMIT'),
      loading: this.saving(),
      disabled: !this.canSubmit() || this.saving(),
    };
  });

  /** Le fichier valide retenu, s'il y en a un (la lib marque les refusés via `error`). */
  private readonly validFile = computed(() => this.files().find(f => !f.error)?.file ?? null);

  readonly canSubmit = computed(() =>
    this.categoryId() !== null
    && (this.montant() ?? 0) > 0
    && this.dateDepense() !== null
    && !!this.devise()
    && (!this.receiptRequired() || this.validFile() !== null));

  // ── Actions ─────────────────────────────────────────────────────────────

  toNumber(v: string | number | null): number | null {
    return v === null || v === '' ? null : Number(v);
  }

  onCategoryChange(values: string[]): void {
    this.categoryId.set(values[0] ? Number(values[0]) : null);
    this.error.set(null);
  }

  /**
   * Renvoie `false` quand rien n'a été envoyé — la modale reste alors ouverte au lieu de
   * se refermer sur une saisie incomplète ou une erreur serveur.
   */
  submit(): boolean {
    if (!this.canSubmit() || this.saving()) return false;
    this.saving.set(true);
    this.error.set(null);

    // Deux parties, comme l'attend le contrôleur : `data` en JSON typé, `justificatif`
    // seulement s'il y a un fichier — l'envoyer vide ferait échouer la liaison.
    const fd = new FormData();
    fd.append('data', new Blob([JSON.stringify({
      expenseCategoryId: this.categoryId(),
      montant:           this.montant(),
      devise:            this.devise(),
      expenseDate:       this.isoDate(),
      commentaire:       this.commentaire().trim() || null,
    })], { type: 'application/json' }));

    const file = this.validFile();
    if (file) fd.append('justificatif', file);

    this.svc.submitExpense(this.affaire().id, fd).subscribe({
      next: () => {
        this.saving.set(false);
        this.reset();
        this.submitted.emit();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('AFFAIRES.EXPENSES.FORM.ERR_SUBMIT'));
      },
    });
    return true;
  }

  /** Fermeture sans enregistrer — la modale délègue son bouton « Annuler ». */
  cancel(): void {
    this.reset();
    this.error.set(null);
  }

  private reset(): void {
    this.categoryId.set(null);
    this.montant.set(null);
    this.dateDepense.set(null);
    this.commentaire.set('');
    this.files.set([]);
    this.devise.set(this.affaire().devise || 'EUR');
  }
}
