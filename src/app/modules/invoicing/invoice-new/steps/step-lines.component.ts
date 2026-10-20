import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators, AbstractControl,
} from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  FormFieldComponent, FormFieldOptions, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { PendingCarryForwardDto } from '../../invoice.model';
import { StepAffaireValue } from './step-affaire.component';
import { InvoiceService } from '../../invoice.service';
import { BillingService, ExpenseDto } from '../../../affaires/billing/billing.service';
import { FactListService } from '../../../../core/fact-list.service';
import { ListValueDto } from '../../../cost/cost.model';
import { enumLabel, humanise } from '../../../../shared/enum-labels';
export interface StepLinesValue {
  lines: {
    description:    string;
    quantity:       number;
    unitRate:       number;
    vatRatePct:     number;
    // Avancement — présents en mode AV (Forfaitaire, calculé depuis le taux saisi),
    // Livrable (calculé par ligne/document côté serveur à la génération — cf.
    // isLivrable() plus bas), TS (calculé à la validation DF d'une déclaration
    // TsTauxAvancement — cf. isTsCarryForward()/tsHasAvancement() plus bas) et T&M
    // (WIP validé, avancement toujours fixé à 100 % — cf. isTm() plus bas)
    budgetAffaire?: number;
    pctFacture?:    number;
    pctAvancement?: number;
    pctAFacturer?:  number;
    // RMB — présent uniquement quand la ligne provient d'un frais remboursable pické
    sourceExpenseId?: number;
    // Combined (multi-affaire) invoices only -- see isCombined() further down (added in a
    // later task). Absent for every other mode.
    affaireId?:   number;
    billingMode?: string;
    // Carry-forward — sources attribuées à cette ligne (cf. PendingCarryForwardDto). Vide =
    // rien reporté ; une entrée = cas classique ; plusieurs = fusion de picks du même
    // contrat (cf. addSelectedCarryForward plus bas).
    sourceCarryForwards?: { sourceBillingLineId: number; amount: number }[];
    // T&M — collaborateur associé, présent uniquement en mode T&M
    profileUserId?: number;
    // Colonnes de déduction personnalisées — pourcentage 1-100 pour la colonne à la
    // position correspondante dans StepLinesValue.deductionColumns (index 0 ->
    // deductionPct1, etc.) Le libellé de chaque colonne est porté une seule fois au
    // niveau de la facture, pas répété par ligne.
    deductionPct1?: number;
    deductionPct2?: number;
    deductionPct3?: number;
  }[];
  // Période facturée — les heures récupérées en T&M, la période de génération du lot en
  // Livrable ; renseignée par le serveur à la génération dans les deux cas et simplement
  // préservée telle quelle par cette étape. Null dans les autres modes.
  periodFrom?: string | null;
  periodTo?:   string | null;
  /**
   * Colonnes de déduction définies sur cette facture — TOUJOURS exactement 3 positions
   * fixes (index 0 = colonne 1 = deductionPct1 sur chaque ligne, index 1 = colonne 2,
   * index 2 = colonne 3), jamais un tableau compacté. `null` à une position = cette
   * colonne n'est pas utilisée sur cette facture. Index fixe plutôt que tableau
   * dynamique : une colonne retirée puis une autre ajoutée ne doit JAMAIS glisser les
   * valeurs déjà saisies d'une colonne vers une autre, puisque chaque position est
   * câblée en dur à un champ `deductionPctN` précis côté lignes ET côté backend
   * (deductionLabel1/2/3, deductionPct1/2/3) — un tableau qui se recompacte à la
   * suppression désynchroniserait l'index affiché du champ réellement mis à jour.
   */
  deductionColumns?: (string | null)[];
}

