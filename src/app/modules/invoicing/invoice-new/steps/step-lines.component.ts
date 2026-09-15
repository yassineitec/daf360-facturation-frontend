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
    // Avancement — présents en mode AV (Forfaitaire, calculé depuis le taux saisi),
    // Livrable (calculé par ligne/document côté serveur à la génération — cf.
    // isLivrable() plus bas) et T&M (WIP validé, avancement toujours fixé à 100 % —
    // cf. isTm() plus bas)
    budgetAffaire?: number;
    pctFacture?:    number;
    pctAvancement?: number;
    pctAFacturer?:  number;
    // RMB — présent uniquement quand la ligne provient d'un frais remboursable pické
    sourceExpenseId?: number;
    // T&M — collaborateur associé, présent uniquement en mode T&M
    profileUserId?: number;
  }[];
  // Période facturée — les heures récupérées en T&M, la période de génération du lot en
  // Livrable ; renseignée par le serveur à la génération dans les deux cas et simplement
  // préservée telle quelle par cette étape. Null dans les autres modes.
  periodFrom?: string | null;
  periodTo?:   string | null;
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
      @if (!isAv() && !isTm() && !isLivrable()) {
        <button type="button" class="btn-add-line" (click)="addLine()">
          {{ 'INVOICING.STEP_LINES.ADD_LINE' | translate }}
        </button>
      }
      @if (isAv() || isTm() || isLivrable()) {
        <button type="button" class="btn-add-line btn-add-rmb" [disabled]="!categoriesLoaded()"
          (click)="toggleRmbPicker()">
          {{ 'INVOICING.STEP_LINES.ADD_REMBOURSABLE' | translate }}
        </button>
      }
    </div>
  </div>

  @if ((isAv() || isTm() || isLivrable()) && rmbPickerOpen()) {
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
          @if (isAv() || isTm() || isLivrable()) {
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
          @if (isAv() || isTm() || isLivrable()) {
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
              } @else if (isTm()) {
                <!-- T&M : une ligne ici facture la totalité du WIP déjà validé et calculé
                     côté serveur pour sa période — pas de budget d'affaire à comparer,
                     Budget affaire vaut donc toujours le Montant HT lui-même et les trois
                     pourcentages sont fixés à 100 % (cf. DFValidationService.buildInvoiceLine
                     côté backend, branche REGIE). Seul le montant (Montant HT) est
                     saisissable. -->
                <td class="td-computed">{{ formatAmount(lineHtTm(i)) }}</td>
                <td class="td-computed">{{ formatPct(100) }}</td>
                <td class="td-computed">{{ formatPct(100) }}</td>
                <td class="td-computed">{{ formatPct(100) }}</td>
                <td>
                  <input type="number" formControlName="prixUnitaireHt" class="td-input td-num"
                    min="0" step="0.01" (input)="recalc(i)" />
                </td>
              } @else if (isLivrable()) {
                <!-- Livrable : les quatre colonnes d'avancement portent de VRAIES valeurs,
                     propres au document facturé (budget alloué du livrable, % déjà facturé
                     avant cette facture, % à date, delta à facturer) — calculées une seule
                     fois côté serveur à la génération de la facture, depuis le pourcentage
                     que le DF a saisi dans l'onglet WIP avant même que la facture existe
                     (cf. DFValidationService.buildInvoiceLine, branche LIVRABLE). Purement
                     consultatives ici, exactement comme Budget affaire et % déjà facturé le
                     sont en Forfaitaire : cette étape ne rejoue pas la saisie du pourcentage,
                     elle réaffiche puis réémet tel quel ce que la ligne porte déjà.
                     '—' pour une ligne ajoutée à la main ici, qui n'a aucun avancement.
                     Le Montant HT en découle et n'est donc PAS saisissable, exactement
                     comme en Forfaitaire : le serveur le recalcule de toute façon en
                     budgetAffaire × pctAFacturer / 100 dès que ces deux colonnes sont
                     renseignées (cf. InvoiceService.saveLines), donc un montant tapé ici
                     serait purement et simplement ignoré à l'enregistrement — et pire,
                     l'en-tête de la facture, lui calculé en quantity × unitRate, ne
                     concorderait plus avec le total de la ligne. Seule une ligne ajoutée
                     à la main (sans avancement) garde la saisie du montant : c'est le
                     seul cas où le serveur retient bien quantity × unitRate. -->
                <td class="td-computed">{{ livrableBudgetAffaireLabel(i) }}</td>
                <td class="td-computed">{{ livrablePctFactureLabel(i) }}</td>
                <td class="td-computed">{{ livrablePctAvancementLabel(i) }}</td>
                <td class="td-computed">{{ livrablePctAFacturerLabel(i) }}</td>
                @if (livrableHasAvancement(i)) {
                  <td class="td-computed">{{ formatAmount(lineHtLivrable(i)) }}</td>
                } @else {
                  <td>
                    <input type="number" formControlName="prixUnitaireHt" class="td-input td-num"
                      min="0" step="0.01" (input)="recalc(i)" />
                  </td>
                }
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
              } @else if (isTm()) {
                <td class="td-computed">{{ formatAmount(lineTtcTm(i)) }}</td>
              } @else if (isLivrable()) {
                <!-- Assis sur le même Montant HT que la colonne ci-dessus (budget ×
                     pctAFacturer / 100), pas sur le montant du contrôle : sans ça le TTC
                     affiché dériverait du Montant HT affiché. -->
                <td class="td-computed">{{ formatAmount(lineTtcLivrable(i)) }}</td>
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
          } @else if (isTm()) {
            <td colspan="6" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtcTm) }}</td>
          } @else if (isLivrable()) {
            <td colspan="6" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtcLivrable) }}</td>
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
      <button type="button" class="btn-next" (click)="next()" [disabled]="linesArray.length === 0 && expenseLinesArray.length === 0">
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
  /** Set when editing an existing draft — seeds the lines table(s) with its saved lines
   * instead of the usual single blank row, and preserves the T&M / Livrable period
   * unchanged (both modes get one from the server at generation time). */
  initialLines = input<StepLinesValue | null>(null);
  /** True only when editing an existing invoice (route has an id) — passed down from
   * invoice-new.component.ts's editInvoiceId(), which resolves synchronously at
   * construction, unlike initialLines() which only resolves later even in edit mode.
   * Needed so a brand-new FORFAIT/REGIE/LIVRABLE invoice never starts with the usual
   * default blank manual line — see the constructor effect below. */
  isEditMode = input<boolean>(false);
  prevStep    = output<void>();
  nextStep    = output<StepLinesValue>();

  readonly tvaRates = TVA_RATES;

  /** Données chargées depuis GET /invoices/affaire/{id}/progress — null hors mode AV */
  readonly progress = signal<{ budgetTotal: number; pctFacture: number } | null>(null);

  /** Vrai si l'affaire est en mode Forfaitaire / Avancement (AV) */
  readonly isAv = computed(() => this.affaireData().billingMode === 'FORFAIT');

  /** Vrai si l'affaire est en mode Temps & Moyens (T&M) — une ligne T&M ici vient
   * toujours d'un WIP déjà validé (montant déjà calculé côté serveur), jamais saisie à la
   * main : la période facturée est donc préservée telle quelle, pas éditable dans cette
   * étape (cf. initialPeriodFrom/To ci-dessous). */
  readonly isTm = computed(() => this.affaireData().billingMode === 'REGIE');

  /** Vrai si l'affaire est en mode Livrable — une ligne ici vient toujours d'une
   * génération groupée déjà calculée côté serveur (LivrableBillingService), jamais saisie
   * à la main. Contrairement au T&M, une ligne Livrable porte de VRAIES colonnes
   * d'avancement : chaque document suit son propre pourcentage cumulé facturé, exactement
   * la même relation qu'en Forfaitaire (pctAvancement = pctFacture + pctAFacturer) mais à
   * l'échelle d'un document plutôt que de l'affaire entière. Elles sont figées à la
   * génération de la facture (DFValidationService.buildInvoiceLine, branche LIVRABLE,
   * depuis pctPrecedent/pctSaisi de la BillingLine et le budget alloué du livrable) :
   * cette étape les affiche et les réémet telles quelles, sans jamais les recalculer —
   * sans cette branche, rouvrir et sauvegarder l'étape Lignes d'une facture Livrable
   * effacerait son suivi d'avancement réel (elle tomberait dans la branche générique, qui
   * n'inclut pas ces colonnes du tout). */
  readonly isLivrable = computed(() => this.affaireData().billingMode === 'LIVRABLE');

  private readonly initialPeriodFrom = signal<string | null>(null);
  private readonly initialPeriodTo   = signal<string | null>(null);

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
      const rmbOrAv = this.isAv() || this.isTm() || this.isLivrable();
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

    // Brand-new invoice (not editing) for a real billing mode: FORFAIT/REGIE/LIVRABLE
    // invoices are now WIP-only -- no default blank manual line, so the sole way to add a
    // line here is the reimbursable-expense picker (see the "Ajouter une ligne" button's
    // new guard in the template, and the picker's own guard extended to all three modes).
    effect(() => {
      const realMode = this.isAv() || this.isTm() || this.isLivrable();
      if (!this.isEditMode() && realMode) {
        this.linesArray.clear();
      }
    });

    // Signal inputs are only bound by Angular AFTER the constructor runs — reading
    // initialLines() directly here would always see its default (null), never the real
    // edit-mode data passed down by the parent. Wrapping the seed in effect() ensures it
    // re-runs once the input actually resolves. Confirmed live 2026-08-28: an existing
    // T&M draft's line silently never seeded (blank Montant HT, 0% everywhere) despite
    // correct backend data — same latent bug would affect AV edit mode too, just never
    // surfaced there.
    let seeded = false;
    effect(() => {
      const initial = this.initialLines();
      if (initial && !seeded) {
        seeded = true;
        this.seedFromInitialLines(initial);
      }
    });
  }

  /**
   * Edit mode: replaces the default single blank row with the invoice's actual saved
   * lines. AV lines are told apart from AV's own flat reimbursable-expense lines by
   * `pctAvancement` being set (see `next()` below, which builds them the same way on
   * save) — reimbursable lines never carry an avancement percentage.
   */
  private seedFromInitialLines(initial: StepLinesValue): void {
    if (initial.lines.length === 0) return;

    this.linesArray.clear();
    this.expenseLinesArray.clear();

    for (const l of initial.lines) {
      if (this.isAv() && l.pctAvancement == null && l.sourceExpenseId != null) {
        const g = this.newExpenseLine();
        g.patchValue({
          description:     l.description,
          prixUnitaireHt:  l.unitRate,
          tauxTva:         l.vatRatePct,
          sourceExpenseId: l.sourceExpenseId,
        });
        this.expenseLinesArray.push(g);
      } else {
        const g = this.newLine();
        g.patchValue({
          description:     l.description,
          quantite:        l.quantity,
          prixUnitaireHt:  l.unitRate,
          tauxTva:         l.vatRatePct,
          pctAvancement:   l.pctAvancement ?? null,
          // Chargées pour le mode Livrable, qui les affiche et les réémet telles quelles
          // (cf. isLivrable()). Inertes dans les autres modes : le Forfaitaire prend son
          // budget et son % déjà facturé dans `progress()`, le T&M les fixe à 100 % et le
          // mode standard n'a pas ces colonnes du tout.
          budgetAffaire:   l.budgetAffaire ?? null,
          pctFacture:      l.pctFacture    ?? null,
          pctAFacturer:    l.pctAFacturer  ?? null,
          sourceExpenseId: l.sourceExpenseId ?? null,
          profileUserId:   l.profileUserId ?? null,
        });
        this.linesArray.push(g);
      }
    }
    if (this.linesArray.length === 0) this.linesArray.push(this.newLine());

    // T&M ET Livrable : le serveur renseigne periodFrom/periodTo à la génération dans les
    // deux cas (cf. DFValidationService.generateFromBillingLine[s]), et cette étape ne fait
    // que les préserver. Ne les mémoriser qu'en T&M revenait à effacer la période facturée
    // d'une facture Livrable au premier réenregistrement depuis ce wizard : `next()` ne
    // pouvait plus la réémettre, et step-recap la transmet telle quelle dans la requête.
    if (this.isTm() || this.isLivrable()) {
      this.initialPeriodFrom.set(initial.periodFrom ?? null);
      this.initialPeriodTo.set(initial.periodTo ?? null);
    }
    this.linesVersion.update(v => v + 1);
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
      // Mode Livrable uniquement : les trois autres colonnes d'avancement de la ligne,
      // telles que le serveur les a calculées à la génération de la facture. Sans ces
      // contrôles, `seedFromInitialLines` n'avait nulle part où les charger et `next()`
      // n'avait rien à réémettre — d'où les 100 % codés en dur qu'ils remplacent.
      // Ni validateur ni valeur par défaut : le mode Forfaitaire lit son budget et son
      // % déjà facturé depuis `progress()` (échelle affaire) et ignore ces contrôles,
      // le mode T&M et le mode standard aussi — les ajouter ne change donc rien pour eux.
      budgetAffaire:    [null as number | null],
      pctFacture:       [null as number | null],
      pctAFacturer:     [null as number | null],
      tauxTva:          [19],
      sourceExpenseId:  [null as number | null],
      profileUserId:    [null as number | null],
    });
  }

  // ── Livrable — colonnes d'avancement de la ligne (lecture seule) ─────────────────
  //
  // Lues sur le FormGroup de la ligne, jamais recalculées : elles ont été fixées une
  // seule fois côté serveur à la génération de la facture (cf. isLivrable() plus haut).
  // `null` = ligne sans avancement (ajoutée à la main dans cette étape) → affichée '—'.

  private livrableAvancement(
    i: number,
    key: 'budgetAffaire' | 'pctFacture' | 'pctAvancement' | 'pctAFacturer',
  ): number | null {
    const v = (this.linesArray.at(i) as FormGroup).get(key)?.value;
    return v == null || v === '' ? null : Number(v);
  }

  livrableBudgetAffaireLabel(i: number): string {
    const v = this.livrableAvancement(i, 'budgetAffaire');
    return v == null ? '—' : this.formatAmount(v);
  }

  livrablePctFactureLabel(i: number): string {
    const v = this.livrableAvancement(i, 'pctFacture');
    return v == null ? '—' : this.formatPct(v);
  }

  livrablePctAvancementLabel(i: number): string {
    const v = this.livrableAvancement(i, 'pctAvancement');
    return v == null ? '—' : this.formatPct(v);
  }

  livrablePctAFacturerLabel(i: number): string {
    const v = this.livrableAvancement(i, 'pctAFacturer');
    return v == null ? '—' : this.formatPct(v);
  }

  /**
   * Vrai quand la ligne porte les DEUX colonnes dont le serveur dérive son total —
   * exactement la condition qu'il teste lui-même (`InvoiceService.saveLines` : lineTotal
   * = budgetAffaire × pctAFacturer / 100 si les deux sont renseignées, sinon quantity ×
   * unitRate). Faux pour une ligne ajoutée à la main dans cette étape, qui n'en a aucune :
   * elle garde donc la saisie du montant, seul cas où le serveur la retient.
   */
  livrableHasAvancement(i: number): boolean {
    return this.livrableAvancement(i, 'budgetAffaire') != null
        && this.livrableAvancement(i, 'pctAFacturer')  != null;
  }

  /**
   * Montant HT d'une ligne Livrable = budgetAffaire × pctAFacturer / 100 — la formule du
   * serveur, reproduite à l'identique pour que l'écran montre le montant qui sera
   * réellement enregistré, et non celui du contrôle `prixUnitaireHt` (que le serveur
   * ignore dès que la ligne a son avancement). Même rôle que `lineHtAv` en Forfaitaire.
   * Ligne ajoutée à la main : pas d'avancement, le montant saisi fait foi côté serveur
   * comme ici.
   */
  lineHtLivrable(i: number): number {
    if (!this.livrableHasAvancement(i)) return this.lineHtTm(i);
    const budget = this.livrableAvancement(i, 'budgetAffaire') ?? 0;
    const pct    = this.livrableAvancement(i, 'pctAFacturer')  ?? 0;
    return budget * pct / 100;
  }

  lineTtcLivrable(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return this.lineHtLivrable(i) * (1 + (g.value.tauxTva ?? 0) / 100);
  }

  get totalTtcLivrable(): number {
    return this.linesArray.controls.reduce((s, _, i) => s + this.lineTtcLivrable(i), 0);
  }

  // ── T&M et Livrable — calculs sur la ligne au montant déjà arrêté ───────────────
  //
  // Partagés par les deux modes : dans les deux cas le montant de la ligne a été calculé
  // côté serveur (WIP validé en T&M, % du budget du document en Livrable) et se saisit
  // directement, sans Qté × PU. Seules les colonnes d'avancement diffèrent — 100 % partout
  // en T&M, valeurs réelles de la ligne en Livrable (cf. le template).

  /** Montant HT = le montant saisi directement. En T&M, Budget affaire l'égale toujours
   * (cf. commentaire dans le template) ; en Livrable, Budget affaire est celui du document
   * et n'a aucun lien avec ce getter. */
  lineHtTm(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return g.value.prixUnitaireHt ?? 0;
  }

  lineTtcTm(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return this.lineHtTm(i) * (1 + (g.value.tauxTva ?? 0) / 100);
  }

  get totalTtcTm(): number {
    return this.linesArray.controls.reduce((s, _, i) => s + this.lineTtcTm(i), 0);
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
    } else if (this.isTm()) {
      // Les trois pourcentages sont toujours 100 % (une ligne T&M = la totalité du WIP
      // déjà calculé pour sa période) — Budget affaire égale toujours le montant saisi,
      // cf. template.
      const tmLines = (this.linesArray.value as {
        description: string; prixUnitaireHt: number; tauxTva: number;
      }[]).map(l => {
        const montant = l.prixUnitaireHt ?? 0;
        return {
          description:   l.description,
          quantity:      1,          // rétrocompat : quantity=1, unitRate=montant
          unitRate:      montant,
          vatRatePct:    l.tauxTva,
          budgetAffaire: montant,
          pctFacture:    100,
          pctAvancement: 100,
          pctAFacturer:  100,
        };
      });
      this.nextStep.emit({
        lines: tmLines,
        periodFrom: this.initialPeriodFrom(),
        periodTo:   this.initialPeriodTo(),
      });
    } else if (this.isLivrable()) {
      // Chaque ligne (un livrable groupé dans la facture) porte un VRAI pourcentage du
      // budget de son document : le DF l'a saisi dans l'onglet WIP avant que la facture
      // existe, et le serveur en a dérivé les quatre colonnes une fois pour toutes à la
      // génération (DFValidationService.buildInvoiceLine, branche LIVRABLE). Cette étape
      // les réémet donc TELLES QUELLES, sans rien recalculer : les figer à 100 % — ce
      // qu'elle faisait quand tout livrable se facturait forcément à 100 % — écrasait
      // silencieusement le suivi d'avancement du document dès qu'on repassait par ici,
      // alors que la fiche facture, l'export PDF et la réconciliation
      // AffaireLivrable.pctFacture le relisent tel quel.
      // `undefined` (et non 0) quand la ligne n'a pas d'avancement — une ligne ajoutée à
      // la main ici : le backend retombe alors sur quantity × unitRate pour son total,
      // au lieu de le calculer comme budgetAffaire × pctAFacturer / 100.
      // `unitRate` porte le montant CALCULÉ (lineHtLivrable), pas le contenu du contrôle,
      // pour la même raison qu'en Forfaitaire : le total de la ligne sera dérivé de
      // budgetAffaire × pctAFacturer côté serveur alors que l'en-tête de la facture se
      // calcule, lui, en quantity × unitRate (cf. InvoiceService.computeSubtotal) — les
      // faire partir de la même valeur est ce qui garantit qu'ils concordent.
      const livrableLines = (this.linesArray.value as {
        description: string; prixUnitaireHt: number; tauxTva: number;
        budgetAffaire: number | null; pctFacture: number | null;
        pctAvancement: number | null; pctAFacturer: number | null;
      }[]).map((l, i) => ({
        description:   l.description,
        quantity:      1,          // rétrocompat : quantity=1, unitRate=montant
        unitRate:      this.lineHtLivrable(i),
        vatRatePct:    l.tauxTva,
        budgetAffaire: l.budgetAffaire ?? undefined,
        pctFacture:    l.pctFacture    ?? undefined,
        pctAvancement: l.pctAvancement ?? undefined,
        pctAFacturer:  l.pctAFacturer  ?? undefined,
      }));
      this.nextStep.emit({
        lines: livrableLines,
        // Période de génération du lot, telle que chargée — même raison qu'en T&M : elle
        // vient du serveur et cette étape ne la rejoue pas (cf. seedFromInitialLines).
        periodFrom: this.initialPeriodFrom(),
        periodTo:   this.initialPeriodTo(),
      });
    } else {
      this.nextStep.emit({
        lines: (this.linesArray.value as {
          description: string; quantite: number; prixUnitaireHt: number; tauxTva: number;
          sourceExpenseId: number | null; profileUserId: number | null;
        }[]).map(l => ({
          description:     l.description,
          quantity:        l.quantite,
          unitRate:        l.prixUnitaireHt,
          vatRatePct:      l.tauxTva,
          sourceExpenseId: l.sourceExpenseId ?? undefined,
          profileUserId:   l.profileUserId ?? undefined,
        })),
        periodFrom: null,
        periodTo:   null,
      });
    }
  }

  // ── Formatage ────────────────────────────────────────────────────────────────

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: this.affaireData().currency ?? 'TND',
      minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v);
  }

  formatPct(v: number): string {
    return v.toFixed(2) + ' %';
  }
}
