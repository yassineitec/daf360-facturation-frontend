import { ChangeDetectionStrategy, Component, input, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AffaireDetail } from '../../affaire.model';
import { ExpenseFormComponent } from './expense-form.component';
import { ExpenseHistoryComponent } from './expense-history.component';

/**
 * Panneau « Remboursable » de l'onglet Facturation — désormais une simple composition
 * du formulaire de saisie et de l'historique.
 *
 * Il portait tout : formulaire à la main, tableau à la main, modale de refus à la main,
 * ~370 lignes et une trentaine de couleurs en dur. Les deux morceaux sont devenus des
 * composants réutilisables sur composants de la lib :
 *   · `app-expense-form`    — aussi utilisé seul dans la modale « Frais remboursables »
 *                             de la fiche affaire, où l'on ne veut QUE le formulaire ;
 *   · `app-expense-history` — aussi utilisé seul dans l'onglet « Frais ».
 *
 * Après un enregistrement, le formulaire émet et l'on appelle `load()` sur l'historique
 * — un appel direct via `viewChild`, plutôt qu'un canal partagé entre deux frères pour
 * un simple rechargement.
 */
@Component({
  selector: 'app-billing-rmb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ExpenseFormComponent, ExpenseHistoryComponent],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-8">

      <section class="flex flex-col gap-3">
        <p class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
          {{ 'AFFAIRES.EXPENSES.FORM.SUBMIT' | translate }}
        </p>
        <app-expense-form [affaire]="affaire()" (submitted)="onSubmitted()" />
      </section>

      <section class="flex flex-col gap-3">
        <p class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
          {{ 'AFFAIRES.EXPENSES.TAB' | translate }}
        </p>
        <app-expense-history [affaire]="affaire()" />
      </section>

    </div>
  `,
})
export class BillingRmbComponent {
  affaire = input.required<AffaireDetail>();

  private readonly history = viewChild(ExpenseHistoryComponent);

  onSubmitted(): void {
    this.history()?.load();
  }
}
