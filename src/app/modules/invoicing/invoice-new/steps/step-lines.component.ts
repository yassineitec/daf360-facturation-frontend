import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TVA_RATES } from '../../invoice.model';
import { StepAffaireValue } from './step-affaire.component';
import { InvoiceService } from '../../invoice.service';
import { BillingService, ExpenseDto } from '../../../affaires/billing/billing.service';
import { FactListService } from '../../../../core/fact-list.service';
import { ListValueDto } from '../../../cost/cost.model';
import { humanise } from '../../../../shared/enum-labels';

export interface StepLinesValue {
  lines: {
    description:    string;
    quantity:       number;
    unitRate:       number;
    vatRatePct:     number;
    // Avancement — présents uniquement en mode AV (Forfaitaire)
    budgetAffaire?: number;
    pctFacture?:    number;
    pctAvancement?: number;
    pctAFacturer?:  number;
    // RMB — présent uniquement quand la ligne provient d'un frais remboursable pické
    sourceExpenseId?: number;
  }[];
}

@Component({
  selector: 'app-step-lines',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
<div class="step-lines">

  <div class="lines-header">
    <span class="section-title">{{ 'INVOICING.STEP_LINES.TITLE' | translate }}</span>
    <div class="lines-header-actions">
      <button type="button" class="btn-add-line" (click)="addLine()">
        {{ 'INVOICING.STEP_LINES.ADD_LINE' | translate }}
      </button>
      @if (isRmb() || isAv()) {
        <button type="button" class="btn-add-line btn-add-rmb" [disabled]="!categoriesLoaded()"
          (click)="toggleRmbPicker()">
          {{ 'INVOICING.STEP_LINES.ADD_REMBOURSABLE' | translate }}
        </button>
      }
    </div>
  </div>

  @if ((isRmb() || isAv()) && rmbPickerOpen()) {
    <div class="rmb-picker-panel">
      @if (pickableExpenses().length === 0) {
        <p class="rmb-picker-empty">{{ 'INVOICING.STEP_LINES.REMBOURSABLE_EMPTY' | translate }}</p>
      } @else {
        <div class="rmb-picker-row rmb-picker-row--header">
          <span></span>
          <span>{{ 'INVOICING.STEP_LINES.REMBOURSABLE_COL_DATE' | translate }}</span>
          <span>{{ 'INVOICING.STEP_LINES.REMBOURSABLE_COL_CATEGORY' | translate }}</span>
          <span class="rmb-picker-num">{{ 'INVOICING.STEP_LINES.REMBOURSABLE_COL_AMOUNT' | translate }}</span>
          <span>{{ 'INVOICING.STEP_LINES.REMBOURSABLE_COL_COMMENT' | translate }}</span>
        </div>
        @for (e of pickableExpenses(); track e.id) {
          <label class="rmb-picker-row">
            <input type="checkbox"
              [checked]="isExpenseSelected(e.id)"
              (change)="toggleExpenseSelection(e.id, $event.target)" />
            <span>{{ formatDate(e.expenseDate) }}</span>
            <span>{{ categoryLabel(e.expenseCategoryId) }}</span>
            <span class="rmb-picker-num">{{ formatAmount(e.montant) }}</span>
            <span class="rmb-picker-comment">{{ e.commentaire || '—' }}</span>
          </label>
        }
      }
      <div class="rmb-picker-actions">
        <button type="button" class="btn-back" (click)="closeRmbPicker()">
          {{ 'INVOICING.STEP_LINES.REMBOURSABLE_CANCEL' | translate }}
        </button>
        <button type="button" class="btn-next" [disabled]="selectedExpenseIds().size === 0"
          (click)="addSelectedExpenses()">
          {{ 'INVOICING.STEP_LINES.REMBOURSABLE_ADD_SELECTED' | translate }}
        </button>
      </div>
    </div>
  }

  <div class="lines-table-wrap">
    <table class="lines-table">
      <thead>
        <tr>
          <th class="col-desc">{{ 'INVOICING.STEP_LINES.DESC' | translate }}</th>
          @if (isAv()) {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.BUDGET_AFFAIRE' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.PCT_FACTURE' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.PCT_AVANCEMENT' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.PCT_A_FACTURER' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.MONTANT_HT' | translate }}</th>
          } @else {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.QTY' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.UNIT_PRICE' | translate }}</th>
          }
          <th class="col-num">{{ 'INVOICING.STEP_LINES.VAT' | translate }}</th>
          @if (isAv()) {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_TTC' | translate }}</th>
          } @else {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_HT' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_TTC' | translate }}</th>
          }
          <th class="col-action"></th>
        </tr>
      </thead>
      <tbody [formGroup]="form">
        <ng-container formArrayName="lines">
          @for (lg of linesArray.controls; track $index; let i = $index) {
            <tr [formGroupName]="i" class="line-row">

              <!-- Description (toujours présente) -->
              <td>
                <input type="text" formControlName="description" class="td-input"
                  [class.invalid]="lg.get('description')!.invalid && lg.get('description')!.touched"
                  maxlength="255"
                  [placeholder]="'INVOICING.STEP_LINES.DESC_PLACEHOLDER' | translate" />
              </td>

              @if (isAv()) {
                <!-- Budget affaire (readonly — chargé depuis le backend) -->
                <td class="td-computed">{{ formatAmount(progress()?.budgetTotal ?? 0) }}</td>
                <!-- % déjà facturé (readonly — cumulé des factures actives) -->
                <td class="td-computed">{{ formatPct(progress()?.pctFacture ?? 0) }}</td>
                <!-- % avancement à date (saisie utilisateur) -->
                <td>
                  <input type="number" formControlName="pctAvancement" class="td-input td-num"
                    min="0" max="100" step="0.01"
                    [class.invalid]="lg.get('pctAvancement')!.touched && !lg.get('pctAvancement')!.value"
                    (input)="recalc(i)"
                    placeholder="0.00" />
                </td>
                <!-- % à facturer = pctAvancement - pctFacture (calculé) -->
                <td class="td-computed">{{ formatPct(pctAFacturer(i)) }}</td>
                <!-- Montant HT = budget × pctAFacturer / 100 (calculé) -->
                <td class="td-computed">{{ formatAmount(lineHtAv(i)) }}</td>
              } @else {
                <td>
                  <input type="number" formControlName="quantite" class="td-input td-num"
                    min="0.01" step="0.01" (input)="recalc(i)" />
                </td>
                <td>
                  <input type="number" formControlName="prixUnitaireHt" class="td-input td-num"
                    min="0" step="0.01" (input)="recalc(i)" />
                </td>
              }

              <!-- TVA (toujours présente) -->
              <td>
                <select formControlName="tauxTva" class="td-input td-num" (change)="recalc(i)">
                  @for (r of tvaRates; track r) {
                    <option [value]="r">{{ r }}%</option>
                  }
                </select>
              </td>

              @if (isAv()) {
                <td class="td-computed">{{ formatAmount(lineTtcAv(i)) }}</td>
              } @else {
                <td class="td-computed">{{ formatAmount(lineHt(i)) }}</td>
                <td class="td-computed">{{ formatAmount(lineTtc(i)) }}</td>
              }

              <td>
                <button type="button" class="remove-line-btn" title="✕" (click)="removeLine(i)"
                  [disabled]="linesArray.length === 1">✕</button>
              </td>
            </tr>
          }
        </ng-container>
      </tbody>
      <tfoot>
        <tr>
          @if (isAv()) {
            <td colspan="6" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtcAv) }}</td>
          } @else {
            <td colspan="4" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ht">{{ formatAmount(totalHt) }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtc) }}</td>
          }
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Frais remboursables pickés (mode AV) : table SÉPARÉE, pas mélangée aux
       lignes d'avancement — un frais remboursable n'est pas une tranche du budget
       contractuel, c'est un montant plat comme en mode RMB. ────────────────────── -->
  @if (isAv() && expenseLinesArray.length > 0) {
    <div class="lines-header">
      <span class="section-title">{{ 'INVOICING.STEP_LINES.REMBOURSABLE_LINES_TITLE' | translate }}</span>
    </div>
    <div class="lines-table-wrap">
      <table class="lines-table" [formGroup]="form">
        <thead>
          <tr>
            <th class="col-desc">{{ 'INVOICING.STEP_LINES.DESC' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.MONTANT_HT' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.VAT' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_TTC' | translate }}</th>
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          <ng-container formArrayName="expenseLines">
            @for (lg of expenseLinesArray.controls; track $index; let i = $index) {
              <tr [formGroupName]="i" class="line-row">
                <td>
                  <input type="text" formControlName="description" class="td-input" maxlength="255" />
                </td>
                <td>
                  <input type="number" formControlName="prixUnitaireHt" class="td-input td-num"
                    min="0" step="0.01" (input)="recalc(i)" />
                </td>
                <td>
                  <select formControlName="tauxTva" class="td-input td-num" (change)="recalc(i)">
                    @for (r of tvaRates; track r) {
                      <option [value]="r">{{ r }}%</option>
                    }
                  </select>
                </td>
                <td class="td-computed">{{ formatAmount(lineTtcExpense(i)) }}</td>
                <td>
                  <button type="button" class="remove-line-btn" [title]="'INVOICING.STEP_LINES.REMBOURSABLE_REMOVE' | translate"
                    (click)="removeExpenseLine(i)">✕</button>
                </td>
              </tr>
            }
          </ng-container>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtcExpense) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  }

  @if (form.invalid && form.touched) {
    <div class="form-error">{{ 'INVOICING.STEP_LINES.ERROR' | translate }}</div>
  }

  @if (showActions()) {
    <div class="step-actions">
      <button type="button" class="btn-back" (click)="prevStep.emit()">
        <span class="material-symbols-outlined">arrow_back</span>
        {{ 'INVOICING.STEP_LINES.BACK' | translate }}
      </button>
      <button type="button" class="btn-next" (click)="next()" [disabled]="linesArray.length === 0">
        {{ 'INVOICING.STEP_LINES.NEXT' | translate }}
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>
    </div>
  }
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepLinesComponent {
  private readonly fb        = inject(FormBuilder);
  private readonly svc       = inject(InvoiceService);
  private readonly billingSvc = inject(BillingService);
  private readonly listSvc   = inject(FactListService);

  showActions = input<boolean>(true);
  affaireData = input.required<StepAffaireValue>();
  prevStep    = output<void>();
  nextStep    = output<StepLinesValue>();

  readonly tvaRates = TVA_RATES;

  /** Données chargées depuis GET /invoices/affaire/{id}/progress — null hors mode AV */
  readonly progress = signal<{ budgetTotal: number; pctFacture: number } | null>(null);

  /** Vrai si l'affaire est en mode Forfaitaire / Avancement (AV) */
  readonly isAv = computed(() => this.affaireData().billingMode === 'AV');

  /** Vrai si l'affaire est en mode Frais remboursables (RMB) */
  readonly isRmb = computed(() => this.affaireData().billingMode === 'RMB');

  // ── Picker de frais remboursables (RMB) ──────────────────────────────────────

  private readonly billableExpenses = signal<ExpenseDto[]>([]);
  private readonly categories       = signal<ListValueDto[]>([]);

  readonly rmbPickerOpen    = signal(false);
  readonly selectedExpenseIds = signal<Set<number>>(new Set());

  /**
   * Vrai une fois le référentiel EXPENSE_CATEGORY chargé (succès OU échec — un échec
   * met categories() à [] mais ne doit pas bloquer le bouton indéfiniment). Le bouton
   * "Ajouter un remboursable" reste désactivé avant ça : sans cette garde, un clic assez
   * rapide ouvrirait le picker avant la résolution de la requête et afficherait des
   * libellés de catégorie numériques bruts (fallback humanise(id)) au lieu du vrai label.
   */
  readonly categoriesLoaded = signal(false);

  /**
   * Compteur incrémenté à chaque mutation structurelle de `linesArray` (ajout / retrait
   * de ligne). Les signaux ne suivent pas nativement les mutations d'un `FormArray` :
   * sans ce compteur lu dans `usedExpenseIds`, ce `computed()` n'aurait aucune
   * dépendance signal et resterait figé sur sa toute première valeur.
   */
  private readonly linesVersion = signal(0);

  /**
   * IDs de frais déjà pickés dans une ligne cette session — non re-proposables.
   * Union des deux tables : en mode RMB le picker pousse dans `lines`, en mode AV
   * dans `expenseLines` — un seul des deux est jamais non-vide pour une affaire
   * donnée, mais lire les deux évite d'avoir à savoir laquelle à l'appelant.
   */
  private readonly usedExpenseIds = computed(() => {
    this.linesVersion();
    return new Set(
      [...this.linesArray.controls, ...this.expenseLinesArray.controls]
        .map(c => c.get('sourceExpenseId')?.value)
        .filter(v => v != null),
    );
  });

  readonly pickableExpenses = computed(() =>
    this.billableExpenses().filter(e => !this.usedExpenseIds().has(e.id)),
  );

  constructor() {
    // Charge les données de progression dès qu'on est en mode AV avec une affaire sélectionnée
    effect(() => {
      const av    = this.isAv();
      const affId = this.affaireData().affaireId;
      if (av && affId) {
        this.svc.getAffaireInvoiceProgress(affId).subscribe({
          next:  p  => this.progress.set(p),
          error: () => this.progress.set({ budgetTotal: 0, pctFacture: 0 }),
        });
      } else {
        this.progress.set(null);
      }
    });

    // Charge les frais remboursables facturables + le référentiel de catégories dès
    // qu'on est en mode RMB OU AV avec une affaire sélectionnée — les frais s'appliquent
    // à toute affaire quel que soit son mode (même règle que côté fiche affaire).
    effect(() => {
      const rmbOrAv = this.isRmb() || this.isAv();
      const aff = this.affaireData();
      if (rmbOrAv && aff.affaireId) {
        this.billingSvc.getBillableExpenses(aff.affaireId, aff.currency).subscribe({
          next:  e  => this.billableExpenses.set(e),
          error: () => this.billableExpenses.set([]),
        });
        this.categoriesLoaded.set(false);
        this.listSvc.getListValues('EXPENSE_CATEGORY', aff.paysId).subscribe({
          next:  v  => { this.categories.set(v);  this.categoriesLoaded.set(true); },
          error: () => { this.categories.set([]); this.categoriesLoaded.set(true); },
        });
      } else {
        this.billableExpenses.set([]);
        this.categoriesLoaded.set(false);
        this.rmbPickerOpen.set(false);
        this.selectedExpenseIds.set(new Set());
        this.expenseLinesArray.clear();
        this.linesVersion.update(v => v + 1);
      }
    });
  }

  form = this.fb.group({
    lines: this.fb.array([this.newLine()]),
    // Mode AV uniquement : frais remboursables pickés, table séparée des lignes
    // d'avancement (cf. gabarit ci-dessus). Vide et inutilisé en mode RMB/standard,
    // où le picker pousse directement dans `lines` comme avant.
    expenseLines: this.fb.array([] as FormGroup[]),
  });

  get linesArray(): FormArray { return this.form.get('lines') as FormArray; }
  get expenseLinesArray(): FormArray { return this.form.get('expenseLines') as FormArray; }

  newLine(): FormGroup {
    return this.fb.group({
      description:      ['', Validators.required],
      quantite:         [1,  [Validators.required, Validators.min(0.01)]],
      prixUnitaireHt:   [0,  [Validators.required, Validators.min(0)]],
      pctAvancement:    [null],
      tauxTva:          [19],
      sourceExpenseId:  [null as number | null],
    });
  }

  addLine():    void { this.linesArray.push(this.newLine()); this.linesVersion.update(v => v + 1); }
  removeLine(i: number): void {
    if (this.linesArray.length > 1) {
      this.linesArray.removeAt(i);
      this.linesVersion.update(v => v + 1);
    }
  }

  /** Ligne de la mini-table "frais remboursables" (mode AV) — montant plat, pas d'avancement. */
  newExpenseLine(): FormGroup {
    return this.fb.group({
      description:      ['', Validators.required],
      prixUnitaireHt:   [0,  [Validators.required, Validators.min(0)]],
      tauxTva:          [0],
      sourceExpenseId:  [null as number | null],
    });
  }

  /** Contrairement à `removeLine`, aucun plancher : la mini-table peut redevenir vide. */
  removeExpenseLine(i: number): void {
    this.expenseLinesArray.removeAt(i);
    this.linesVersion.update(v => v + 1);
  }

  lineHtExpense(i: number): number {
    return (this.expenseLinesArray.at(i) as FormGroup).value.prixUnitaireHt ?? 0;
  }

  lineTtcExpense(i: number): number {
    const g = this.expenseLinesArray.at(i) as FormGroup;
    return this.lineHtExpense(i) * (1 + (g.value.tauxTva ?? 0) / 100);
  }

  get totalTtcExpense(): number {
    return this.expenseLinesArray.controls.reduce((s, _, i) => s + this.lineTtcExpense(i), 0);
  }

  recalc(_i: number): void { /* le template se recalcule via les getters sur chaque changement */ }

  // ── Picker de frais remboursables (RMB) ──────────────────────────────────────

  toggleRmbPicker(): void { this.rmbPickerOpen.update(v => !v); }

  closeRmbPicker(): void {
    this.rmbPickerOpen.set(false);
    this.selectedExpenseIds.set(new Set());
  }

  isExpenseSelected(id: number): boolean { return this.selectedExpenseIds().has(id); }

  toggleExpenseSelection(id: number, target: EventTarget | null): void {
    const checked = (target as HTMLInputElement | null)?.checked ?? false;
    const s = new Set(this.selectedExpenseIds());
    if (checked) s.add(id); else s.delete(id);
    this.selectedExpenseIds.set(s);
  }

  /** Ajoute une ligne PAR frais coché, préremplie et éditable comme n'importe quelle ligne. */
  addSelectedExpenses(): void {
    const ids = this.selectedExpenseIds();
    if (ids.size === 0) return;
    const picked = this.pickableExpenses().filter(e => ids.has(e.id));

    if (this.isAv()) {
      // Mode AV : table séparée dédiée, jamais mélangée aux lignes d'avancement —
      // pas de ligne vierge par défaut à nettoyer ici, `expenseLines` démarre vide.
      picked.forEach(e => {
        const g = this.newExpenseLine();
        g.patchValue({
          description:     `${this.categoryLabel(e.expenseCategoryId)}${e.commentaire ? ' — ' + e.commentaire : ''}`,
          prixUnitaireHt:  e.montant,
          tauxTva:         0,
          sourceExpenseId: e.id,
        });
        this.expenseLinesArray.push(g);
      });
    } else {
      // Mode RMB (ou standard) : comportement historique, inchangé — le picker pousse
      // directement dans `lines`.
      // Si l'utilisateur n'a fait QUE picker des remboursables (jamais touché la ligne
      // vierge par défaut créée avec le formulaire), la retirer plutôt que de la laisser
      // trainer invalide (description requise) — sinon "Suivant" échoue silencieusement
      // sans indiquer que c'est cette ligne oubliée qui bloque.
      if (this.linesArray.length === 1 && this.isDefaultBlankLine(this.linesArray.at(0) as FormGroup)) {
        this.linesArray.removeAt(0);
      }

      picked.forEach(e => {
        const g = this.newLine();
        g.patchValue({
          description:    `${this.categoryLabel(e.expenseCategoryId)}${e.commentaire ? ' — ' + e.commentaire : ''}`,
          quantite:        1,
          prixUnitaireHt:  e.montant,
          tauxTva:         0,
          sourceExpenseId: e.id,
        });
        this.linesArray.push(g);
      });
    }
    this.linesVersion.update(v => v + 1);
    this.closeRmbPicker();
  }

  categoryLabel(id: number): string {
    return this.categories().find(c => c.id === id)?.labelFr ?? humanise(String(id));
  }

  /** Vrai si la ligne est encore exactement dans son état initial (jamais éditée). */
  private isDefaultBlankLine(g: FormGroup): boolean {
    const v = g.value;
    return !g.touched
      && (v.description ?? '') === ''
      && v.quantite === 1
      && v.prixUnitaireHt === 0
      && v.sourceExpenseId == null;
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── Calculs mode AV ─────────────────────────────────────────────────────────

  /** % à facturer sur cette ligne = pctAvancement saisi - pctFacture cumulé */
  pctAFacturer(i: number): number {
    const g       = this.linesArray.at(i) as FormGroup;
    const pctFact = this.progress()?.pctFacture  ?? 0;
    const pctAv   = g.value.pctAvancement ?? 0;
    return Math.max(0, pctAv - pctFact);
  }

  /** Montant HT = budgetTotal × pctAFacturer / 100 */
  lineHtAv(i: number): number {
    const budget = this.progress()?.budgetTotal ?? 0;
    return budget * this.pctAFacturer(i) / 100;
  }

  /** Montant TTC = montantHT × (1 + tauxTVA / 100) */
  lineTtcAv(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return this.lineHtAv(i) * (1 + (g.value.tauxTva ?? 0) / 100);
  }

  get totalTtcAv(): number {
    return this.linesArray.controls.reduce((s, _, i) => s + this.lineTtcAv(i), 0);
  }

  // ── Calculs mode standard ────────────────────────────────────────────────────

  lineHt(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return (g.value.quantite ?? 0) * (g.value.prixUnitaireHt ?? 0);
  }

  lineTtc(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return this.lineHt(i) * (1 + (g.value.tauxTva ?? 0) / 100);
  }

  get totalHt():  number { return this.linesArray.controls.reduce((s, _, i) => s + this.lineHt(i), 0); }
  get totalTtc(): number { return this.linesArray.controls.reduce((s, _, i) => s + this.lineTtc(i), 0); }

  // ── Soumission ───────────────────────────────────────────────────────────────

  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    if (this.isAv()) {
      // Valider que pctAvancement est renseigné sur toutes les lignes
      const anyMissing = this.linesArray.controls.some(
        g => g.get('pctAvancement')?.value == null,
      );
      if (anyMissing) {
        this.linesArray.controls.forEach(g => g.get('pctAvancement')?.markAsTouched());
        return;
      }

      const budget   = this.progress()?.budgetTotal ?? 0;
      const pctFactu = this.progress()?.pctFacture  ?? 0;

      const avancementLines = (this.linesArray.value as {
        description: string; pctAvancement: number; tauxTva: number; sourceExpenseId: number | null;
      }[])
        .map((l, i) => {
          const pctAvancement = l.pctAvancement ?? 0;
          const pctAFacturer  = Math.max(0, pctAvancement - pctFactu);
          const montantHt     = budget * pctAFacturer / 100;
          return {
            description:     l.description,
            quantity:        1,          // rétrocompat : quantity=1, unitRate=montantHt
            unitRate:        montantHt,
            vatRatePct:      l.tauxTva,
            budgetAffaire:   budget,
            pctFacture:      pctFactu,
            pctAvancement:   pctAvancement,
            pctAFacturer:    pctAFacturer,
            sourceExpenseId: l.sourceExpenseId ?? undefined,
          };
        });

      // Frais remboursables pickés (table séparée) : montant plat, aucun champ
      // d'avancement — le backend prend la branche "quantity × unitRate" (le calcul
      // AV ne s'applique que quand budgetAffaire ET pctAFacturer sont renseignés,
      // cf. InvoiceService.saveLines côté service).
      const expenseLines = (this.expenseLinesArray.value as {
        description: string; prixUnitaireHt: number; tauxTva: number; sourceExpenseId: number | null;
      }[]).map(l => ({
        description:     l.description,
        quantity:        1,
        unitRate:        l.prixUnitaireHt,
        vatRatePct:      l.tauxTva,
        sourceExpenseId: l.sourceExpenseId ?? undefined,
      }));

      this.nextStep.emit({ lines: [...avancementLines, ...expenseLines] });
    } else {
      this.nextStep.emit({
        lines: (this.linesArray.value as {
          description: string; quantite: number; prixUnitaireHt: number; tauxTva: number;
          sourceExpenseId: number | null;
        }[]).map(l => ({
          description:     l.description,
          quantity:        l.quantite,
          unitRate:        l.prixUnitaireHt,
          vatRatePct:      l.tauxTva,
          sourceExpenseId: l.sourceExpenseId ?? undefined,
        })),
      });
    }
  }

  // ── Formatage ────────────────────────────────────────────────────────────────

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'TND',
      minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v);
  }

  formatPct(v: number): string {
    return v.toFixed(2) + ' %';
  }
}