@Component({
  selector: 'app-step-lines',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, FormFieldComponent, SelectComponent],
  template: `
<div class="step-lines">

  <div class="lines-header">
    <span class="section-title">{{ 'INVOICING.STEP_LINES.TITLE' | translate }}</span>
    <div class="lines-header-actions">
      @if ((!isAv() && !isTm() && !isLivrable() && !isTsCarryForward()) || isAcompte()) {
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
      @if (isAv() || isTm() || isLivrable() || isTsCarryForward()) {
        <button type="button" class="btn-add-line btn-add-rmb" (click)="toggleCarryForwardPicker()">
          {{ 'INVOICING.STEP_LINES.ADD_CARRY_FORWARD' | translate }}
        </button>
      }
    </div>
  </div>

  <div class="deduction-columns-bar">
    @for (col of deductionColumns(); track $index) {
      @if (col !== null) {
        <span class="deduction-chip">
          <input type="text" class="deduction-chip-input"
            [value]="col"
            (input)="renameDeductionColumn($index, $any($event.target).value)"
            placeholder="{{ 'INVOICING.STEP_LINES.DEDUCTION_LABEL_PLACEHOLDER' | translate }}" />
          <button type="button" class="deduction-chip-remove" (click)="removeDeductionColumn($index)">✕</button>
        </span>
      }
    }
    @if (deductionColumns().includes(null)) {
      <button type="button" class="btn-add-line btn-add-deduction" (click)="addDeductionColumn()">
        {{ 'INVOICING.STEP_LINES.ADD_DEDUCTION_COLUMN' | translate }}
      </button>
    }
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

  @if ((isAv() || isTm() || isLivrable() || isTsCarryForward()) && carryForwardPickerOpen()) {
    <div class="rmb-picker-panel">
      @if (pendingCarryForwardList().length === 0) {
        <p class="rmb-picker-empty">{{ 'INVOICING.STEP_LINES.CARRY_FORWARD_EMPTY' | translate }}</p>
      } @else {
        <div class="carry-forward-picker-row carry-forward-picker-row--header">
          <span>{{ 'INVOICING.STEP_LINES.CARRY_FORWARD_COL_MODE' | translate }}</span>
          <span>{{ 'INVOICING.STEP_LINES.CARRY_FORWARD_COL_PERIOD' | translate }}</span>
          <span class="rmb-picker-num">{{ 'INVOICING.STEP_LINES.CARRY_FORWARD_COL_AVAILABLE' | translate }}</span>
          <span class="rmb-picker-num">{{ 'INVOICING.STEP_LINES.CARRY_FORWARD_COL_AMOUNT' | translate }}</span>
        </div>
        @for (p of pendingCarryForwardList(); track p.id) {
          <div class="carry-forward-picker-row">
            <span>{{ billingModeLabel(p.billingMode) }}</span>
            <span>{{ formatDate(p.periodDateTo) }}</span>
            <span class="rmb-picker-num">{{ formatAmount(p.wipCarriedForward) }}</span>
            <input type="number" min="0" [max]="p.wipCarriedForward" step="0.001"
              [value]="carryForwardAmounts().get(p.id) ?? ''"
              (input)="setCarryForwardAmount(p.id, $event.target)" />
          </div>
        }
      }
      <div class="rmb-picker-actions">
        <button type="button" class="btn-back" (click)="closeCarryForwardPicker()">
          {{ 'INVOICING.STEP_LINES.REMBOURSABLE_CANCEL' | translate }}
        </button>
        <button type="button" class="btn-next" [disabled]="carryForwardAmounts().size === 0"
          (click)="addSelectedCarryForward()">
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
          @if (isAv() || isTm() || isLivrable() || isTsCarryForward() || isAcompte()) {
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
          @if (isAv() || isTm() || isLivrable() || isTsCarryForward() || isAcompte()) {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_TTC' | translate }}</th>
          } @else {
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_HT' | translate }}</th>
            <th class="col-num">{{ 'INVOICING.STEP_LINES.TOTAL_TTC' | translate }}</th>
          }
          @for (col of deductionColumns(); track $index) {
            @if (col !== null) {
              <th class="num deduction-col-header">{{ col || ('INVOICING.STEP_LINES.DEDUCTION_UNNAMED' | translate) }}</th>
            }
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
                <daf-form-field
                  [options]="{
                    placeholder: ('INVOICING.STEP_LINES.DESC_PLACEHOLDER' | translate),
                    error: lg.get('description')!.invalid && lg.get('description')!.touched
                      ? ('INVOICING.STEP_LINES.FIELD_REQUIRED' | translate) : undefined
                  }"
                  [value]="lg.get('description')!.value"
                  (valueChange)="setText(lg, 'description', $event)" />
                @if (carryForwardCount(i) > 1) {
                  <button type="button" class="carry-forward-toggle" (click)="toggleCarryForwardBreakdown(i)">
                    {{ 'INVOICING.STEP_LINES.CARRY_FORWARD_INCLUDED_COUNT' | translate: { count: carryForwardCount(i) } }}
                    {{ carryForwardBreakdownOpen().has(i) ? '▴' : '▾' }}
                  </button>
                  @if (carryForwardBreakdownOpen().has(i)) {
                    <ul class="carry-forward-breakdown">
                      @for (s of carryForwardSources(i); track s.sourceBillingLineId) {
                        <li>
                          <span>#{{ s.sourceBillingLineId }} — {{ formatAmount(s.amount) }}</span>
                          <button type="button" [title]="'INVOICING.STEP_LINES.CARRY_FORWARD_REMOVE_SOURCE' | translate"
                            (click)="removeCarryForwardSource(i, s.sourceBillingLineId)">✕</button>
                        </li>
                      }
                    </ul>
                  }
                }
              </td>

              @if (isAcompte()) {
                <!-- ACOMPTE : contrairement à AV/T&M/Livrable/TS, il n'y a aucun WIP validé
                     derrière cette ligne -- les trois colonnes sont de vraies saisies
                     utilisateur, synchronisées entre elles par setNum() (montant <-> %, dans
                     les deux sens). Seul Budget affaire (le contractAmount réel, fixé une
                     fois par newLine()) et % déjà facturé (toujours 0, pas de facturation
                     antérieure par construction) restent en lecture seule. -->
                <td class="td-computed">{{ formatAmount(lg.get('budgetAffaire')!.value) }}</td>
                <td class="td-computed">{{ formatPct(lg.get('pctFacture')!.value ?? 0) }}</td>
                <td>
                  <daf-form-field [options]="pctOptions"
                    [value]="lg.get('pctAvancement')!.value"
                    (valueChange)="setNum(lg, 'pctAvancement', $event)" />
                </td>
                <td>
                  <daf-form-field [options]="pctOptions"
                    [value]="lg.get('pctAFacturer')!.value"
                    (valueChange)="setNum(lg, 'pctAFacturer', $event)" />
                </td>
                <td>
                  <daf-form-field [options]="numOptions"
                    [value]="lg.get('prixUnitaireHt')!.value"
                    (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                </td>
              } @else if (isAv()) {
                <!-- Colonnes d'avancement : figées côté serveur à la génération de la facture depuis
                     un WIP validé (DFValidationService.buildInvoiceLine, branche FORFAIT) — cette étape
                     les affiche et les réémet telles quelles, sans jamais les recalculer, exactement
                     comme en Livrable (cf. isLivrable() plus bas). Recalculer ici depuis un état global
                     de l'affaire effacerait silencieusement une approbation client partielle
                     (ProgressBillingService.enterClientApprovedAmount) et refacturerait le solde déjà
                     mis de côté comme "à facturer plus tard" (wipCarriedForward). -->
                <td class="td-computed">{{ avBudgetAffaireLabel(i) }}</td>
                <td class="td-computed">{{ avPctFactureLabel(i) }}</td>
                <td class="td-computed">{{ avPctAvancementLabel(i) }}</td>
                <td class="td-computed">{{ avPctAFacturerLabel(i) }}</td>
                @if (avHasAvancement(i) && !amendMode()) {
                  <td class="td-computed">{{ formatAmount(lineHtAv(i)) }}</td>
                } @else {
                  <td>
                    <daf-form-field [options]="numOptions"
                      [value]="lg.get('prixUnitaireHt')!.value"
                      (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                  </td>
                }
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
                  <daf-form-field [options]="numOptions"
                    [value]="lg.get('prixUnitaireHt')!.value"
                    (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                </td>
              } @else if (isTsCarryForward()) {
                <!-- TS WIP : les quatre colonnes d'avancement portent de VRAIES valeurs,
                     calculées une seule fois côté serveur à la validation DF d'une
                     déclaration TsTauxAvancement (DFValidationService.buildInvoiceLine,
                     branche TS) -- exactement le même principe qu'en Forfaitaire (cf.
                     isAv() ci-dessus). Un solde TS repris via le picker de carry-forward
                     calcule ces mêmes colonnes côté serveur (InvoiceService.
                     toPendingCarryForwardDto, branche TS). '—' uniquement pour une
                     InvoiceLine historique persistée avant que cette branche ne calcule
                     de vraies valeurs. -->
                <td class="td-computed">{{ tsBudgetAffaireLabel(i) }}</td>
                <td class="td-computed">{{ tsPctFactureLabel(i) }}</td>
                <td class="td-computed">{{ tsPctAvancementLabel(i) }}</td>
                <td class="td-computed">{{ tsPctAFacturerLabel(i) }}</td>
                @if (tsHasAvancement(i) && !amendMode()) {
                  <td class="td-computed">{{ formatAmount(lineHtTm(i)) }}</td>
                } @else {
                  <td>
                    <daf-form-field [options]="numOptions"
                      [value]="lg.get('prixUnitaireHt')!.value"
                      (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                  </td>
                }
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
                     Le Montant HT reste NON saisissable en création/édition normale,
                     mais ce n'est plus parce que le serveur l'ignorerait : InvoiceService.
                     saveLines retient désormais TOUJOURS quantity × unitRate, y compris
                     pour une ligne d'avancement (budgetAffaire/pctFacture/pctAvancement/
                     pctAFacturer ne sont qu'un contexte d'affichage/audit figé, rejoué tel
                     quel — une ancienne dérive de quelques centimes avait justement été
                     causée par une re-dérivation depuis ces colonnes, d'où ce choix). Un
                     montant tapé ici serait donc bien pris en compte à l'enregistrement —
                     le champ reste simplement en lecture seule en mode normal par choix
                     d'UI/de workflow, pour empêcher une saisie qui ferait silencieusement
                     diverger la facture de la piste d'audit WIP/avancement. En amendMode
                     (correction d'une facture déjà ÉMISE), ce garde-fou n'a plus lieu
                     d'être : c'est précisément le but de ce mode qu'une correction
                     délibérée et tracée du montant soit possible, d'où le champ éditable
                     ci-dessous dans ce cas. -->
                <td class="td-computed">{{ livrableBudgetAffaireLabel(i) }}</td>
                <td class="td-computed">{{ livrablePctFactureLabel(i) }}</td>
                <td class="td-computed">{{ livrablePctAvancementLabel(i) }}</td>
                <td class="td-computed">{{ livrablePctAFacturerLabel(i) }}</td>
                @if (livrableHasAvancement(i) && !amendMode()) {
                  <td class="td-computed">{{ formatAmount(lineHtLivrable(i)) }}</td>
                } @else {
                  <td>
                    <daf-form-field [options]="numOptions"
                      [value]="lg.get('prixUnitaireHt')!.value"
                      (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                  </td>
                }
              } @else {
                <td>
                  <daf-form-field [options]="numOptions"
                    [value]="lg.get('quantite')!.value"
                    (valueChange)="setNum(lg, 'quantite', $event)" />
                </td>
                <td>
                  <daf-form-field [options]="numOptions"
                    [value]="lg.get('prixUnitaireHt')!.value"
                    (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                </td>
              }

              <!-- TVA (toujours présente) -->
              <td class="td-vat">
                <daf-select
                  [options]="vatRateOptions()"
                  [selected]="vatSelected(lg)"
                  [ariaLabel]="'INVOICING.STEP_LINES.VAT' | translate"
                  (selectedChange)="setNum(lg, 'tauxTva', $event[0])" />
              </td>

              @if (isAcompte()) {
                <!-- Même calcul que AV (HT = prixUnitaireHt tel quel, TTC = HT × (1+TVA)) --
                     réutilisé tel quel, ACOMPTE n'a pas de logique de montant qui lui soit
                     propre. -->
                <td class="td-computed">{{ formatAmount(lineTtcAv(i)) }}</td>
              } @else if (isAv()) {
                <td class="td-computed">{{ formatAmount(lineTtcAv(i)) }}</td>
              } @else if (isTm() || isTsCarryForward()) {
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

              @for (col of deductionColumns(); track $index) {
                @if (col !== null) {
                  <td class="num deduction-col-cell">
                    <daf-form-field [options]="pctOptions"
                      [value]="lg.get('deductionPct' + ($index + 1))!.value"
                      (valueChange)="setNum(lg, 'deductionPct' + ($index + 1), $event)" />
                    @if (lg.get('deductionPct' + ($index + 1))?.value) {
                      <span class="deduction-amount-preview">
                        -{{ formatAmount(lineDeductionAmount($any(lg), $index + 1, currentLineHt(i))) }}
                      </span>
                    }
                  </td>
                }
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
          @if (isAv() || isAcompte()) {
            <td colspan="6" class="totals-label">{{ 'INVOICING.STEP_LINES.TOTALS' | translate }}</td>
            <td class="total-ttc">{{ formatAmount(totalTtcAv) }}</td>
          } @else if (isTm() || isTsCarryForward()) {
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
            @for (col of deductionColumns(); track $index) {
              @if (col !== null) {
                <th class="num deduction-col-header">{{ col || ('INVOICING.STEP_LINES.DEDUCTION_UNNAMED' | translate) }}</th>
              }
            }
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          <ng-container formArrayName="expenseLines">
            @for (lg of expenseLinesArray.controls; track $index; let i = $index) {
              <tr [formGroupName]="i" class="line-row">
                <td>
                  <daf-form-field
                    [value]="lg.get('description')!.value"
                    (valueChange)="setText(lg, 'description', $event)" />
                </td>
                <td>
                  <daf-form-field [options]="numOptions"
                    [value]="lg.get('prixUnitaireHt')!.value"
                    (valueChange)="setNum(lg, 'prixUnitaireHt', $event)" />
                </td>
                <td class="td-vat">
                  <daf-select
                    [options]="vatRateOptions()"
                    [selected]="vatSelected(lg)"
                    [ariaLabel]="'INVOICING.STEP_LINES.VAT' | translate"
                    (selectedChange)="setNum(lg, 'tauxTva', $event[0])" />
                </td>
                <td class="td-computed">{{ formatAmount(lineTtcExpense(i)) }}</td>
                @for (col of deductionColumns(); track $index) {
                  @if (col !== null) {
                    <td class="num deduction-col-cell">
                      <daf-form-field [options]="pctOptions"
                        [value]="lg.get('deductionPct' + ($index + 1))!.value"
                        (valueChange)="setNum(lg, 'deductionPct' + ($index + 1), $event)" />
                      @if (lg.get('deductionPct' + ($index + 1))?.value) {
                        <span class="deduction-amount-preview">
                          -{{ formatAmount(lineDeductionAmount($any(lg), $index + 1, lineHtExpense(i))) }}
                        </span>
                      }
                    </td>
                  }
                }
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
  private readonly translate = inject(TranslateService);

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
  /** True only when amending an already-EMITTED/SENT invoice — set by
   * invoice-new.component.ts's amendMode signal. Lets the AV/Livrable "Montant HT" cell
   * render as an editable field instead of its usual read-only computed label, even for
   * lines that carry avancement data (see avHasAvancement/livrableHasAvancement below). */
  amendMode   = input<boolean>(false);
  prevStep    = output<void>();
  nextStep    = output<StepLinesValue>();

  /**
   * Référentiel VAT_RATE (configurable, chargé par pays) — remplace l'ancienne constante
   * `TVA_RATES` codée en dur. Chargé dès qu'un pays est connu (cf. l'effect dédié dans le
   * constructeur), quel que soit le mode de facturation : la TVA est universelle,
   * contrairement aux frais remboursables ci-dessous qui ne concernent qu'AV/T&M/Livrable.
   */
  private readonly vatRates = signal<ListValueDto[]>([]);
  readonly vatRateOptions = computed<SelectOption[]>(() => this.vatRates()
    .filter(r => r.ratePct != null)
    .map(r => ({ value: String(r.ratePct), label: `${r.ratePct}%` })));

  /** Champs numériques des tableaux de lignes (quantité, PU / montant HT). */
  readonly numOptions: FormFieldOptions = { type: 'number', align: 'end', placeholder: '0.00' };

  /** Colonnes de déduction custom — même daf-form-field que les autres champs numériques du
   * tableau (numOptions ci-dessus), suffixText: '%' plutôt qu'un '%' en dur dans le
   * placeholder : rendu par la lib à l'intérieur du champ, annoncé par le lecteur d'écran. */
  readonly pctOptions: FormFieldOptions = { type: 'number', align: 'end', placeholder: '0', suffixText: '%' };

  /** Valeur sélectionnée du daf-select TVA — ses options portent le taux en chaîne. */
  vatSelected(g: AbstractControl): string[] {
    const v = g.get('tauxTva')?.value;
    return v == null ? [] : [String(v)];
  }

  /**
   * Pont daf-form-field / daf-select → FormControl (ni l'un ni l'autre n'est un
   * ControlValueAccessor). daf-form-field émet toujours une chaîne, même en type
   * 'number' : son <input> ne reçoit pas le NumberValueAccessor, d'où la conversion.
   */
  setNum(g: AbstractControl, key: string, v: string | number | null): void {
    const c = g.get(key)!;
    c.setValue(v === '' || v == null ? null : Number(v));
    c.markAsTouched();
    // ACOMPTE : budgetAffaire reste fixe (le contractAmount réel de l'affaire, posé une fois
    // par newLine() ci-dessus) et pctFacture reste à 0 (aucun avancement réel antérieur, cas
    // par construction) -- Montant HT, % Avancement à date et % À facturer sont les trois
    // champs saisissables, synchronisés entre eux dans les DEUX sens : éditer l'un recalcule
    // les deux autres, pour qu'ils restent toujours cohérents avec le budget réel de l'affaire
    // (ex. budget 1 210 000 € : saisir 121 000 en Montant HT -> les deux % passent à 10 %, et
    // inversement saisir 10 % dans l'un des deux % -> l'autre % et le montant se recalculent).
    if (this.isAcompte() && (key === 'prixUnitaireHt' || key === 'pctAFacturer' || key === 'pctAvancement')) {
      const group = g as FormGroup;
      const budget = group.get('budgetAffaire')?.value;
      const pctFacture = group.get('pctFacture')?.value ?? 0;
      if (budget != null && budget > 0) {
        if (key === 'prixUnitaireHt') {
          const amount = c.value ?? 0;
          const pctAFacturer = amount * 100 / budget;
          group.get('pctAFacturer')?.setValue(pctAFacturer);
          group.get('pctAvancement')?.setValue(pctFacture + pctAFacturer);
        } else {
          // key === 'pctAFacturer' || key === 'pctAvancement' -- les deux représentent le
          // même delta à facturer ici (pctFacture est toujours 0), donc l'un recalcule
          // directement l'autre, puis le montant correspondant.
          const pctAFacturer = key === 'pctAFacturer' ? (c.value ?? 0) : (c.value ?? 0) - pctFacture;
          group.get('pctAFacturer')?.setValue(pctAFacturer);
          group.get('pctAvancement')?.setValue(pctFacture + pctAFacturer);
          group.get('prixUnitaireHt')?.setValue(budget * pctAFacturer / 100);
        }
      }
    }
  }

  /** Plafonné à 255 (colonne description) — l'ancien maxlength natif, sans le compteur
   * que daf-form-field afficherait sous chaque cellule avec `maxLength`. */
  setText(g: AbstractControl, key: string, v: string | number | null): void {
    const c = g.get(key)!;
    c.setValue(v == null ? '' : String(v).slice(0, 255));
    c.markAsTouched();
  }

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

  /** Vrai pour une facture créée spécifiquement pour solder un reliquat TS non facturé
   * (voir step-affaire.component's "Facturer le solde TS" toggle) — ne construit jamais de
   * ligne à la main, uniquement via le picker de solde non facturé ci-dessous, réutilisé
   * tel quel (PendingCarryForwardDto porte déjà son propre billingMode="TS"). Les lignes
   * utilisent la branche standard (Qté/PU HT) du tableau, qui convient telle quelle. */
  readonly isTsCarryForward = computed(() => this.affaireData().billingMode === 'TS');

  /** Vrai pour une facture d'ACOMPTE (avance client) — autorisée à porter une ligne saisie
   * à la main quel que soit le mode de facturation de l'affaire (voir, dans le dépôt
   * daf360-facturation-service, docs/superpowers/specs/2026-10-19-advance-invoice-design.md).
   * Contrairement à isAv/isTm/isLivrable/isTsCarryForward ci-dessus, ce signal lit
   * invoiceType et non billingMode : une facture ACOMPTE garde le mode de facturation normal
   * de l'affaire, seule sa ligne diffère. */
  readonly isAcompte = computed(() => this.affaireData().invoiceType === 'ACOMPTE');

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

  // ── Picker de solde WIP non facturé (carry-forward) ───────────────────────────

  private readonly pendingCarryForward = signal<PendingCarryForwardDto[]>([]);
  /** The SAME affaire's TS balance, fetched in parallel so it shows up in the SAME picker
   * as the affaire's own mode's remainders (see pendingCarryForwardList below) — empty
   * when this invoice is already dedicated to TS (isTsCarryForward()), since that case's
   * normal fetch above already covers it. */
  private readonly pendingTsCarryForwardExtra = signal<PendingCarryForwardDto[]>([]);

  readonly carryForwardPickerOpen = signal(false);
  /** Montant choisi par ligne en attente, indexé par BillingLine.id — pas un Set comme
   * selectedExpenseIds : chaque pick porte aussi un montant saisi par l'utilisateur (le
   * pick partiel est permis, contrairement au pick tout-ou-rien des remboursables). */
  readonly carryForwardAmounts = signal<Map<number, number>>(new Map());

  constructor() {
    // Charge le référentiel VAT_RATE dès qu'un pays est connu — contrairement à l'effect
    // suivant (frais remboursables), PAS limité à AV/T&M/Livrable : la TVA est universelle,
    // le mode standard/RMB a lui aussi besoin d'un dropdown de taux fonctionnel.
    effect(() => {
      const aff = this.affaireData();
      if (aff.paysId) {
        this.listSvc.getListValues('VAT_RATE', aff.paysId).subscribe({
          next:  v  => this.vatRates.set(v),
          error: () => this.vatRates.set([]),
        });
      } else {
        this.vatRates.set([]);
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

      // VAT_RATE : chargé dès qu'un pays est connu, quel que soit le mode de facturation —
      // contrairement au bloc ci-dessus (EXPENSE_CATEGORY), le sélecteur TVA est affiché
      // dans TOUS les modes (y compris standard/RMB), donc ce fetch ne peut pas dépendre de
      // `rmbOrAv`. Même style de gestion d'erreur : un échec retombe sur [] plutôt que de
      // bloquer le rendu.
      if (aff.paysId) {
        this.listSvc.getListValues('VAT_RATE', aff.paysId).subscribe({
          next:  v  => this.vatRates.set(v),
          error: () => this.vatRates.set([]),
        });
      } else {
        this.vatRates.set([]);
      }
    });

    // Charge le solde WIP non facturé restant (carry-forward) dès qu'on est dans un des
    // trois modes réels avec une affaire sélectionnée — même déclencheur que le
    // chargement des frais remboursables ci-dessus.
    effect(() => {
      const anyRealMode = this.isAv() || this.isTm() || this.isLivrable() || this.isTsCarryForward();
      const aff = this.affaireData();
      if (anyRealMode && aff.affaireId) {
        // TS n'est jamais le mode propre de l'affaire (toujours FORFAIT/REGIE/LIVRABLE) --
        // override explicite nécessaire ici ; les 3 modes réels continuent de laisser le
        // backend déduire le mode depuis l'affaire elle-même, comportement inchangé.
        const modeOverride = this.isTsCarryForward() ? 'TS' : undefined;
        this.svc.getPendingCarryForward(aff.affaireId, modeOverride).subscribe({
          next:  p  => this.pendingCarryForward.set(p),
          error: () => this.pendingCarryForward.set([]),
        });
        // Le solde TS de cette affaire est fusionné dans le MÊME picker "Ajouter un solde
        // WIP non facturé" plutôt que de rester caché derrière la case "Facturer le solde
        // TS" de l'étape Affaire — un utilisateur ne la trouvait pas depuis l'étape Lignes
        // (voir conversation). Même endpoint que la ligne ci-dessus, juste avec l'override
        // explicite -- pas la peine de le refaire si cette facture EST déjà dédiée au TS
        // (le fetch ci-dessus le couvre déjà).
        if (!this.isTsCarryForward()) {
          this.svc.getPendingCarryForward(aff.affaireId, 'TS').subscribe({
            next:  p  => this.pendingTsCarryForwardExtra.set(p),
            error: () => this.pendingTsCarryForwardExtra.set([]),
          });
        } else {
          this.pendingTsCarryForwardExtra.set([]);
        }
      } else {
        this.pendingCarryForward.set([]);
        this.pendingTsCarryForwardExtra.set([]);
        this.carryForwardPickerOpen.set(false);
        this.carryForwardAmounts.set(new Map());
      }
    });

    // Brand-new invoice (not editing) for a real billing mode: FORFAIT/REGIE/LIVRABLE
    // invoices are now WIP-only -- no default blank manual line, so the sole way to add a
    // line here is the reimbursable-expense picker (see the "Ajouter une ligne" button's
    // new guard in the template, and the picker's own guard extended to all three modes).
    effect(() => {
      const realMode = this.isAv() || this.isTm() || this.isLivrable() || this.isTsCarryForward();
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

    // ACOMPTE, nouvelle facture (pas édition -- seedFromInitialLines() prend déjà le relais
    // avec les vraies lignes sauvegardées dans ce cas) : la toute première ligne a forcément
    // démarré avec budgetAffaire=null, créée par l'initialiseur de `form` plus bas avant que
    // affaireData() ne soit disponible (voir affaireDataOrNull()). Dès que l'input est
    // effectivement reçu, complète cette ligne une seule fois (le garde `== null` empêche
    // d'écraser une valeur que l'utilisateur aurait déjà pu modifier entretemps).
    effect(() => {
      const data = this.affaireData();
      if (this.isEditMode() || data.invoiceType !== 'ACOMPTE') return;
      const only = this.linesArray.length === 1 ? (this.linesArray.at(0) as FormGroup) : null;
      if (only && only.get('budgetAffaire')?.value == null) {
        const budget = data.contractAmount ?? 0;
        only.patchValue({ budgetAffaire: budget, pctFacture: 0, pctAFacturer: 0, pctAvancement: 0 });
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
    this.deductionColumns.set(
      initial.deductionColumns ? [...initial.deductionColumns] : [null, null, null]);

    if (initial.lines.length === 0) return;

    this.linesArray.clear();
    this.expenseLinesArray.clear();

    for (const l of initial.lines) {
      // Un solde WIP non facturé va dans `lines` (voir addSelectedCarryForward), pas dans
      // la table des remboursables : ce n'est pas un frais, c'est de l'avancement facturé
      // en retard — seul un VRAI remboursable (sourceExpenseId) va dans expenseLines.
      if (this.isAv() && l.pctAvancement == null && l.sourceExpenseId != null) {
        const g = this.newExpenseLine();
        g.patchValue({
          description:     l.description,
          prixUnitaireHt:  l.unitRate,
          tauxTva:         l.vatRatePct,
          sourceExpenseId: l.sourceExpenseId,
          sourceCarryForwards: l.sourceCarryForwards ?? [],
          deductionPct1:   l.deductionPct1 ?? null,
          deductionPct2:   l.deductionPct2 ?? null,
          deductionPct3:   l.deductionPct3 ?? null,
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
          // Chargées pour les modes Forfaitaire, Livrable et TS, qui les affichent et les
          // réémettent telles quelles (cf. isAv() / isLivrable() / isTsCarryForward()).
          // Inertes dans les autres modes : le T&M les fixe à 100 % et le mode standard
          // n'a pas ces colonnes du tout.
          budgetAffaire:   l.budgetAffaire ?? null,
          pctFacture:      l.pctFacture    ?? null,
          pctAFacturer:    l.pctAFacturer  ?? null,
          sourceExpenseId: l.sourceExpenseId ?? null,
          sourceCarryForwards: l.sourceCarryForwards ?? [],
          profileUserId:   l.profileUserId ?? null,
          deductionPct1:   l.deductionPct1 ?? null,
          deductionPct2:   l.deductionPct2 ?? null,
          deductionPct3:   l.deductionPct3 ?? null,
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
    if (this.isTm() || this.isLivrable() || this.isTsCarryForward()) {
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

  // ── Colonnes de déduction personnalisées (3 positions fixes) ──────────────────
  //
  // Partagées par TOUTE la facture (lines ET expenseLines), pas par mode de facturation :
  // le libellé se définit une seule fois ; chaque ligne porte ensuite sa propre valeur
  // (ou aucune) pour chaque colonne existante. Toujours exactement 3 positions — null =
  // colonne inutilisée — jamais un tableau qu'on recompacte en retirant un élément, pour
  // qu'une position d'index reste câblée pour toujours au même champ `deductionPctN`
  // (voir le commentaire sur StepLinesValue.deductionColumns pour le pourquoi).

  readonly deductionColumns = signal<(string | null)[]>([null, null, null]);

  addDeductionColumn(): void {
    const cols = this.deductionColumns();
    const freeIndex = cols.findIndex(c => c === null);
    if (freeIndex === -1) return; // déjà 3 colonnes actives
    const next = [...cols];
    next[freeIndex] = '';
    this.deductionColumns.set(next);
  }

  renameDeductionColumn(index: number, label: string): void {
    const next = [...this.deductionColumns()];
    next[index] = label;
    this.deductionColumns.set(next);
  }

  removeDeductionColumn(index: number): void {
    const next = [...this.deductionColumns()];
    next[index] = null;
    this.deductionColumns.set(next);
    // Efface toute valeur déjà saisie sous cette position sur TOUTES les lignes, pour
    // qu'une colonne réutilisée plus tard (ou une valeur restée orpheline) ne resurgisse
    // jamais silencieusement à la réactivation de cette même position.
    const controlName = `deductionPct${index + 1}`;
    [...this.linesArray.controls, ...this.expenseLinesArray.controls].forEach(c =>
      (c as FormGroup).get(controlName)?.setValue(null));
    this.linesVersion.update(v => v + 1);
  }

  /** Montant HT de la ligne i dans le mode courant du tableau principal — sert uniquement
   * à l'aperçu de déduction en direct (lineDeductionAmount), qui doit fonctionner de la
   * même façon quel que soit le mode de facturation actif, sans dupliquer la cellule de
   * déduction une fois par branche @if (isAv()/isTm()/isLivrable()/standard) comme le
   * fait la colonne Total TTC juste au-dessus dans le gabarit. */
  currentLineHt(i: number): number {
    if (this.isAcompte()) return this.lineHtAv(i);
    if (this.isAv()) return this.lineHtAv(i);
    if (this.isTm() || this.isTsCarryForward()) return this.lineHtTm(i);
    if (this.isLivrable()) return this.lineHtLivrable(i);
    return this.lineHt(i);
  }

  /** Montant déduit en direct pour l'affichage (même patron que lineHt()/lineTtc() pour la
   * TVA) — `lineHt` est le montant HT déjà calculé pour cette ligne dans le mode courant. */
  lineDeductionAmount(group: FormGroup, columnPosition: number, lineHt: number): number {
    const pct = group.get(`deductionPct${columnPosition}`)?.value;
    return pct ? lineHt * (pct / 100) : 0;
  }

  /** Safe read of the required `affaireData` input -- returns `null` instead of throwing
   * when called before Angular has bound it (see newLine()'s own first, field-initializer-
   * time call below). Every other call site (post-construction) gets the real value. */
  private affaireDataOrNull(): StepAffaireValue | null {
    try { return this.affaireData(); } catch { return null; }
  }

  newLine(): FormGroup {
    // ACOMPTE (avance client) : une ligne ajoutée ici n'a par définition aucun WIP derrière
    // elle, mais doit quand même porter de vraies valeurs d'avancement une fois soumise --
    // pas de "—" dans le tableau ni de null en base. Contrairement à T&M (budget affaire =
    // le montant de la ligne elle-même, toujours 100 %), une avance est un pourcentage RÉEL
    // du budget total de l'affaire -- budgetAffaire est donc le contractAmount réel de
    // l'affaire (fixe, jamais recalculé), pctFacture part de 0 (aucun avancement réel
    // antérieur, cas par construction : avant tout WIP), et pctAFacturer/pctAvancement sont
    // tenus synchronisés au montant saisi par setNum() plus bas, pas fixés à 100 %.
    //
    // affaireDataOrNull() (pas isAcompte()/affaireData() direct) : `form` plus bas appelle
    // newLine() dès son propre initialiseur de champ, donc AVANT qu'Angular n'ait injecté
    // affaireData() (un input signal required -- cf. le commentaire sur seedFromInitialLines
    // plus haut pour le même mécanisme). Lire un required input non encore défini lève une
    // exception synchrone qui casse toute la construction du composant (page "Lignes de
    // facturation" entièrement vide) -- confirmé en répro le 2026-10-20. L'effect juste
    // après le constructeur complète cette toute première ligne une fois affaireData() reçu.
    const data = this.affaireDataOrNull();
    const acompte = data?.invoiceType === 'ACOMPTE';
    const acompteBudget = acompte ? (data?.contractAmount ?? 0) : null;
    return this.fb.group({
      description:      ['', Validators.required],
      quantite:         [1,  [Validators.required, Validators.min(0.01)]],
      prixUnitaireHt:   [0,  [Validators.required, Validators.min(0)]],
      pctAvancement:    [acompte ? 0 : null],
      // Modes Forfaitaire, Livrable et TS : les trois autres colonnes d'avancement de la
      // ligne, telles que le serveur les a calculées à la génération de la facture. Sans
      // ces contrôles, `seedFromInitialLines` n'avait nulle part où les charger et
      // `next()` n'avait rien à réémettre. Ni validateur ni valeur par défaut : le mode
      // T&M et le mode standard les ignorent — les ajouter ne change donc rien pour eux.
      budgetAffaire:    [acompteBudget as number | null],
      pctFacture:       [acompte ? 0 : null as number | null],
      pctAFacturer:     [acompte ? 0 : null as number | null],
      tauxTva:          [19],
      sourceExpenseId:  [null as number | null],
      sourceCarryForwards: [[] as { sourceBillingLineId: number; amount: number }[]],
      profileUserId:    [null as number | null],
      // Toujours créés, que des colonnes de déduction soient actives ou non sur la
      // facture au moment où cette ligne est créée — un contrôle inutilisé ne coûte rien
      // et évite tout ajout/retrait dynamique de contrôle (source du bug de
      // désynchronisation évité par le modèle à 3 positions fixes, voir
      // StepLinesValue.deductionColumns).
      deductionPct1:    [null as number | null],
      deductionPct2:    [null as number | null],
      deductionPct3:    [null as number | null],
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
   * Montant HT d'une ligne Livrable — toujours le contrôle `prixUnitaireHt` de cette ligne.
   * Le serveur (InvoiceService.saveLines) retient désormais quantity × unitRate dans tous
   * les cas ; recalculer ici depuis budgetAffaire × pctAFacturer ne ferait que reproduire
   * l'ancienne dérive d'arrondi (pctAFacturer n'est qu'un pourcentage affiché, pas
   * l'inverse exact du montant d'origine). Même rôle que `lineHtAv` en Forfaitaire.
   */
  lineHtLivrable(i: number): number {
    return this.lineHtTm(i);
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
      sourceCarryForwards: [[] as { sourceBillingLineId: number; amount: number }[]],
      deductionPct1:    [null as number | null],
      deductionPct2:    [null as number | null],
      deductionPct3:    [null as number | null],
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

  // ── Picker de solde WIP non facturé (carry-forward) ───────────────────────────

  readonly pendingCarryForwardList = computed(() =>
    [...this.pendingCarryForward(), ...this.pendingTsCarryForwardExtra()]);

  toggleCarryForwardPicker(): void { this.carryForwardPickerOpen.update(v => !v); }

  closeCarryForwardPicker(): void {
    this.carryForwardPickerOpen.set(false);
    this.carryForwardAmounts.set(new Map());
  }

  /** True once this row's billingMode is 'TS' — a TS pick can sit in the same selection as a
   * FORFAIT/REGIE/LIVRABLE one (InvoiceService.linkAndReleaseCarriedForward stamps each
   * consumer BillingLine with its OWN source's billingMode, not the invoice's), used only to
   * give the resulting line a distinct description (see addSelectedCarryForward below). */
  isTsCarryForwardRow(p: PendingCarryForwardDto): boolean {
    return p.billingMode === 'TS';
  }

  /** Was a plain, untranslated `p.billingMode` before this picker could ever show more than
   * one mode's rows together — now that TS and the affaire's own mode share the same list
   * (see pendingCarryForwardList), a readable label matters for telling them apart. */
  billingModeLabel(mode: string): string {
    return enumLabel(this.translate, 'BILLING_MODE', mode);
  }

  setCarryForwardAmount(id: number, target: EventTarget | null): void {
    const raw = (target as HTMLInputElement | null)?.value ?? '';
    const value = raw === '' ? null : Number(raw);
    const m = new Map(this.carryForwardAmounts());
    if (value == null || Number.isNaN(value) || value <= 0) m.delete(id); else m.set(id, value);
    this.carryForwardAmounts.set(m);
  }

  /** True if lineGroup is safe to merge a pick of this contract (isTsRow) into: either it's
   * the untouched root declaration (no sourceCarryForwards yet -- always native by
   * construction, since a TS-sourced line is never created without one below) or every
   * carry-forward already merged into it shares the SAME contract as the new pick. Needed
   * because the SAME picker list mixes the affaire's own-mode balances with its separate TS
   * sub-contract's (see pendingCarryForwardList) -- a pick must never merge into a line built
   * from the OTHER contract. */
  private lineMatchesContract(lineGroup: FormGroup, isTsRow: boolean): boolean {
    // A TS-dedicated invoice never seeds a native root declaration (it's created empty,
    // populated only via this same picker -- see isTsCarryForward's own doc comment), so
    // EVERY line here is already guaranteed TS by construction. No further discrimination
    // needed -- and the check below can't provide any anyway, since the TS-extra pending
    // list it reads is deliberately kept empty for a TS-dedicated host (the affaire's own-
    // mode fetch already covers it there), which would otherwise wrongly read as "no line
    // here is TS."
    if (this.isTsCarryForward()) return true;
    const sources = (lineGroup.get('sourceCarryForwards')!.value ?? []) as { sourceBillingLineId: number }[];
    if (sources.length === 0) return !isTsRow;
    const tsIds = new Set(this.pendingTsCarryForwardExtra().map(p => p.id));
    return tsIds.has(sources[0].sourceBillingLineId) === isTsRow;
  }

  /** A same-contract pick (see lineMatchesContract) merges into the existing line instead of
   * becoming a new one — its amount and % à facturer fold into that line's own, and its
   * source is appended to the line's sourceCarryForwards so each original balance stays
   * individually visible/removable (see the breakdown template below). A different-contract
   * pick (e.g. the affaire's TS sub-contract balance on a non-TS invoice) always becomes its
   * own separate line, exactly as before. */
  addSelectedCarryForward(): void {
    const amounts = this.carryForwardAmounts();
    if (amounts.size === 0) return;

    if (this.linesArray.length === 1 && this.isDefaultBlankLine(this.linesArray.at(0) as FormGroup)) {
      this.linesArray.removeAt(0);
    }

    amounts.forEach((amount, id) => {
      const dto = this.pendingCarryForwardList().find(p => p.id === id);
      const isTsRow = dto ? this.isTsCarryForwardRow(dto) : false;
      const canMerge = isTsRow === this.isTsCarryForward();
      const targetLine = canMerge
        ? (this.linesArray.controls.find(c => this.lineMatchesContract(c as FormGroup, isTsRow)) as FormGroup | undefined) ?? null
        : null;

      if (targetLine) {
        const sources = [
          ...(targetLine.get('sourceCarryForwards')!.value ?? []),
          { sourceBillingLineId: id, amount },
        ];
        targetLine.get('sourceCarryForwards')!.setValue(sources);
        const combinedAmount = (targetLine.get('prixUnitaireHt')!.value ?? 0) + amount;
        targetLine.get('prixUnitaireHt')!.setValue(combinedAmount);
        const budgetAffaire = targetLine.get('budgetAffaire')!.value;
        if (budgetAffaire != null && budgetAffaire > 0) {
          targetLine.get('pctAFacturer')!.setValue(combinedAmount * 100 / budgetAffaire);
        }
        return;
      }

      const budgetAffaire = dto?.budgetAffaire ?? null;
      const pctAFacturer = (budgetAffaire != null && budgetAffaire > 0)
        ? amount * 100 / budgetAffaire
        : null;
      const label = isTsRow ? 'Solde TS non facturé #' : 'Solde WIP non facturé #';
      const g = this.newLine();
      g.patchValue({
        description:          label + id,
        quantite:              1,
        prixUnitaireHt:        amount,
        tauxTva:               0,
        sourceCarryForwards:   [{ sourceBillingLineId: id, amount }],
        budgetAffaire:         budgetAffaire,
        pctFacture:            dto?.pctFacture ?? null,
        pctAvancement:         dto?.pctAvancement ?? null,
        pctAFacturer:          pctAFacturer,
      });
      this.linesArray.push(g);
    });
    this.linesVersion.update(v => v + 1);
    this.closeCarryForwardPicker();
    this.carryForwardAmounts.set(new Map());
  }

  // ── Détail dépliable des soldes WIP fusionnés dans une ligne ──────────────────

  readonly carryForwardBreakdownOpen = signal<Set<number>>(new Set());

  toggleCarryForwardBreakdown(i: number): void {
    const s = new Set(this.carryForwardBreakdownOpen());
    if (s.has(i)) s.delete(i); else s.add(i);
    this.carryForwardBreakdownOpen.set(s);
  }

  carryForwardSources(i: number): { sourceBillingLineId: number; amount: number }[] {
    return (this.linesArray.at(i) as FormGroup).get('sourceCarryForwards')!.value ?? [];
  }

  carryForwardCount(i: number): number {
    return this.carryForwardSources(i).length;
  }

  /** Retire UNE SEULE source d'une ligne fusionnée (pas la ligne entière) — recalcule le
   * montant et le % à facturer de la ligne restante après coup. */
  removeCarryForwardSource(i: number, sourceBillingLineId: number): void {
    const g = this.linesArray.at(i) as FormGroup;
    const current = this.carryForwardSources(i);
    const removed = current.find(s => s.sourceBillingLineId === sourceBillingLineId);
    if (!removed) return;
    const remaining = current.filter(s => s.sourceBillingLineId !== sourceBillingLineId);
    g.get('sourceCarryForwards')!.setValue(remaining);
    const newAmount = (g.get('prixUnitaireHt')!.value ?? 0) - removed.amount;
    g.get('prixUnitaireHt')!.setValue(newAmount);
    const budgetAffaire = g.get('budgetAffaire')!.value;
    if (budgetAffaire != null && budgetAffaire > 0) {
      g.get('pctAFacturer')!.setValue(newAmount * 100 / budgetAffaire);
    }
    this.linesVersion.update(v => v + 1);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── Calculs mode AV ─────────────────────────────────────────────────────────
  //
  // Lues sur le FormGroup de la ligne, jamais recalculées depuis le progrès global de
  // l'affaire (progress()) : ce signal ignore qu'une ligne précise a pu être réduite par
  // une approbation client partielle (cf. ProgressBillingService.enterClientApprovedAmount)
  // ou qu'un solde a été mis de côté pour plus tard (wipCarriedForward). Les valeurs sont
  // fixées une seule fois côté serveur à la génération de la facture depuis un WIP validé
  // (DFValidationService.buildInvoiceLine, branche FORFAIT) — exactement le même principe
  // qu'en Livrable (cf. livrableAvancement plus haut), reproduit ici à l'identique.

  private avAvancement(
    i: number,
    key: 'budgetAffaire' | 'pctFacture' | 'pctAvancement' | 'pctAFacturer',
  ): number | null {
    const v = (this.linesArray.at(i) as FormGroup).get(key)?.value;
    return v == null || v === '' ? null : Number(v);
  }

  avBudgetAffaireLabel(i: number): string {
    const v = this.avAvancement(i, 'budgetAffaire');
    return v == null ? '—' : this.formatAmount(v);
  }

  avPctFactureLabel(i: number): string {
    const v = this.avAvancement(i, 'pctFacture');
    return v == null ? '—' : this.formatPct(v);
  }

  avPctAvancementLabel(i: number): string {
    const v = this.avAvancement(i, 'pctAvancement');
    return v == null ? '—' : this.formatPct(v);
  }

  avPctAFacturerLabel(i: number): string {
    const v = this.avAvancement(i, 'pctAFacturer');
    return v == null ? '—' : this.formatPct(v);
  }

  /** Vrai quand la ligne porte les deux colonnes dont le total dérive — c'est-à-dire une
   * ligne générée depuis un WIP validé (DFValidationService.buildInvoiceLine, branche
   * FORFAIT). Faux pour une ligne ajoutée à la main dans cette étape, qui garde alors la
   * saisie directe du montant — même logique que livrableHasAvancement. */
  avHasAvancement(i: number): boolean {
    return this.avAvancement(i, 'budgetAffaire') != null
        && this.avAvancement(i, 'pctAFacturer')  != null;
  }

  // ── Calculs mode TS — colonnes d'avancement de la ligne ─────────────────────────
  //
  // Lues sur le FormGroup de la ligne, jamais recalculées : fixées une seule fois côté
  // serveur à la validation DF d'une déclaration TsTauxAvancement (DFValidationService.
  // buildInvoiceLine, branche TS), exactement le même principe qu'en Forfaitaire (cf.
  // avAvancement ci-dessus). `null` quand la ligne n'a pas d'avancement réel -- soit un
  // solde TS repris via le picker de carry-forward dont le calcul a échoué pour une
  // raison quelconque, soit (cas historique) une InvoiceLine persistée avant que la
  // branche TS de buildInvoiceLine ne calcule de vraies valeurs -- affichée '—' dans ce
  // cas plutôt que le 100 % systématique erroné d'avant.

  private tsAvancement(
    i: number,
    key: 'budgetAffaire' | 'pctFacture' | 'pctAvancement' | 'pctAFacturer',
  ): number | null {
    const v = (this.linesArray.at(i) as FormGroup).get(key)?.value;
    return v == null || v === '' ? null : Number(v);
  }

  tsBudgetAffaireLabel(i: number): string {
    const v = this.tsAvancement(i, 'budgetAffaire');
    return v == null ? '—' : this.formatAmount(v);
  }

  tsPctFactureLabel(i: number): string {
    const v = this.tsAvancement(i, 'pctFacture');
    return v == null ? '—' : this.formatPct(v);
  }

  tsPctAvancementLabel(i: number): string {
    const v = this.tsAvancement(i, 'pctAvancement');
    return v == null ? '—' : this.formatPct(v);
  }

  tsPctAFacturerLabel(i: number): string {
    const v = this.tsAvancement(i, 'pctAFacturer');
    return v == null ? '—' : this.formatPct(v);
  }

  /** Vrai quand la ligne porte les deux colonnes dont le total dérive — c'est-à-dire une
   * ligne générée depuis une déclaration TS validée par un DF (DFValidationService.
   * buildInvoiceLine, branche TS) ou reprise via le picker de solde WIP non facturé
   * (InvoiceService.toPendingCarryForwardDto, branche TS) — les deux chemins calculent
   * désormais de vraies valeurs. Faux uniquement pour une InvoiceLine historique
   * persistée avant ce calcul, qui garde alors l'ancien repli (montant éditable, '—'
   * partout) plutôt que d'afficher un faux 100 %. */
  tsHasAvancement(i: number): boolean {
    return this.tsAvancement(i, 'budgetAffaire') != null
        && this.tsAvancement(i, 'pctAFacturer')  != null;
  }

  /** Montant HT — toujours le contrôle `prixUnitaireHt` de CETTE ligne, jamais recalculé
   * depuis budgetAffaire/pctAFacturer : ces deux champs sont un contexte d'affichage figé
   * (jamais le progrès global de l'affaire, qui ignore qu'une approbation client partielle
   * a pu réduire cette ligne précise — cf. ProgressBillingService.enterClientApprovedAmount),
   * mais pctAFacturer lui-même n'est qu'un pourcentage arrondi à l'affichage : recalculer
   * le montant à partir de lui ne reproduit pas forcément le montant exact d'origine
   * (dérive constatée de quelques centimes). `prixUnitaireHt` porte l'unique montant que
   * le serveur retient — c'est donc l'unique source ici, avec ou sans avancement. Mirrors
   * lineHtLivrable pour la même raison. */
  lineHtAv(i: number): number {
    return this.lineHtTm(i);
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

    const deductionColumns = this.deductionColumns();
    const dedFields = (l: { deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null }) => ({
      deductionPct1: l.deductionPct1 ?? undefined,
      deductionPct2: l.deductionPct2 ?? undefined,
      deductionPct3: l.deductionPct3 ?? undefined,
    });

    if (this.isAcompte()) {
      // ACOMPTE n'a pas de billingMode qui lui soit propre -- l'affaire porte FORFAIT/
      // RÉGIE/LIVRABLE/TS comme n'importe quelle autre, donc sans cette branche en premier
      // une avance sur affaire RÉGIE tomberait dans isTm() ci-dessous, qui fige les trois
      // pourcentages à 100 % quoi que l'utilisateur ait saisi -- faux pour une avance,
      // qui est un VRAI pourcentage du budget (cf. setNum()/newLine() plus haut). Réémet
      // donc budgetAffaire/pctFacture/pctAvancement/pctAFacturer tels quels, comme AV.
      const acompteLines = (this.linesArray.value as {
        description: string; tauxTva: number;
        budgetAffaire: number | null; pctFacture: number | null;
        pctAvancement: number | null; pctAFacturer: number | null;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
      }[])
        .map((l, i) => ({
          description:   l.description,
          quantity:      1,          // rétrocompat : quantity=1, unitRate=montantHt
          unitRate:      this.lineHtAv(i),
          vatRatePct:    l.tauxTva,
          budgetAffaire: l.budgetAffaire ?? undefined,
          pctFacture:    l.pctFacture    ?? undefined,
          pctAvancement: l.pctAvancement ?? undefined,
          pctAFacturer:  l.pctAFacturer  ?? undefined,
          ...dedFields(l),
        }));
      this.nextStep.emit({ lines: acompteLines, deductionColumns });
    } else if (this.isAv()) {
      // Colonnes d'avancement réémises TELLES QUELLES depuis les valeurs déjà seedées sur
      // chaque ligne (cf. avAvancement plus haut) — jamais recalculées depuis progress(),
      // qui ignore qu'une ligne précise a pu être réduite par une approbation client
      // partielle. Même pattern que livrableLines juste plus bas. Une ligne ajoutée à la
      // main garde `pctAvancement=null` en permanence (pas de WIP à tracer) et utilise la
      // saisie directe du montant à la place — donc pas de validation "champ requis" ici,
      // contrairement à l'ancien comportement (cf. Livrable, qui n'en a pas non plus).
      const avancementLines = (this.linesArray.value as {
        description: string; tauxTva: number; sourceExpenseId: number | null;
        sourceCarryForwards: { sourceBillingLineId: number; amount: number }[] | null;
        budgetAffaire: number | null; pctFacture: number | null;
        pctAvancement: number | null; pctAFacturer: number | null;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
      }[])
        .map((l, i) => ({
          description:     l.description,
          quantity:        1,          // rétrocompat : quantity=1, unitRate=montantHt
          unitRate:        this.lineHtAv(i),
          vatRatePct:      l.tauxTva,
          budgetAffaire:   l.budgetAffaire ?? undefined,
          pctFacture:      l.pctFacture    ?? undefined,
          pctAvancement:   l.pctAvancement ?? undefined,
          pctAFacturer:    l.pctAFacturer  ?? undefined,
          sourceExpenseId: l.sourceExpenseId ?? undefined,
          sourceCarryForwards: l.sourceCarryForwards ?? undefined,
          ...dedFields(l),
        }));

      // Frais remboursables pickés (table séparée) : montant plat, aucun champ
      // d'avancement — le backend prend la branche "quantity × unitRate" (le calcul
      // AV ne s'applique que quand budgetAffaire ET pctAFacturer sont renseignés,
      // cf. InvoiceService.saveLines côté service).
      const expenseLines = (this.expenseLinesArray.value as {
        description: string; prixUnitaireHt: number; tauxTva: number; sourceExpenseId: number | null;
        sourceCarryForwards: { sourceBillingLineId: number; amount: number }[] | null;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
      }[]).map(l => ({
        description:     l.description,
        quantity:        1,
        unitRate:        l.prixUnitaireHt,
        vatRatePct:      l.tauxTva,
        sourceExpenseId: l.sourceExpenseId ?? undefined,
        sourceCarryForwards: l.sourceCarryForwards ?? undefined,
        ...dedFields(l),
      }));

      this.nextStep.emit({ lines: [...avancementLines, ...expenseLines], deductionColumns });
    } else if (this.isTm()) {
      // Les trois pourcentages sont toujours 100 % (une ligne T&M = la totalité du WIP
      // déjà calculé pour sa période) — Budget affaire égale toujours le montant saisi,
      // cf. template.
      const tmLines = (this.linesArray.value as {
        description: string; prixUnitaireHt: number; tauxTva: number;
        sourceCarryForwards: { sourceBillingLineId: number; amount: number }[] | null;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
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
          sourceCarryForwards: l.sourceCarryForwards ?? undefined,
          ...dedFields(l),
        };
      });
      this.nextStep.emit({
        lines: tmLines,
        periodFrom: this.initialPeriodFrom(),
        periodTo:   this.initialPeriodTo(),
        deductionColumns,
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
        sourceCarryForwards: { sourceBillingLineId: number; amount: number }[] | null;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
      }[]).map((l, i) => ({
        description:   l.description,
        quantity:      1,          // rétrocompat : quantity=1, unitRate=montant
        unitRate:      this.lineHtLivrable(i),
        vatRatePct:    l.tauxTva,
        budgetAffaire: l.budgetAffaire ?? undefined,
        pctFacture:    l.pctFacture    ?? undefined,
        pctAvancement: l.pctAvancement ?? undefined,
        pctAFacturer:  l.pctAFacturer  ?? undefined,
        sourceCarryForwards: l.sourceCarryForwards ?? undefined,
        ...dedFields(l),
      }));
      this.nextStep.emit({
        lines: livrableLines,
        // Période de génération du lot, telle que chargée — même raison qu'en T&M : elle
        // vient du serveur et cette étape ne la rejoue pas (cf. seedFromInitialLines).
        periodFrom: this.initialPeriodFrom(),
        periodTo:   this.initialPeriodTo(),
        deductionColumns,
      });
    } else if (this.isTsCarryForward()) {
      // TS WIP billing lines: the four avancement columns carry REAL values computed
      // once server-side at DF validation of a TsTauxAvancement declaration
      // (DFValidationService.buildInvoiceLine, branche TS) or at carry-forward pickup
      // (InvoiceService.toPendingCarryForwardDto, branche TS) -- reread and reemitted
      // here exactly as-is, never recalculated, same principle as isAv() above. Carry
      // the period from the server-generated draft so it is preserved on re-save, same
      // as isTm() / isLivrable().
      const tsLines = (this.linesArray.value as {
        description: string; prixUnitaireHt: number; tauxTva: number;
        budgetAffaire: number | null; pctFacture: number | null;
        pctAvancement: number | null; pctAFacturer: number | null;
        sourceCarryForwards: { sourceBillingLineId: number; amount: number }[] | null;
        deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
      }[]).map((l, i) => ({
        description:   l.description,
        quantity:      1,
        unitRate:      this.lineHtTm(i),
        vatRatePct:    l.tauxTva,
        budgetAffaire: l.budgetAffaire ?? undefined,
        pctFacture:    l.pctFacture    ?? undefined,
        pctAvancement: l.pctAvancement ?? undefined,
        pctAFacturer:  l.pctAFacturer  ?? undefined,
        sourceCarryForwards: l.sourceCarryForwards ?? undefined,
        ...dedFields(l),
      }));
      this.nextStep.emit({
        lines: tsLines,
        periodFrom: this.initialPeriodFrom(),
        periodTo:   this.initialPeriodTo(),
        deductionColumns,
      });
    } else {
      this.nextStep.emit({
        lines: (this.linesArray.value as {
          description: string; quantite: number; prixUnitaireHt: number; tauxTva: number;
          sourceExpenseId: number | null; profileUserId: number | null;
          sourceCarryForwards: { sourceBillingLineId: number; amount: number }[] | null;
          deductionPct1?: number | null; deductionPct2?: number | null; deductionPct3?: number | null;
        }[]).map(l => ({
          description:     l.description,
          quantity:        l.quantite,
          unitRate:        l.prixUnitaireHt,
          vatRatePct:      l.tauxTva,
          sourceExpenseId: l.sourceExpenseId ?? undefined,
          sourceCarryForwards: l.sourceCarryForwards ?? undefined,
          profileUserId:   l.profileUserId ?? undefined,
          ...dedFields(l),
        })),
        periodFrom: null,
        periodTo:   null,
        deductionColumns,
      });
    }
  }

  // ── Formatage ────────────────────────────────────────────────────────────────

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: this.affaireData().currency ?? 'TND',
    }).format(v);
  }

  formatPct(v: number): string {
    return v.toFixed(2) + ' %';
  }
}
