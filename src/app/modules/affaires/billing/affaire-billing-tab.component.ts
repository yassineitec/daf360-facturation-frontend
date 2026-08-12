import { Component, Input }      from '@angular/core';
import { TranslatePipe }         from '@ngx-translate/core';
import { AffaireDetail }         from '../affaire.model';
import { BillingAvComponent }    from './modes/billing-av.component';
import { BillingJalComponent }   from './modes/billing-jal.component';
import { BillingTmComponent }    from './modes/billing-tm.component';
import { BillingCpComponent }    from './modes/billing-cp.component';
import { BillingRmbComponent }   from './modes/billing-rmb.component';

/**
 * Onglet « Facturation » de la fiche affaire : un panneau par mode.
 *
 * ⚠️ LIVRABLE pointe sur le panneau des JALONS, qui lit /affaires/{id}/jalons : une
 * affaire « livrables » n'a pas de jalons, ce panneau est donc VIDE. Ce n'est pas une
 * régression — LIVRABLE était enregistré sous JAL et tombait déjà ici. La chaîne de
 * facturation des livrables (lignes issues de la table affaire_livrables) reste à
 * écrire ; le cas LIVRABLE évite seulement que la migration JAL → LIVRABLE fasse
 * basculer l'onglet sur « mode inconnu ». Le cas JAL reste branché pour les affaires
 * antérieures à cette migration.
 *
 * Deux raisons de garder ces explications ICI et pas dans le template : le template est
 * une chaîne gabarit, où un accent grave la terminerait (UI-PLAYBOOK §10f) ; et le corps
 * d'un `@switch` n'accepte que des blocs `@case` / `@default`, pas un commentaire.
 */
@Component({
  selector: 'app-affaire-billing-tab',
  standalone: true,
  imports: [
    TranslatePipe,
    BillingAvComponent, BillingJalComponent, BillingTmComponent,
    BillingCpComponent, BillingRmbComponent,
  ],
  template: `
<div class="py-2">
  @switch (affaire.billingMode) {
    @case ('AV') {
      <app-billing-av [affaire]="affaire" />
    }
    @case ('LIVRABLE') {
      <app-billing-jal [affaire]="affaire" />
    }
    @case ('JAL') {
      <app-billing-jal [affaire]="affaire" />
    }
    @case ('TM') {
      <app-billing-tm [affaire]="affaire" />
    }
    @case ('CP') {
      <app-billing-cp [affaire]="affaire" />
    }
    @case ('RMB') {
      <app-billing-rmb [affaire]="affaire" />
    }
    @default {
      <div class="text-sm text-[#64748b] text-center py-6">
        {{ 'AFFAIRES.billing.tab.mode_unknown' | translate:{ mode: affaire.billingMode } }}
      </div>
    }
  }
</div>
  `,
})
export class AfaireBillingTabComponent {
  @Input({ required: true }) affaire!: AffaireDetail;
}
