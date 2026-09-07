import { Component, Input }      from '@angular/core';
import { TranslatePipe }         from '@ngx-translate/core';
import { AffaireDetail }         from '../affaire.model';
import { BillingAvComponent }    from './modes/billing-av.component';
import { BillingJalComponent }   from './modes/billing-jal.component';
import { BillingTmComponent }    from './modes/billing-tm.component';

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
  ],
  template: `
<div class="py-2">
  @switch (affaire.billingMode) {
    @case ('FORFAIT') {
      <app-billing-av [affaire]="affaire" />
    }
    @case ('LIVRABLE') {
      <app-billing-jal [affaire]="affaire" />
    }
    @case ('REGIE') {
      <app-billing-tm [affaire]="affaire" />
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
